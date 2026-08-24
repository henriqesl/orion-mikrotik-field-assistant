from datetime import UTC, datetime
from ipaddress import IPv4Address, IPv4Interface
from typing import Any

from app.models.configuration import (
    BasicNetworkApplyRequest,
    BasicNetworkApplyResult,
    BasicNetworkConfiguration,
    BasicNetworkCurrentState,
    BasicNetworkPreview,
    BasicNetworkPreviewRequest,
    ConfigurationChange,
    ExistingConfiguration,
)
from app.services.configuration import (
    ConfigurationConflictError,
    _ensure_bridge,
    _ensure_bridge_port,
    _find_row,
    _record_id,
)
from app.services.routeros import _first_row, _optional_bool, _rows, _with_connection
from app.models.mikrotik import MikroTikConnection


def _validate_interfaces(
    interface_rows: list[dict],
    ethernet_rows: list[dict],
    configuration: BasicNetworkConfiguration,
) -> None:
    available_interfaces = {
        row.get("name") or row.get("default-name")
        for row in interface_rows
    }
    available_ethernet = {
        row.get("name") or row.get("default-name")
        for row in ethernet_rows
    }
    missing = []
    if configuration.wan_interface not in available_interfaces:
        missing.append(configuration.wan_interface)
    missing.extend(
        item for item in configuration.lan_ports if item not in available_ethernet
    )
    missing = sorted(set(missing))
    if missing:
        raise ConfigurationConflictError(
            f"As interfaces selecionadas não existem mais: {', '.join(missing)}."
        )
    selected = {configuration.wan_interface, *configuration.lan_ports}
    disabled = sorted({
        str(row.get("name") or row.get("default-name"))
        for row in [*interface_rows, *ethernet_rows]
        if (row.get("name") or row.get("default-name")) in selected
        and _optional_bool(row.get("disabled"))
    })
    if disabled:
        raise ConfigurationConflictError(
            f"Ative as interfaces antes de continuar: {', '.join(disabled)}."
        )
    if configuration.configure_lan and configuration.lan_bridge in available_ethernet:
        raise ConfigurationConflictError(
            "O nome da bridge LAN não pode ser igual ao de uma interface física."
        )


def _change(
    area: str,
    field: str,
    current: str | None,
    new: str,
) -> ConfigurationChange:
    return ConfigurationChange(
        area=area,
        field=field,
        current_value=current,
        new_value=new,
    )


def _build_preview(client: Any, request: BasicNetworkPreviewRequest) -> BasicNetworkPreview:
    configuration = request.configuration
    identity = _first_row(client.run("/system/identity/print"))
    interface_rows = _rows(client.run("/interface/print"))
    ethernet_rows = _rows(client.run("/interface/ethernet/print"))
    bridge_rows = _rows(client.run("/interface/bridge/print"))
    bridge_ports = _rows(client.run("/interface/bridge/port/print"))
    ip_rows = _rows(client.run("/ip/address/print"))
    route_rows = _rows(client.run("/ip/route/print"))
    dhcp_rows = _rows(client.run("/ip/dhcp-client/print"))
    dns = _first_row(client.run("/ip/dns/print"))
    nat_rows = _rows(client.run("/ip/firewall/nat/print"))
    dhcp_server_rows = _rows(client.run("/ip/dhcp-server/print"))
    pool_rows = _rows(client.run("/ip/pool/print"))
    service_rows = _rows(client.run("/ip/service/print"))
    _validate_interfaces(interface_rows, ethernet_rows, configuration)

    bridge = (
        _find_row(bridge_rows, "name", configuration.lan_bridge)
        if configuration.configure_lan
        else None
    )
    current_lan_row = next(
        (
            row
            for row in ip_rows
            if row.get("interface") == configuration.lan_bridge
            and row.get("comment") == "ORION Field - LAN"
            and not _optional_bool(row.get("disabled"))
        ),
        None,
    ) or next(
        (
            row
            for row in ip_rows
            if row.get("interface") == configuration.lan_bridge
            and not _optional_bool(row.get("disabled"))
        ),
        None,
    )
    current_lan_ip = current_lan_row.get("address") if current_lan_row else None
    active_dhcp = next(
        (
            row
            for row in dhcp_rows
            if row.get("interface") == configuration.wan_interface
            and not _optional_bool(row.get("disabled"))
        ),
        None,
    )
    current_wan_ip = next(
        (
            row.get("address")
            for row in ip_rows
            if row.get("interface") == configuration.wan_interface
            and not _optional_bool(row.get("disabled"))
        ),
        None,
    )
    current_gateway = next(
        (
            row.get("gateway")
            for row in route_rows
            if row.get("dst-address") in (None, "", "0.0.0.0/0")
            and not _optional_bool(row.get("disabled"))
        ),
        None,
    )
    current_ports = sorted(
        row.get("interface")
        for row in bridge_ports
        if configuration.configure_lan
        and row.get("bridge") == configuration.lan_bridge
        and row.get("interface")
        and not _optional_bool(row.get("disabled"))
    )
    ports_moved_from_other_bridges = sorted(
        row.get("interface")
        for row in bridge_ports
        if configuration.configure_lan
        and row.get("interface") in configuration.lan_ports
        and row.get("bridge") != configuration.lan_bridge
        and not _optional_bool(row.get("disabled"))
    )
    managed_nat = _find_row(nat_rows, "comment", "ORION Field - NAT")
    lan_dhcp = next(
        (
            row
            for row in dhcp_server_rows
            if row.get("interface") == configuration.lan_bridge
            and not _optional_bool(row.get("disabled"))
        ),
        None,
    )
    lan_pool = _find_row(pool_rows, "name", "orion-lan-pool")
    service_states = {
        row.get("name"): not _optional_bool(row.get("disabled"))
        for row in service_rows
        if row.get("name") in {"ssh", "winbox", "www-ssl", "telnet", "ftp", "www"}
    }

    desired_wan = (
        "DHCP Client"
        if configuration.wan_mode == "dhcp"
        else str(configuration.wan_address)
    )
    current_wan = (
        "DHCP Client"
        if active_dhcp
        else current_wan_ip
    )
    comparisons = [
        ("Equipamento", "Identidade", identity.get("name"), configuration.identity),
        ("WAN", "Endereçamento", current_wan, desired_wan),
        (
            "WAN",
            "Gateway",
            current_gateway,
            str(configuration.gateway) if configuration.gateway else "Automático por DHCP",
        ),
        (
            "DNS",
            "Servidores",
            dns.get("servers"),
            ", ".join(str(server) for server in configuration.dns_servers),
        ),
        *(
            (
                "Serviços",
                label,
                "Ativo" if service_states.get(name, False) else "Desativado",
                "Ativo" if enabled else "Desativado",
            )
            for name, label, enabled in (
                ("ssh", "SSH", configuration.enable_ssh),
                ("winbox", "WinBox", configuration.enable_winbox),
                ("www-ssl", "WebFig HTTPS", configuration.enable_webfig_https),
                ("telnet", "Telnet", configuration.enable_telnet),
                ("ftp", "FTP", configuration.enable_ftp),
                ("www", "WebFig HTTP", configuration.enable_webfig_http),
            )
        ),
    ]
    if configuration.configure_lan:
        comparisons[3:3] = [
            ("LAN", "Bridge", bridge.get("name") if bridge else None, configuration.lan_bridge),
            ("LAN", "Endereço", current_lan_ip, str(configuration.lan_address)),
            ("LAN", "Portas", ", ".join(current_ports) or None, ", ".join(configuration.lan_ports)),
            (
                "Internet",
                "NAT",
                "Ativo" if managed_nat and not _optional_bool(managed_nat.get("disabled")) else "Não gerenciado",
                "Ativar masquerade" if configuration.enable_nat else "Não configurar",
            ),
            (
                "LAN",
                "DHCP Server",
                "Ativo" if lan_dhcp else "Inativo",
                "Ativar automaticamente" if configuration.enable_lan_dhcp else "Não configurar",
            ),
        ]
    if configuration.enable_lan_dhcp:
        comparisons.append(
            (
                "LAN",
                "Pool DHCP",
                lan_pool.get("ranges") if lan_pool else None,
                _resolved_dhcp_pool(configuration),
            )
        )
    changes = [
        _change(area, field, current, new)
        for area, field, current, new in comparisons
        if current != new
    ]
    warnings = [
        "Um backup será criado antes da primeira alteração.",
        "Regras existentes não serão apagadas automaticamente.",
    ]
    if configuration.configure_lan:
        warnings.insert(
            1,
            "A sessão pode cair ao mover as portas LAN; reconecte pelo novo IP da LAN.",
        )
    else:
        warnings.insert(1, "A bridge, os endereços e as portas LAN serão preservados.")
    if ports_moved_from_other_bridges:
        warnings.append(
            "Estas portas sairão da bridge atual: "
            f"{', '.join(ports_moved_from_other_bridges)}."
        )
    if configuration.wan_mode == "dhcp" and current_wan_ip:
        warnings.append(
            "O IP fixo existente na WAN será preservado junto com o DHCP Client."
        )
    if configuration.wan_mode == "static" and active_dhcp:
        warnings.append(
            "O DHCP Client preexistente na WAN será preservado junto com o IP fixo."
        )
    existing = [
        ExistingConfiguration(area="Equipamento", field="Identidade", value=identity.get("name") or "MikroTik"),
        ExistingConfiguration(area="DNS", field="Servidores", value=dns.get("servers") or "Não configurado"),
    ]
    existing.extend(
        ExistingConfiguration(
            area="Endereços IP",
            field=str(row.get("interface") or "Interface"),
            value=str(row.get("address") or "Sem endereço"),
        )
        for row in ip_rows
        if not _optional_bool(row.get("disabled"))
    )


    for item in bridge_rows:
        name = item.get("name")
        if not name:
            continue
        ports = sorted(
            str(row.get("interface"))
            for row in bridge_ports
            if row.get("bridge") == name and row.get("interface") and not _optional_bool(row.get("disabled"))
        )
        existing.append(ExistingConfiguration(
            area="Bridges",
            field=str(name),
            value=", ".join(ports) if ports else "Sem portas ativas",
        ))
    existing.extend(
        ExistingConfiguration(
            area="DHCP Client",
            field=str(row.get("interface") or "Interface"),
            value="Inativo" if _optional_bool(row.get("disabled")) else "Ativo",
        )
        for row in dhcp_rows
    )
    existing.extend(
        ExistingConfiguration(
            area="DHCP Server",
            field=str(row.get("name") or row.get("interface") or "Servidor"),
            value=("Inativo" if _optional_bool(row.get("disabled")) else "Ativo")
            + (f" · pool {row.get('address-pool')}" if row.get("address-pool") else ""),
        )
        for row in dhcp_server_rows
    )
    existing.extend(
        ExistingConfiguration(
            area="Pools IP",
            field=str(row.get("name") or "Pool"),
            value=str(row.get("ranges") or "Sem faixa"),
        )
        for row in pool_rows
    )
    existing.extend(
        ExistingConfiguration(
            area="Serviços",
            field=str(row.get("name") or "Serviço"),
            value=("Inativo" if _optional_bool(row.get("disabled")) else "Ativo")
            + (f" · porta {row.get('port')}" if row.get("port") else ""),
        )
        for row in service_rows
    )
    return BasicNetworkPreview(
        device_identity=identity.get("name") or "MikroTik",
        existing=existing,
        changes=changes,
        warnings=warnings,
        reconnect_ip=(
            configuration.lan_address.ip
            if configuration.lan_address
            else request.connection.host
        ),
    )


def preview_basic_network(request: BasicNetworkPreviewRequest) -> BasicNetworkPreview:
    return _with_connection(
        request.connection,
        lambda client: _build_preview(client, request),
    )


def _active(row: dict) -> bool:
    return not _optional_bool(row.get("disabled"))


def _route_interface(
    route: dict,
    interface_names: set[str],
    ip_rows: list[dict],
) -> str | None:
    immediate_gateway = route.get("immediate-gw") or route.get("immediate-gateway")
    if immediate_gateway and "%" in immediate_gateway:
        return immediate_gateway.rsplit("%", 1)[-1]
    gateway = route.get("gateway")
    if gateway in interface_names:
        return gateway
    try:
        gateway_ip = IPv4Address(str(gateway).split("%", 1)[0])
    except ValueError:
        return None
    matching_address = next(
        (
            row
            for row in ip_rows
            if row.get("interface") in interface_names
            and row.get("address")
            and _active(row)
            and gateway_ip in IPv4Interface(str(row.get("address"))).network
        ),
        None,
    )
    return str(matching_address.get("interface")) if matching_address else None


def _read_basic_network_state(client: Any) -> BasicNetworkCurrentState:
    identity = _first_row(client.run("/system/identity/print"))
    interface_rows = _rows(client.run("/interface/print"))
    ethernet_rows = _rows(client.run("/interface/ethernet/print"))
    bridge_rows = _rows(client.run("/interface/bridge/print"))
    bridge_ports = _rows(client.run("/interface/bridge/port/print"))
    ip_rows = _rows(client.run("/ip/address/print"))
    route_rows = _rows(client.run("/ip/route/print"))
    dhcp_rows = _rows(client.run("/ip/dhcp-client/print"))
    dns = _first_row(client.run("/ip/dns/print"))
    nat_rows = _rows(client.run("/ip/firewall/nat/print"))
    dhcp_server_rows = _rows(client.run("/ip/dhcp-server/print"))
    pool_rows = _rows(client.run("/ip/pool/print"))
    service_rows = _rows(client.run("/ip/service/print"))

    interface_names = {
        str(row.get("name") or row.get("default-name"))
        for row in interface_rows
        if row.get("name") or row.get("default-name")
    }
    ethernet_names = {
        str(row.get("name") or row.get("default-name"))
        for row in ethernet_rows
        if row.get("name") or row.get("default-name")
    }
    wifi_names = {
        str(row.get("name") or row.get("default-name"))
        for row in interface_rows
        if row.get("name") or row.get("default-name")
        if any(token in str(row.get("type") or "").lower() for token in ("wifi", "wlan", "wireless"))
    }
    active_default_route = next(
        (
            row
            for row in route_rows
            if row.get("dst-address") in (None, "", "0.0.0.0/0") and _active(row)
        ),
        None,
    )
    active_dhcp = next(
        (row for row in dhcp_rows if row.get("interface") and _active(row)),
        None,
    )
    routed_interface = (
        _route_interface(active_default_route, interface_names, ip_rows)
        if active_default_route
        else None
    )
    static_wifi_interface = next(
        (
            str(row.get("interface"))
            for row in ip_rows
            if row.get("interface") in wifi_names
            and row.get("address")
            and _active(row)
            and not _optional_bool(row.get("dynamic"))
        ),
        None,
    )
    wan_interface = str(
        (active_dhcp or {}).get("interface")
        or routed_interface
        or static_wifi_interface
        or next(
            (
                row.get("name") or row.get("default-name")
                for row in ethernet_rows
                if row.get("name") or row.get("default-name")
            ),
            "ether1",
        )
    )
    static_wan_address = next(
        (
            str(row.get("address"))
            for row in ip_rows
            if row.get("interface") == wan_interface
            and row.get("address")
            and _active(row)
            and not _optional_bool(row.get("dynamic"))
        ),
        None,
    )
    gateway = (
        str(active_default_route.get("gateway"))
        if active_default_route and active_default_route.get("gateway")
        else None
    )
    static_wan_complete = bool(
        static_wan_address and gateway and gateway not in interface_names
    )
    active_bridge_names = [
        str(row.get("name"))
        for row in bridge_rows
        if row.get("name") and _active(row)
    ]

    def bridge_score(name: str) -> tuple[int, int, int]:
        has_address = any(
            row.get("interface") == name and row.get("address") and _active(row)
            for row in ip_rows
        )
        physical_ports = sum(
            1
            for row in bridge_ports
            if row.get("bridge") == name
            and row.get("interface") in ethernet_names
            and row.get("interface") != wan_interface
            and _active(row)
        )
        return (int(has_address), int(name in {"bridge-lan", "bridge"}), physical_ports)

    lan_bridge = max(active_bridge_names, key=bridge_score) if active_bridge_names else None
    lan_ports = sorted(
        str(row.get("interface"))
        for row in bridge_ports
        if lan_bridge
        and row.get("bridge") == lan_bridge
        and row.get("interface") in ethernet_names
        and row.get("interface") != wan_interface
        and _active(row)
    )
    lan_address_row = next(
        (
            row
            for row in ip_rows
            if lan_bridge
            and row.get("interface") == lan_bridge
            and row.get("address")
            and row.get("comment") == "ORION Field - LAN"
            and _active(row)
        ),
        None,
    ) or next(
        (
            row
            for row in ip_rows
            if lan_bridge
            and row.get("interface") == lan_bridge
            and row.get("address")
            and _active(row)
        ),
        None,
    )
    lan_address = (
        str(lan_address_row.get("address"))
        if lan_address_row
        else None
    )
    configure_lan = bool(lan_bridge and lan_address and lan_ports)
    lan_dhcp = next(
        (
            row
            for row in dhcp_server_rows
            if lan_bridge and row.get("interface") == lan_bridge and _active(row)
        ),
        None,
    )
    pool_name = lan_dhcp.get("address-pool") if lan_dhcp else None
    pool = _find_row(pool_rows, "name", pool_name) if pool_name else None
    pool_range = str(pool.get("ranges")) if pool and pool.get("ranges") else ""
    pool_start, separator, pool_end = pool_range.split(",", 1)[0].partition("-")
    service_states = {
        row.get("name"): _active(row)
        for row in service_rows
        if row.get("name")
    }
    static_dns = [
        server.strip()
        for server in str(dns.get("servers") or "").split(",")
        if server.strip()
    ]

    return BasicNetworkCurrentState(
        identity=str(identity.get("name") or "MikroTik"),
        wan_interface=wan_interface,
        wan_mode="dhcp" if active_dhcp or not static_wan_complete else "static",
        wan_address=static_wan_address if static_wan_complete else None,
        gateway=gateway if static_wan_complete else None,
        configure_lan=configure_lan,
        lan_bridge=lan_bridge if configure_lan else None,
        lan_address=lan_address if configure_lan else None,
        lan_ports=lan_ports if configure_lan else [],
        dns_servers=static_dns[:3],
        enable_nat=any(
            row.get("action") == "masquerade" and _active(row)
            for row in nat_rows
        ),
        enable_lan_dhcp=bool(lan_dhcp),
        dhcp_pool_start=pool_start if separator else None,
        dhcp_pool_end=pool_end if separator else None,
        enable_ssh=service_states.get("ssh", False),
        enable_winbox=service_states.get("winbox", False),
        enable_webfig_https=service_states.get("www-ssl", False),
        enable_telnet=service_states.get("telnet", False),
        enable_ftp=service_states.get("ftp", False),
        enable_webfig_http=service_states.get("www", False),
    )


def read_basic_network_state(connection: MikroTikConnection) -> BasicNetworkCurrentState:
    return _with_connection(connection, _read_basic_network_state)


def _ensure_ip(
    client: Any,
    rows: list[dict],
    *,
    address: str,
    interface: str,
    comment: str,
) -> None:
    managed = _find_row(rows, "comment", comment)
    matching = _find_row(rows, "address", address)
    if matching and managed is None:
        if (
            matching.get("interface") == interface
            and not _optional_bool(matching.get("disabled"))
        ):
            return
        raise ConfigurationConflictError(
            f"O endereço {address} já existe em {matching.get('interface') or 'outra interface'}. "
            "O ORION não o moverá automaticamente."
        )
    row = managed or matching
    if row:
        client.run(
            "/ip/address/set",
            f"=.id={_record_id(row, 'endereço IP')}",
            f"=address={address}",
            f"=interface={interface}",
            f"=comment={comment}",
            "=disabled=no",
        )
        return
    client.run(
        "/ip/address/add",
        f"=address={address}",
        f"=interface={interface}",
        f"=comment={comment}",
    )


def _disable_managed(client: Any, rows: list[dict], menu: str, comment: str) -> None:
    managed = _find_row(rows, "comment", comment)
    if managed and not _optional_bool(managed.get("disabled")):
        client.run(
            f"{menu}/set",
            f"=.id={_record_id(managed, comment)}",
            "=disabled=yes",
        )


def _configure_dhcp_wan(
    client: Any,
    context: dict[str, list[dict]],
    configuration: BasicNetworkConfiguration,
) -> None:
    _disable_managed(
        client,
        context["ip_addresses"],
        "/ip/address",
        "ORION Field - WAN",
    )
    _disable_managed(
        client,
        context["routes"],
        "/ip/route",
        "ORION Field - gateway WAN",
    )
    managed = _find_row(context["dhcp_clients"], "comment", "ORION Field - WAN")
    matching = next(
        (
            row
            for row in context["dhcp_clients"]
            if row.get("interface") == configuration.wan_interface
            and not _optional_bool(row.get("disabled"))
        ),
        None,
    )
    if managed:
        client.run(
            "/ip/dhcp-client/set",
            f"=.id={_record_id(managed, 'DHCP Client da WAN')}",
            f"=interface={configuration.wan_interface}",
            "=add-default-route=yes",
            "=use-peer-dns=no",
            "=disabled=no",
        )
    elif matching is None:
        client.run(
            "/ip/dhcp-client/add",
            f"=interface={configuration.wan_interface}",
            "=add-default-route=yes",
            "=use-peer-dns=no",
            "=disabled=no",
            "=comment=ORION Field - WAN",
        )


def _configure_static_wan(
    client: Any,
    context: dict[str, list[dict]],
    configuration: BasicNetworkConfiguration,
) -> None:
    _disable_managed(
        client,
        context["dhcp_clients"],
        "/ip/dhcp-client",
        "ORION Field - WAN",
    )
    _ensure_ip(
        client,
        context["ip_addresses"],
        address=str(configuration.wan_address),
        interface=configuration.wan_interface,
        comment="ORION Field - WAN",
    )
    managed_route = _find_row(
        context["routes"],
        "comment",
        "ORION Field - gateway WAN",
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
    if managed_route:
        client.run(
            "/ip/route/set",
            f"=.id={_record_id(managed_route, 'gateway da WAN')}",
            "=dst-address=0.0.0.0/0",
            f"=gateway={configuration.gateway}",
            "=distance=1",
            "=disabled=no",
        )
    elif matching_route is None:
        client.run(
            "/ip/route/add",
            "=dst-address=0.0.0.0/0",
            f"=gateway={configuration.gateway}",
            "=distance=1",
            "=comment=ORION Field - gateway WAN",
        )


def _configure_nat(
    client: Any,
    rows: list[dict],
    configuration: BasicNetworkConfiguration,
) -> None:
    managed = _find_row(rows, "comment", "ORION Field - NAT")
    if not configuration.enable_nat:
        if managed and not _optional_bool(managed.get("disabled")):
            client.run(
                "/ip/firewall/nat/set",
                f"=.id={_record_id(managed, 'regra de NAT')}",
                "=disabled=yes",
            )
        return

    matching = next(
        (
            row
            for row in rows
            if row.get("chain") == "srcnat"
            and row.get("action") == "masquerade"
            and row.get("out-interface") == configuration.wan_interface
            and not _optional_bool(row.get("disabled"))
        ),
        None,
    )
    if managed:
        client.run(
            "/ip/firewall/nat/set",
            f"=.id={_record_id(managed, 'regra de NAT')}",
            "=chain=srcnat",
            "=action=masquerade",
            f"=out-interface={configuration.wan_interface}",
            "=disabled=no",
        )
    elif matching is None:
        client.run(
            "/ip/firewall/nat/add",
            "=chain=srcnat",
            "=action=masquerade",
            f"=out-interface={configuration.wan_interface}",
            "=comment=ORION Field - NAT",
        )


def _dhcp_pool_range(lan_address: IPv4Interface) -> str:
    network = lan_address.network
    first = int(network.network_address) + 1
    last = int(network.broadcast_address) - 1
    gateway = int(lan_address.ip)
    segments = [
        (first, gateway - 1),
        (gateway + 1, last),
    ]
    usable = [(start, end) for start, end in segments if start <= end]
    if not usable:
        raise ConfigurationConflictError(
            "A rede LAN não possui endereços livres para o DHCP Server."
        )
    start, end = max(usable, key=lambda segment: segment[1] - segment[0])
    if end - start + 1 >= 199:
        start += 98
    end = min(end, start + 99)
    return f"{IPv4Address(start)}-{IPv4Address(end)}"


def _resolved_dhcp_pool(configuration: BasicNetworkConfiguration) -> str:
    if configuration.dhcp_pool_start and configuration.dhcp_pool_end:
        return f"{configuration.dhcp_pool_start}-{configuration.dhcp_pool_end}"
    return _dhcp_pool_range(configuration.lan_address)


def _configure_lan_dhcp(
    client: Any,
    context: dict[str, list[dict]],
    configuration: BasicNetworkConfiguration,
) -> None:
    pool = _find_row(context["dhcp_pools"], "name", "orion-lan-pool")
    server = _find_row(context["dhcp_servers"], "name", "orion-lan-dhcp")
    network_row = _find_row(
        context["dhcp_networks"],
        "comment",
        "ORION Field - LAN",
    )
    if not configuration.enable_lan_dhcp:
        if server and not _optional_bool(server.get("disabled")):
            client.run(
                "/ip/dhcp-server/set",
                f"=.id={_record_id(server, 'DHCP Server da LAN')}",
                "=disabled=yes",
            )
        return

    pool_range = _resolved_dhcp_pool(configuration)
    if pool:
        client.run(
            "/ip/pool/set",
            f"=.id={_record_id(pool, 'pool DHCP da LAN')}",
            f"=ranges={pool_range}",
        )
    else:
        client.run(
            "/ip/pool/add",
            "=name=orion-lan-pool",
            f"=ranges={pool_range}",
        )

    if server:
        client.run(
            "/ip/dhcp-server/set",
            f"=.id={_record_id(server, 'DHCP Server da LAN')}",
            f"=interface={configuration.lan_bridge}",
            "=address-pool=orion-lan-pool",
            "=disabled=no",
        )
    else:
        client.run(
            "/ip/dhcp-server/add",
            "=name=orion-lan-dhcp",
            f"=interface={configuration.lan_bridge}",
            "=address-pool=orion-lan-pool",
            "=disabled=no",
        )

    network = str(configuration.lan_address.network)
    dns_servers = ",".join(str(server) for server in configuration.dns_servers)
    words = (
        f"=address={network}",
        f"=gateway={configuration.lan_address.ip}",
        f"=dns-server={dns_servers}",
        "=comment=ORION Field - LAN",
    )
    if network_row:
        client.run(
            "/ip/dhcp-server/network/set",
            f"=.id={_record_id(network_row, 'rede DHCP da LAN')}",
            *words,
        )
    else:
        client.run("/ip/dhcp-server/network/add", *words)


def _configure_access_services(
    client: Any,
    rows: list[dict],
    configuration: BasicNetworkConfiguration,
) -> None:
    desired_states = {
        "ssh": configuration.enable_ssh,
        "winbox": configuration.enable_winbox,
        "www-ssl": configuration.enable_webfig_https,
        "telnet": configuration.enable_telnet,
        "ftp": configuration.enable_ftp,
        "www": configuration.enable_webfig_http,
    }
    for row in rows:
        service_name = row.get("name")
        if service_name in desired_states:
            enabled = not _optional_bool(row.get("disabled"))
            desired_enabled = desired_states[service_name]
            if enabled == desired_enabled:
                continue
            client.run(
                "/ip/service/set",
                f"=.id={_record_id(row, f'serviço {service_name}')}",
                f"=disabled={'no' if desired_enabled else 'yes'}",
            )


def apply_basic_network(
    request: BasicNetworkApplyRequest,
) -> BasicNetworkApplyResult:
    def apply(client: Any) -> BasicNetworkApplyResult:
        preview_request = BasicNetworkPreviewRequest(
            connection=request.connection,
            configuration=request.configuration,
        )
        preview = _build_preview(client, preview_request)
        configuration = request.configuration
        context = {
            "bridges": _rows(client.run("/interface/bridge/print")),
            "bridge_ports": _rows(client.run("/interface/bridge/port/print")),
            "ip_addresses": _rows(client.run("/ip/address/print")),
            "routes": _rows(client.run("/ip/route/print")),
            "dhcp_clients": _rows(client.run("/ip/dhcp-client/print")),
            "nat": _rows(client.run("/ip/firewall/nat/print")),
            "dhcp_pools": _rows(client.run("/ip/pool/print")),
            "dhcp_servers": _rows(client.run("/ip/dhcp-server/print")),
            "dhcp_networks": _rows(client.run("/ip/dhcp-server/network/print")),
            "services": _rows(client.run("/ip/service/print")),
        }
        backup_name = f"orion-before-network-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}"

        client.run("/system/backup/save", f"=name={backup_name}")
        client.run("/system/identity/set", f"=name={configuration.identity}")
        if configuration.configure_lan:
            _ensure_bridge(client, context, configuration.lan_bridge)
            _ensure_ip(
                client,
                context["ip_addresses"],
                address=str(configuration.lan_address),
                interface=configuration.lan_bridge,
                comment="ORION Field - LAN",
            )
        client.run(
            "/ip/dns/set",
            f"=servers={','.join(str(server) for server in configuration.dns_servers)}",
            "=allow-remote-requests=yes",
        )
        if configuration.wan_mode == "dhcp":
            _configure_dhcp_wan(client, context, configuration)
        else:
            _configure_static_wan(client, context, configuration)
        if configuration.configure_lan:
            _configure_nat(client, context["nat"], configuration)
            _configure_lan_dhcp(client, context, configuration)
        _configure_access_services(client, context["services"], configuration)

        # Ports are moved last because changing the ingress interface can end
        # the current API session. The LAN address already exists at this point.
        if configuration.configure_lan:
            for interface in configuration.lan_ports:
                _ensure_bridge_port(
                    client,
                    context,
                    interface,
                    configuration.lan_bridge,
                )

        return BasicNetworkApplyResult(
            status="applied",
            backup_file=f"{backup_name}.backup",
            reconnect_ip=(
                configuration.lan_address.ip
                if configuration.lan_address
                else request.connection.host
            ),
            changes_applied=len(preview.changes),
            summary=(
                "A rede básica foi enviada. Conecte o computador a uma porta LAN "
                "e acesse o MikroTik pelo novo IP."
                if configuration.configure_lan
                else "A rede básica foi enviada sem alterar a configuração LAN."
            ),
        )

    return _with_connection(request.connection, apply)
