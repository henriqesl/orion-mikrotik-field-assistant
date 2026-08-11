from datetime import UTC, datetime
from typing import Any

from app.models.configuration import (
    ConfigurationApplyRequest,
    ConfigurationApplyResult,
    ConfigurationChange,
    ConfigurationPreview,
    ConfigurationPreviewRequest,
    LinkConfiguration,
)
from app.services.routeros import (
    WIFI_MENUS,
    _first_row,
    _optional_bool,
    _read_wifi,
    _rows,
    _with_connection,
)


class ConfigurationConflictError(Exception):
    """The requested configuration cannot be applied safely."""


def _find_row(rows: list[dict], key: str, value: str) -> dict | None:
    return next((row for row in rows if row.get(key) == value), None)


def _context(client: Any, configuration: LinkConfiguration) -> dict[str, Any]:
    identity = _first_row(client.run("/system/identity/print"))
    _package, stack, wifi_interfaces = _read_wifi(client)

    if stack not in WIFI_MENUS:
        raise ConfigurationConflictError(
            "Nenhuma pilha Wi-Fi compatível foi encontrada para configurar."
        )

    wifi = next(
        (item for item in wifi_interfaces if item.name == configuration.wifi_interface),
        None,
    )
    if wifi is None:
        raise ConfigurationConflictError(
            "A interface Wi-Fi selecionada não existe mais no equipamento."
        )

    wifi_rows = _rows(client.run(WIFI_MENUS[stack]))
    wifi_row = next(
        (
            row
            for row in wifi_rows
            if (row.get("name") or row.get("default-name"))
            == configuration.wifi_interface
        ),
        None,
    )
    if wifi_row is None:
        raise ConfigurationConflictError(
            "O RouterOS não retornou a interface Wi-Fi selecionada."
        )

    ethernet_rows = _rows(client.run("/interface/ethernet/print"))
    ethernet_row = next(
        (
            row
            for row in ethernet_rows
            if (row.get("name") or row.get("default-name"))
            == configuration.ethernet_interface
        ),
        None,
    )
    if ethernet_row is None:
        raise ConfigurationConflictError(
            "A interface Ethernet selecionada não existe mais no equipamento."
        )

    return {
        "identity": identity,
        "stack": stack,
        "wifi": wifi,
        "wifi_row": wifi_row,
        "ethernet_row": ethernet_row,
        "bridges": _rows(client.run("/interface/bridge/print")),
        "bridge_ports": _rows(client.run("/interface/bridge/port/print")),
        "ip_addresses": _rows(client.run("/ip/address/print")),
        "routes": _rows(client.run("/ip/route/print")),
    }


def _current_bridge(context: dict[str, Any], interface: str) -> str | None:
    port = _find_row(context["bridge_ports"], "interface", interface)
    return port.get("bridge") if port else None


def _current_management_ip(context: dict[str, Any], bridge_name: str) -> str | None:
    address = next(
        (
            row.get("address")
            for row in context["ip_addresses"]
            if row.get("interface") == bridge_name
            and not _optional_bool(row.get("disabled"))
            and row.get("address")
        ),
        None,
    )
    return address


def _current_gateway(context: dict[str, Any]) -> str | None:
    route = next(
        (
            row
            for row in context["routes"]
            if row.get("dst-address") in (None, "", "0.0.0.0/0")
            and not _optional_bool(row.get("disabled"))
            and row.get("gateway")
        ),
        None,
    )
    return route.get("gateway") if route else None


def _change(
    area: str,
    field: str,
    current: str | None,
    new: str,
    *,
    sensitive: bool = False,
) -> ConfigurationChange:
    return ConfigurationChange(
        area=area,
        field=field,
        current_value=current,
        new_value=new,
        sensitive=sensitive,
    )


def _build_preview(
    client: Any,
    request: ConfigurationPreviewRequest,
) -> tuple[ConfigurationPreview, dict[str, Any]]:
    configuration = request.configuration
    context = _context(client, configuration)
    wifi = context["wifi"]
    desired_mode = "ap" if configuration.role == "ap" else "station-bridge"
    changes: list[ConfigurationChange] = []

    comparisons = [
        ("Equipamento", "Identidade", context["identity"].get("name"), configuration.identity),
        ("Rádio", "Função", wifi.mode, desired_mode),
        ("Rádio", "SSID", wifi.ssid, configuration.ssid),
        ("Rádio", "Frequência", wifi.frequency, str(configuration.frequency_mhz)),
        ("Rádio", "Largura", wifi.channel_width, configuration.channel_width),
        (
            "Bridge",
            f"Porta {configuration.wifi_interface}",
            _current_bridge(context, configuration.wifi_interface),
            configuration.bridge_name,
        ),
        (
            "Bridge",
            f"Porta {configuration.ethernet_interface}",
            _current_bridge(context, configuration.ethernet_interface),
            configuration.bridge_name,
        ),
        (
            "Rede",
            "IP de gerenciamento",
            _current_management_ip(context, configuration.bridge_name),
            str(configuration.management_ip),
        ),
        (
            "Rede",
            "Gateway",
            _current_gateway(context),
            str(configuration.gateway) if configuration.gateway else "Não configurar",
        ),
    ]
    changes.extend(
        _change(area, field, current, new)
        for area, field, current, new in comparisons
        if current != new
    )
    changes.append(
        _change(
            "Segurança",
            "Senha WPA2",
            "Protegida pelo RouterOS",
            "Será atualizada",
            sensitive=True,
        )
    )

    warnings = [
        "A interface Wi-Fi será reiniciada e o enlace poderá cair temporariamente.",
        "Um backup binário será criado no MikroTik antes da primeira alteração.",
        "Endereços IP existentes não serão removidos; o novo IP será adicionado com comentário do ORION.",
        "Servidores DHCP, clientes DHCP, regras de NAT e firewall existentes não serão removidos. Em rádios novos, use a preparação limpa do manual de campo.",
    ]
    if context["stack"] == "wireless":
        warnings.append(
            "O equipamento usa Wireless legado; o ORION aplicará o perfil WPA2 compatível."
        )
    if configuration.role == "station":
        warnings.append(
            "Station-bridge exige um AP MikroTik com a mesma família de driver Wi-Fi."
        )

    preview = ConfigurationPreview(
        device_identity=context["identity"].get("name") or "MikroTik",
        wifi_stack=context["stack"],
        changes=changes,
        warnings=warnings,
        reconnect_ip=configuration.management_ip.ip,
    )
    return preview, context


def preview_link_configuration(
    request: ConfigurationPreviewRequest,
) -> ConfigurationPreview:
    return _with_connection(
        request.connection,
        lambda client: _build_preview(client, request)[0],
    )


def _record_id(row: dict[str, str], description: str) -> str:
    record_id = row.get(".id")
    if not record_id:
        raise ConfigurationConflictError(
            f"O RouterOS não informou o identificador de {description}."
        )
    return record_id


def _ensure_bridge(client: Any, context: dict[str, Any], name: str) -> None:
    bridge = _find_row(context["bridges"], "name", name)
    if bridge:
        client.run(
            "/interface/bridge/set",
            f"=.id={_record_id(bridge, 'bridge')}",
            "=disabled=no",
        )
        return

    client.run(
        "/interface/bridge/add",
        f"=name={name}",
        "=protocol-mode=rstp",
        "=comment=ORION Field - bridge do enlace",
    )


def _ensure_bridge_port(
    client: Any,
    context: dict[str, Any],
    interface: str,
    bridge: str,
) -> None:
    port = _find_row(context["bridge_ports"], "interface", interface)
    if port:
        client.run(
            "/interface/bridge/port/set",
            f"=.id={_record_id(port, f'porta {interface}')}",
            f"=bridge={bridge}",
            "=disabled=no",
        )
        return


    client.run(
        "/interface/bridge/port/add",
        f"=bridge={bridge}",
        f"=interface={interface}",
        "=comment=ORION Field - porta do enlace",
    )


def _configure_modern_wifi(
    client: Any,
    context: dict[str, Any],
    configuration: LinkConfiguration,
) -> None:
    mode = "ap" if configuration.role == "ap" else "station-bridge"
    client.run(
        f"/interface/{context['stack']}/set",
        f"=.id={_record_id(context['wifi_row'], 'interface Wi-Fi')}",
        "=configuration.manager=local",
        f"=configuration.mode={mode}",
        "=configuration.country=Brazil",
        f"=configuration.ssid={configuration.ssid}",
        f"=channel.frequency={configuration.frequency_mhz}",
        f"=channel.width={configuration.channel_width}",
        "=security.authentication-types=wpa2-psk",
        f"=security.passphrase={configuration.passphrase}",
        "=disabled=no",
    )


def _configure_legacy_wifi(
    client: Any,
    context: dict[str, Any],
    configuration: LinkConfiguration,
) -> None:
    profile_name = "orion-field-security"
    profiles = _rows(client.run("/interface/wireless/security-profiles/print"))
    profile = _find_row(profiles, "name", profile_name)
    profile_words = (
        "=mode=dynamic-keys",
        "=authentication-types=wpa2-psk",
        "=unicast-ciphers=aes-ccm",
        "=group-ciphers=aes-ccm",
        f"=wpa2-pre-shared-key={configuration.passphrase}",
    )
    if profile:
        client.run(
            "/interface/wireless/security-profiles/set",
            f"=.id={_record_id(profile, 'perfil de segurança')}",
            *profile_words,
        )
    else:
        client.run(
            "/interface/wireless/security-profiles/add",
            f"=name={profile_name}",
            *profile_words,
        )

    mode = "bridge" if configuration.role == "ap" else "station-bridge"
    width = (
        "20mhz"
        if configuration.channel_width == "20mhz"
        else "20/40mhz-XX"
    )
    client.run(
        "/interface/wireless/set",
        f"=.id={_record_id(context['wifi_row'], 'interface Wireless')}",
        f"=mode={mode}",
        f"=ssid={configuration.ssid}",
        f"=frequency={configuration.frequency_mhz}",
        f"=channel-width={width}",
        "=country=brazil",
        "=wireless-protocol=802.11",
        f"=security-profile={profile_name}",
        "=disabled=no",
    )


def _ensure_management_ip(
    client: Any,
    context: dict[str, Any],
    configuration: LinkConfiguration,
) -> None:
    address_text = str(configuration.management_ip)
    existing = next(
        (
            row
            for row in context["ip_addresses"]
            if row.get("address") == address_text
        ),
        None,
    )
    if existing:
        client.run(
            "/ip/address/set",
            f"=.id={_record_id(existing, 'endereço IP')}",
            f"=interface={configuration.bridge_name}",
            "=comment=ORION Field - management",
            "=disabled=no",
        )
        return

    client.run(
        "/ip/address/add",
        f"=address={address_text}",
        f"=interface={configuration.bridge_name}",
        "=comment=ORION Field - management",
    )


def _ensure_gateway(
    client: Any,
    context: dict[str, Any],
    configuration: LinkConfiguration,
) -> None:
    if configuration.gateway is None:
        return

    managed = _find_row(
        context["routes"], "comment", "ORION Field - gateway"
    )
    matching_route = next(
        (
            row
            for row in context["routes"]
            if row.get("dst-address") in (None, "", "0.0.0.0/0")
            and row.get("gateway") == str(configuration.gateway)
            and not _optional_bool(row.get("disabled"))
        ),
        None,
    )
    if managed is None and matching_route is not None:
        return

    words = (
        "=dst-address=0.0.0.0/0",
        f"=gateway={configuration.gateway}",
        "=distance=1",
        "=disabled=no",
    )
    if managed:
        client.run(
            "/ip/route/set",
            f"=.id={_record_id(managed, 'rota padrão')}",
            *words,
        )
        return

    client.run(
        "/ip/route/add",
        *words,
        "=comment=ORION Field - gateway",
    )


def apply_link_configuration(
    request: ConfigurationApplyRequest,
) -> ConfigurationApplyResult:
    def apply(client: Any) -> ConfigurationApplyResult:
        preview_request = ConfigurationPreviewRequest(
            connection=request.connection,
            configuration=request.configuration,
        )
        preview, context = _build_preview(client, preview_request)
        configuration = request.configuration
        backup_name = f"orion-before-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}"

        client.run("/system/backup/save", f"=name={backup_name}")
        client.run("/system/identity/set", f"=name={configuration.identity}")
        _ensure_bridge(client, context, configuration.bridge_name)

        if context["stack"] in {"wifi", "wifiwave2"}:
            _configure_modern_wifi(client, context, configuration)
        else:
            _configure_legacy_wifi(client, context, configuration)

        _ensure_gateway(client, context, configuration)
        _ensure_management_ip(client, context, configuration)
        _ensure_bridge_port(
            client,
            context,
            configuration.wifi_interface,
            configuration.bridge_name,
        )
        # Ethernet is deliberately moved last: changing the ingress port can
        # interrupt the API session, so every other setting must already exist.
        _ensure_bridge_port(
            client,
            context,
            configuration.ethernet_interface,
            configuration.bridge_name,
        )

        return ConfigurationApplyResult(
            status="applied",
            backup_file=f"{backup_name}.backup",
            reconnect_ip=configuration.management_ip.ip,
            changes_applied=len(preview.changes),
            summary=(
                "A configuração foi enviada ao MikroTik. Reconecte no IP informado "
                "e execute a validação do enlace."
            ),
        )

    return _with_connection(request.connection, apply)
