import re
import socket
import ssl
from collections.abc import Callable, Mapping
from ipaddress import AddressValueError, IPv4Address
from typing import Any, TypeVar

import routeros
from routeros.errors import DeviceError, LoginError, RouterOSError

from app.services.evaluation import (
    assess_association,
    assess_average_latency,
    assess_maximum_latency,
    assess_packet_loss,
    assess_signal,
    calculate_link_health,
)
from app.services.network_engine import (
    NetworkEngineUnavailableError,
    analyze_network_samples,
)
from app.models.mikrotik import (
    ARPValidation,
    BridgeInfo,
    BridgePort,
    ConnectivityProbe,
    ConnectivityRequest,
    ConnectivityValidation,
    DefaultRouteInfo,
    DeviceSummary,
    DiagnosticCheck,
    EthernetInterface,
    IPAddressInfo,
    MikroTikConnection,
    PingRequest,
    PingResult,
    StructuralDiagnostic,
    WiFiInterface,
    WiFiPeer,
)


CONNECTION_TIMEOUT_SECONDS = 5.0
WIFI_PACKAGES = ("wifi-qcom", "wifi-qcom-ac", "wifiwave2", "wireless")
WIFI_MENUS = {
    "wifi": "/interface/wifi/print",
    "wifiwave2": "/interface/wifiwave2/print",
    "wireless": "/interface/wireless/print",
}
REGISTRATION_MENUS = {
    "wifi": "/interface/wifi/registration-table/print",
    "wifiwave2": "/interface/wifiwave2/registration-table/print",
    "wireless": "/interface/wireless/registration-table/print",
}
TIME_FACTORS_MS = {
    "d": 86_400_000,
    "h": 3_600_000,
    "m": 60_000,
    "s": 1_000,
    "ms": 1,
    "us": 0.001,
    "ns": 0.000001,
}
ResultType = TypeVar("ResultType")


class MikroTikError(Exception):
    """Base error for friendly RouterOS error translation."""


class MikroTikAuthenticationError(MikroTikError):
    """The device rejected the supplied credentials."""


class MikroTikTimeoutError(MikroTikError):
    """The device did not respond within the configured timeout."""


class MikroTikTLSVerificationError(MikroTikError):
    """The TLS certificate could not be verified."""


class MikroTikConnectionError(MikroTikError):
    """The device could not be reached through the RouterOS API."""


class MikroTikResponseError(MikroTikError):
    """The device response did not contain the expected fields."""


def _create_tls_context(verify_tls: bool) -> ssl.SSLContext:
    context = ssl.create_default_context()

    if not verify_tls:
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE

    return context


def _first_row(reply: Any) -> Mapping[str, str]:
    if not reply.re:
        raise MikroTikResponseError

    return reply.re[0].map


def _rows(reply: Any) -> list[Mapping[str, str]]:
    return [sentence.map for sentence in reply.re]


def _optional_bool(value: str | None) -> bool | None:
    if value is None:
        return None

    return value.lower() in {"true", "yes"}


def _optional_int(value: str | None) -> int | None:
    if value is None:
        return None

    try:
        return int(value)
    except ValueError:
        return None


def _signal_dbm(value: str | None) -> int | None:
    if value is None:
        return None

    match = re.search(r"-?\d+", value)
    return int(match.group()) if match else None


def _duration_ms(value: str | None) -> float | None:
    if not value:
        return None

    normalized = value.strip().lower().replace("µs", "us")
    matches = list(
        re.finditer(
            r"(\d+(?:\.\d+)?)(ms|us|ns|d|h|m|s)",
            normalized,
        )
    )

    if not matches or "".join(match.group(0) for match in matches) != normalized:
        return None

    milliseconds = sum(
        float(match.group(1)) * TIME_FACTORS_MS[match.group(2)]
        for match in matches
    )
    return round(milliseconds, 3)


def _packet_loss(value: str | None) -> float | None:
    if value is None:
        return None

    try:
        return float(value.rstrip("%"))
    except ValueError:
        return None


def _active_wifi_package(client: Any) -> str | None:
    try:
        packages = _rows(client.run("/system/package/print"))
    except DeviceError:
        return None

    active_names = {
        package.get("name")
        for package in packages
        if not _optional_bool(package.get("disabled"))
        and not _optional_bool(package.get("available"))
    }

    return next((name for name in WIFI_PACKAGES if name in active_names), None)


def _menu_order(package: str | None) -> list[str]:
    preferred_stack = {
        "wifi-qcom": "wifi",
        "wifi-qcom-ac": "wifi",
        "wifiwave2": "wifiwave2",
        "wireless": "wireless",
    }.get(package)
    stacks = ["wifi", "wireless", "wifiwave2"]

    if preferred_stack:
        stacks.remove(preferred_stack)
        stacks.insert(0, preferred_stack)

    return stacks


def _read_wifi(client: Any) -> tuple[str | None, str, list[WiFiInterface]]:
    package = _active_wifi_package(client)

    for stack in _menu_order(package):
        try:
            rows = _rows(client.run(WIFI_MENUS[stack]))
        except DeviceError:
            continue

        interfaces = [
            WiFiInterface(
                name=row.get("name") or row.get("default-name"),
                default_name=row.get("default-name"),
                mac_address=row.get("mac-address"),
                disabled=_optional_bool(row.get("disabled")),
                running=_optional_bool(row.get("running")),
                mode=row.get("configuration.mode") or row.get("mode"),
                ssid=row.get("configuration.ssid") or row.get("ssid"),
                frequency=row.get("channel.frequency") or row.get("frequency"),
                channel_width=(
                    row.get("channel.width") or row.get("channel-width")
                ),
                band=row.get("channel.band") or row.get("band"),
            )
            for row in rows
        ]
        return package, stack, interfaces

    return package, "not_detected", []


def _read_registration_table(
    client: Any,
    stack: str,
) -> tuple[bool, list[WiFiPeer]]:
    command = REGISTRATION_MENUS.get(stack)

    if not command:
        return False, []

    try:
        rows = _rows(client.run(command))
    except DeviceError:
        return False, []

    peers = []

    for row in rows:
        signal = row.get("signal") or row.get("signal-strength")
        signal_dbm = _signal_dbm(signal)
        authorized = _optional_bool(row.get("authorized"))
        peers.append(
            WiFiPeer(
                interface=row.get("interface"),
                mac_address=row.get("mac-address"),
                radio_name=row.get("radio-name"),
                ssid=row.get("ssid"),
                authorized=authorized,
                signal=signal,
                signal_dbm=signal_dbm,
                tx_rate=row.get("tx-rate"),
                rx_rate=row.get("rx-rate"),
                tx_bits_per_second=_optional_int(row.get("tx-bits-per-second")),
                rx_bits_per_second=_optional_int(row.get("rx-bits-per-second")),
                uptime=row.get("uptime"),
                last_activity=row.get("last-activity"),
                band=row.get("band"),
                signal_assessment=assess_signal(signal_dbm),
                association_assessment=assess_association(authorized),
            )
        )

    return True, peers


def _read_lora_available(client: Any) -> bool:
    try:
        return bool(_rows(client.run("/iot/lora/print")))
    except DeviceError:
        return False


RADIO_MODEL_MARKERS = (
    "basebox",
    "cube",
    "disc",
    "dynadish",
    "groove",
    "lhg",
    "mantbox",
    "metal",
    "netbox",
    "netmetal",
    "omnitik",
    "qrt",
    "sextant",
    "sxt",
    "wireless wire",
)


def _is_radio_device(model: str | None, wifi_interfaces: list[WiFiInterface]) -> bool:
    if not wifi_interfaces:
        return False

    normalized_model = (model or "").casefold().replace("®", "")
    if any(marker in normalized_model for marker in RADIO_MODEL_MARKERS):
        return True

    return any(
        (interface.mode or "").casefold().startswith("station")
        for interface in wifi_interfaces
    )


def _safe_rows(client: Any, command: str) -> tuple[bool, list[Mapping[str, str]]]:
    try:
        return True, _rows(client.run(command))
    except DeviceError:
        return False, []


def _diagnostic_check(
    key: str,
    label: str,
    status: str,
    summary: str,
    *possible_causes: str,
) -> DiagnosticCheck:
    return DiagnosticCheck(
        key=key,
        label=label,
        status=status,
        summary=summary,
        possible_causes=list(possible_causes),
    )


def _structural_diagnostic(
    wifi_interfaces: list[WiFiInterface],
    registration_table_available: bool,
    wifi_peers: list[WiFiPeer],
    ethernet_available: bool,
    ethernet_interfaces: list[EthernetInterface],
    bridge_available: bool,
    bridges: list[BridgeInfo],
    bridge_ports_available: bool,
    bridge_ports: list[BridgePort],
    ip_available: bool,
    ip_addresses: list[IPAddressInfo],
    routes_available: bool,
    default_routes: list[DefaultRouteInfo],
) -> StructuralDiagnostic:
    checks: list[DiagnosticCheck] = []
    enabled_wifi = [item for item in wifi_interfaces if item.disabled is not True]

    if not wifi_interfaces:
        checks.append(_diagnostic_check(
            "wifi_interface", "Interface Wi-Fi", "unavailable",
            "Nenhuma interface Wi-Fi foi encontrada para avaliar.",
            "O equipamento pode não ser um rádio ou o usuário pode não ter permissão de leitura.",
        ))
    elif not enabled_wifi:
        checks.append(_diagnostic_check(
            "wifi_interface", "Interface Wi-Fi", "failed",
            "Todas as interfaces Wi-Fi encontradas estão desativadas.",
            "A interface do enlace pode ter sido desativada.",
        ))
    elif any(item.running is True for item in enabled_wifi):
        checks.append(_diagnostic_check(
            "wifi_interface", "Interface Wi-Fi", "passed",
            "Há uma interface Wi-Fi habilitada e ativa.",
        ))
    else:
        checks.append(_diagnostic_check(
            "wifi_interface", "Interface Wi-Fi", "warning",
            "A interface Wi-Fi está habilitada, mas o enlace não aparece ativo.",
            "O rádio remoto pode estar desligado, fora de alcance ou com configuração incompatível.",
        ))

    if not registration_table_available:
        checks.append(_diagnostic_check(
            "association", "Associação do rádio", "unavailable",
            "A tabela de equipamentos associados não pôde ser consultada.",
            "O menu pode não existir nesta versão ou faltar permissão de leitura.",
        ))
    elif not wifi_peers:
        checks.append(_diagnostic_check(
            "association", "Associação do rádio", "failed",
            "Nenhum equipamento está associado ao rádio agora.",
            "Verifique SSID, modo, frequência, segurança e alinhamento das antenas.",
        ))
    elif any(peer.authorized is not False for peer in wifi_peers):
        checks.append(_diagnostic_check(
            "association", "Associação do rádio", "passed",
            "O rádio possui equipamento associado.",
        ))
    else:
        checks.append(_diagnostic_check(
            "association", "Associação do rádio", "failed",
            "Há um peer visível, mas ele não está autorizado.",
            "A chave de segurança ou o perfil de autenticação pode estar incorreto.",
        ))

    enabled_bridges = [item for item in bridges if item.disabled is not True]
    enabled_bridge_names = {item.name for item in enabled_bridges if item.name}
    if not bridge_available:
        checks.append(_diagnostic_check(
            "bridge", "Bridge", "unavailable",
            "O ORION não conseguiu consultar as bridges.",
            "Confirme a permissão de leitura do usuário da API.",
        ))
    elif not bridges:
        checks.append(_diagnostic_check(
            "bridge", "Bridge", "failed",
            "Nenhuma bridge está configurada no equipamento.",
            "Crie uma bridge para transportar o tráfego entre rádio e cabo no cenário de enlace.",
        ))
    elif not enabled_bridges:
        checks.append(_diagnostic_check(
            "bridge", "Bridge", "failed",
            "As bridges encontradas estão desativadas.",
            "A bridge usada pelo enlace pode ter sido desativada.",
        ))
    else:
        checks.append(_diagnostic_check(
            "bridge", "Bridge", "passed",
            "Há uma bridge habilitada no equipamento.",
        ))

    wifi_names = {item.name for item in enabled_wifi if item.name}
    enabled_ports = [port for port in bridge_ports if port.disabled is not True]
    wifi_ports = [
        port for port in enabled_ports
        if port.interface in wifi_names and port.bridge in enabled_bridge_names
    ]
    if not bridge_ports_available or not wifi_names:
        checks.append(_diagnostic_check(
            "wifi_bridge", "Wi-Fi na bridge", "unavailable",
            "Não há dados suficientes para conferir a porta Wi-Fi na bridge.",
        ))
    elif wifi_ports:
        checks.append(_diagnostic_check(
            "wifi_bridge", "Wi-Fi na bridge", "passed",
            "A interface Wi-Fi participa de uma bridge.",
        ))
    else:
        checks.append(_diagnostic_check(
            "wifi_bridge", "Wi-Fi na bridge", "failed",
            "A interface Wi-Fi não foi encontrada em nenhuma bridge habilitada.",
            "Adicione a interface Wi-Fi à bridge utilizada pelo enlace.",
        ))

    ethernet_names = {
        item.name for item in ethernet_interfaces
        if item.name and item.disabled is not True
    }
    wifi_bridge_names = {port.bridge for port in wifi_ports if port.bridge}
    ethernet_in_wifi_bridge = any(
        port.interface in ethernet_names and port.bridge in wifi_bridge_names
        for port in enabled_ports
    )
    if not ethernet_available or not bridge_ports_available or not wifi_bridge_names:
        checks.append(_diagnostic_check(
            "ethernet_bridge", "Ethernet na mesma bridge", "unavailable",
            "Não há dados suficientes para confirmar o caminho entre rádio e cabo.",
        ))
    elif ethernet_in_wifi_bridge:
        checks.append(_diagnostic_check(
            "ethernet_bridge", "Ethernet na mesma bridge", "passed",
            "Uma interface Ethernet está na mesma bridge da interface Wi-Fi.",
        ))
    else:
        checks.append(_diagnostic_check(
            "ethernet_bridge", "Ethernet na mesma bridge", "failed",
            "Nenhuma interface Ethernet está na bridge usada pelo Wi-Fi.",
            "Adicione a porta Ethernet correta à mesma bridge da interface Wi-Fi.",
        ))

    usable_ips = [
        item for item in ip_addresses
        if item.disabled is not True and item.invalid is not True and item.address
    ]
    if not ip_available:
        checks.append(_diagnostic_check(
            "management_ip", "IP de gerenciamento", "unavailable",
            "O ORION não conseguiu consultar os endereços IP.",
        ))
    elif usable_ips:
        checks.append(_diagnostic_check(
            "management_ip", "IP de gerenciamento", "passed",
            f"Há um endereço IP utilizável: {usable_ips[0].address}.",
        ))
    else:
        checks.append(_diagnostic_check(
            "management_ip", "IP de gerenciamento", "warning",
            "Não há endereço IP ativo para gerenciamento.",
            "O enlace pode transportar tráfego em camada 2, mas acesso e testes por IP ficam limitados.",
        ))

    usable_routes = [route for route in default_routes if route.disabled is not True]
    if not routes_available:
        checks.append(_diagnostic_check(
            "default_route", "Rota padrão", "unavailable",
            "O ORION não conseguiu consultar a tabela de rotas.",
        ))
    elif any(route.active is True for route in usable_routes):
        checks.append(_diagnostic_check(
            "default_route", "Rota padrão", "passed",
            "Há uma rota padrão ativa no equipamento.",
        ))
    elif usable_routes:
        checks.append(_diagnostic_check(
            "default_route", "Rota padrão", "warning",
            "Existe uma rota padrão configurada, mas ela não aparece ativa.",
            "Verifique o gateway e a conectividade da rede de saída.",
        ))
    else:
        checks.append(_diagnostic_check(
            "default_route", "Rota padrão", "warning",
            "Nenhuma rota padrão foi encontrada.",
            "Isso não impede um enlace local em camada 2, mas pode impedir acesso a outras redes.",
        ))

    return StructuralDiagnostic(checks=checks)


def _read_structure(
    client: Any,
    wifi_interfaces: list[WiFiInterface],
    registration_table_available: bool,
    wifi_peers: list[WiFiPeer],
) -> tuple[
    list[EthernetInterface],
    list[BridgeInfo],
    list[BridgePort],
    list[IPAddressInfo],
    list[DefaultRouteInfo],
    StructuralDiagnostic,
]:
    ethernet_available, ethernet_rows = _safe_rows(client, "/interface/ethernet/print")
    bridge_available, bridge_rows = _safe_rows(client, "/interface/bridge/print")
    bridge_ports_available, bridge_port_rows = _safe_rows(client, "/interface/bridge/port/print")
    ip_available, ip_rows = _safe_rows(client, "/ip/address/print")
    routes_available, route_rows = _safe_rows(client, "/ip/route/print")

    ethernet_interfaces = [EthernetInterface(
        name=row.get("name") or row.get("default-name"),
        mac_address=row.get("mac-address"),
        disabled=_optional_bool(row.get("disabled")),
        running=_optional_bool(row.get("running")),
    ) for row in ethernet_rows]
    bridges = [BridgeInfo(
        name=row.get("name"),
        disabled=_optional_bool(row.get("disabled")),
        running=_optional_bool(row.get("running")),
        protocol_mode=row.get("protocol-mode"),
    ) for row in bridge_rows]
    bridge_ports = [BridgePort(
        interface=row.get("interface"),
        bridge=row.get("bridge"),
        disabled=_optional_bool(row.get("disabled")),
        inactive=_optional_bool(row.get("inactive")),
        hw_offload=_optional_bool(row.get("hw-offload")),
    ) for row in bridge_port_rows]
    ip_addresses = [IPAddressInfo(
        address=row.get("address"),
        network=row.get("network"),
        interface=row.get("interface"),
        actual_interface=row.get("actual-interface"),
        disabled=_optional_bool(row.get("disabled")),
        dynamic=_optional_bool(row.get("dynamic")),
        invalid=_optional_bool(row.get("invalid")),
    ) for row in ip_rows]
    default_routes = [DefaultRouteInfo(
        gateway=row.get("gateway"),
        immediate_gateway=row.get("immediate-gw"),
        routing_table=row.get("routing-table"),
        active=_optional_bool(row.get("active")),
        disabled=_optional_bool(row.get("disabled")),
        dynamic=_optional_bool(row.get("dynamic")),
        distance=_optional_int(row.get("distance")),
    ) for row in route_rows if row.get("dst-address") in (None, "", "0.0.0.0/0") and row.get("gateway")]

    diagnostic = _structural_diagnostic(
        wifi_interfaces, registration_table_available, wifi_peers,
        ethernet_available, ethernet_interfaces,
        bridge_available, bridges,
        bridge_ports_available, bridge_ports,
        ip_available, ip_addresses,
        routes_available, default_routes,
    )
    return (
        ethernet_interfaces, bridges, bridge_ports, ip_addresses,
        default_routes, diagnostic,
    )


def _read_device_summary(client: Any) -> DeviceSummary:
    identity = _first_row(client.run("/system/identity/print"))
    resource = _first_row(client.run("/system/resource/print"))
    wifi_package, wifi_stack, wifi_interfaces = _read_wifi(client)
    lora_available = _read_lora_available(client)
    registration_table_available, wifi_peers = _read_registration_table(
        client,
        wifi_stack,
    )
    (
        ethernet_interfaces,
        bridges,
        bridge_ports,
        ip_addresses,
        default_routes,
        structural_diagnostic,
    ) = _read_structure(
        client,
        wifi_interfaces,
        registration_table_available,
        wifi_peers,
    )

    identity_name = identity.get("name")
    routeros_version = resource.get("version")

    if not identity_name or not routeros_version:
        raise MikroTikResponseError

    model = resource.get("board-name")

    return DeviceSummary(
        identity=identity_name,
        model=model,
        routeros_version=routeros_version,
        architecture=resource.get("architecture-name"),
        wifi_package=wifi_package,
        wifi_stack=wifi_stack,
        wifi_interfaces=wifi_interfaces,
        radio_device=_is_radio_device(model, wifi_interfaces),
        lora_available=lora_available,
        registration_table_available=registration_table_available,
        wifi_peers=wifi_peers,
        ethernet_interfaces=ethernet_interfaces,
        bridges=bridges,
        bridge_ports=bridge_ports,
        ip_addresses=ip_addresses,
        default_routes=default_routes,
        structural_diagnostic=structural_diagnostic,
    )


def _open_client(connection: MikroTikConnection) -> Any:
    address = f"{connection.host}:{connection.port}"
    password = connection.password.get_secret_value()

    if connection.use_tls:
        return routeros.dial_tls(
            address,
            connection.username,
            password,
            timeout=CONNECTION_TIMEOUT_SECONDS,
            tls_context=_create_tls_context(connection.verify_tls),
        )

    return routeros.dial(
        address,
        connection.username,
        password,
        timeout=CONNECTION_TIMEOUT_SECONDS,
    )


def _with_connection(
    connection: MikroTikConnection,
    operation: Callable[[Any], ResultType],
) -> ResultType:
    try:
        client = _open_client(connection)
        with client:
            return operation(client)
    except MikroTikResponseError:
        raise
    except LoginError as error:
        raise MikroTikAuthenticationError from error
    except ssl.SSLCertVerificationError as error:
        raise MikroTikTLSVerificationError from error
    except (TimeoutError, socket.timeout) as error:
        raise MikroTikTimeoutError from error
    except RouterOSError as error:
        raise MikroTikResponseError from error
    except OSError as error:
        raise MikroTikConnectionError from error


def discover_device(connection: MikroTikConnection) -> DeviceSummary:
    """Open one short-lived API session and read RouterOS device information."""
    return _with_connection(connection, _read_device_summary)


def _add_advanced_ping_metrics(result: PingResult) -> PingResult:
    if len(result.samples_ms) != result.received:
        return result.model_copy(
            update={
                "advanced_metrics_unavailable_reason": (
                    "O RouterOS não retornou todas as amostras individuais."
                )
            }
        )
    try:
        metrics = analyze_network_samples(result.sent, result.samples_ms)
    except NetworkEngineUnavailableError:
        return result.model_copy(
            update={
                "advanced_metrics_unavailable_reason": (
                    "O motor nativo não está disponível neste modo de execução."
                )
            }
        )
    return result.model_copy(update={"advanced_metrics": metrics})


def _read_ping_result(
    client: Any,
    request: PingRequest,
    *,
    include_advanced_metrics: bool = False,
) -> PingResult:
    rows = _rows(
        client.run(
            "/ping",
            f"=address={request.target}",
            f"=count={request.count}",
            "=interval=200ms",
        )
    )
    samples = [
        latency
        for latency in (_duration_ms(row.get("time")) for row in rows)
        if latency is not None
    ]
    summary = next(
        (
            row
            for row in reversed(rows)
            if row.get("sent") is not None and row.get("received") is not None
        ),
        None,
    )

    if summary:
        sent = _optional_int(summary.get("sent"))
        received = _optional_int(summary.get("received"))
        packet_loss = _packet_loss(summary.get("packet-loss"))

        if sent is not None and received is not None and packet_loss is not None:
            minimum_latency = _duration_ms(summary.get("min-rtt"))
            average_latency = _duration_ms(summary.get("avg-rtt"))
            maximum_latency = _duration_ms(summary.get("max-rtt"))
            result = PingResult(
                target=request.target,
                sent=sent,
                received=received,
                packet_loss_percent=packet_loss,
                minimum_latency_ms=minimum_latency,
                average_latency_ms=average_latency,
                maximum_latency_ms=maximum_latency,
                samples_ms=samples,
                measurement_source="routeros_summary",
                packet_loss_assessment=assess_packet_loss(packet_loss),
                average_latency_assessment=assess_average_latency(
                    average_latency
                ),
                maximum_latency_assessment=assess_maximum_latency(
                    maximum_latency
                ),
            )
            return (
                _add_advanced_ping_metrics(result)
                if include_advanced_metrics
                else result
            )

    sent = request.count
    received = len(samples)
    packet_loss = ((sent - received) / sent) * 100
    minimum_latency = min(samples) if samples else None
    average_latency = round(sum(samples) / received, 3) if received else None
    maximum_latency = max(samples) if samples else None
    packet_loss = round(packet_loss, 2)

    result = PingResult(
        target=request.target,
        sent=sent,
        received=received,
        packet_loss_percent=packet_loss,
        minimum_latency_ms=minimum_latency,
        average_latency_ms=average_latency,
        maximum_latency_ms=maximum_latency,
        samples_ms=samples,
        measurement_source="orion_calculation",
        packet_loss_assessment=assess_packet_loss(packet_loss),
        average_latency_assessment=assess_average_latency(average_latency),
        maximum_latency_assessment=assess_maximum_latency(maximum_latency),
    )
    return _add_advanced_ping_metrics(result) if include_advanced_metrics else result


def ping_device(request: PingRequest) -> PingResult:
    """Run a bounded ICMP test from the MikroTik itself."""
    def run_diagnostics(client: Any) -> PingResult:
        result = _read_ping_result(client, request, include_advanced_metrics=True)
        _package, stack, _interfaces = _read_wifi(client)
        table_available, peers = _read_registration_table(client, stack)

        if not table_available:
            return result.model_copy(
                update={
                    "link_health_unavailable_reason": (
                        "A registration table não está disponível para calcular a saúde do enlace."
                    )
                }
            )
        if len(peers) > 1:
            return result.model_copy(
                update={
                    "link_health_unavailable_reason": (
                        "Há mais de um peer associado; a seleção do enlace ainda não está disponível."
                    )
                }
            )

        peer = peers[0] if peers else None
        return result.model_copy(
            update={"link_health": calculate_link_health(peer, result)}
        )

    return _with_connection(request.connection, run_diagnostics)


def _gateway_address(rows: list[Mapping[str, str]]) -> IPv4Address | None:
    enabled_routes = [
        row for row in rows
        if row.get("dst-address") in (None, "", "0.0.0.0/0")
        and not _optional_bool(row.get("disabled"))
        and row.get("gateway")
    ]
    ordered_routes = sorted(
        enabled_routes,
        key=lambda row: _optional_bool(row.get("active")) is not True,
    )

    for row in ordered_routes:
        match = re.search(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", row["gateway"])

        if not match:
            continue

        try:
            return IPv4Address(match.group())
        except AddressValueError:
            continue

    return None


def _connectivity_probe(
    client: Any,
    request: ConnectivityRequest,
    label: str,
    target: IPv4Address | None,
) -> ConnectivityProbe:
    if target is None:
        return ConnectivityProbe(
            label=label,
            status="unavailable",
            target=None,
            sent=None,
            received=None,
            packet_loss_percent=None,
            average_latency_ms=None,
            summary="Nenhum destino válido foi encontrado para este teste.",
        )

    try:
        result = _read_ping_result(
            client,
            PingRequest(connection=request.connection, target=target, count=3),
        )
    except DeviceError:
        return ConnectivityProbe(
            label=label,
            status="unavailable",
            target=target,
            sent=None,
            received=None,
            packet_loss_percent=None,
            average_latency_ms=None,
            summary="O RouterOS não permitiu executar este teste.",
        )

    reachable = result.received > 0
    return ConnectivityProbe(
        label=label,
        status="passed" if reachable else "failed",
        target=target,
        sent=result.sent,
        received=result.received,
        packet_loss_percent=result.packet_loss_percent,
        average_latency_ms=result.average_latency_ms,
        summary=(
            "O destino respondeu ao MikroTik."
            if reachable
            else "O destino não respondeu aos três pacotes enviados."
        ),
    )


def _arp_validation(
    available: bool,
    rows: list[Mapping[str, str]],
    gateway: IPv4Address | None,
) -> ARPValidation:
    if gateway is None:
        return ARPValidation(
            status="unavailable",
            ip_address=None,
            mac_address=None,
            interface=None,
            summary="Não há gateway IPv4 para consultar na tabela ARP.",
        )
    if not available:
        return ARPValidation(
            status="unavailable",
            ip_address=gateway,
            mac_address=None,
            interface=None,
            summary="A tabela ARP não pôde ser consultada.",
        )

    row = next((item for item in rows if item.get("address") == str(gateway)), None)

    if row is None:
        return ARPValidation(
            status="unavailable",
            ip_address=gateway,
            mac_address=None,
            interface=None,
            summary="O gateway não apareceu na tabela ARP; algumas interfaces não usam ARP.",
        )

    arp_status = row.get("status")
    resolved = (
        _optional_bool(row.get("complete")) is True
        or arp_status in {"permanent", "reachable", "stale", "probe", "delay"}
    ) and bool(row.get("mac-address"))
    failed = arp_status in {"failed", "incomplete"}

    return ARPValidation(
        status="passed" if resolved else "failed" if failed else "unavailable",
        ip_address=gateway,
        mac_address=row.get("mac-address"),
        interface=row.get("interface"),
        summary=(
            "O endereço MAC do gateway foi resolvido."
            if resolved
            else "A resolução ARP do gateway falhou."
            if failed
            else "A entrada ARP existe, mas o estado não permite confirmar a resolução."
        ),
    )


def validate_connectivity(request: ConnectivityRequest) -> ConnectivityValidation:
    """Validate gateway, ARP resolution and external IPv4 reachability."""
    def run_validation(client: Any) -> ConnectivityValidation:
        routes_available, route_rows = _safe_rows(client, "/ip/route/print")
        gateway_address = _gateway_address(route_rows) if routes_available else None
        gateway_probe = _connectivity_probe(
            client, request, "Gateway", gateway_address
        )
        remote_probe = (
            _connectivity_probe(
                client, request, "Outro rádio", request.remote_target
            )
            if request.remote_target is not None
            else None
        )
        arp_available, arp_rows = _safe_rows(client, "/ip/arp/print")
        arp = _arp_validation(
            arp_available,
            arp_rows,
            request.remote_target or gateway_address,
        )
        internet_probe = _connectivity_probe(
            client, request, "Internet", request.internet_target
        )

        return ConnectivityValidation(
            gateway_address=gateway_address,
            gateway=gateway_probe,
            remote=remote_probe,
            arp=arp,
            internet=internet_probe,
        )

    return _with_connection(request.connection, run_validation)
