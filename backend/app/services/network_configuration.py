from datetime import UTC, datetime
from typing import Any

from app.models.configuration import (
    BasicNetworkApplyRequest,
    BasicNetworkApplyResult,
    BasicNetworkConfiguration,
    BasicNetworkPreview,
    BasicNetworkPreviewRequest,
    ConfigurationChange,
)
from app.services.configuration import (
    ConfigurationConflictError,
    _ensure_bridge,
    _ensure_bridge_port,
    _find_row,
    _record_id,
)
from app.services.routeros import _first_row, _optional_bool, _rows, _with_connection


def _validate_interfaces(
    ethernet_rows: list[dict],
    configuration: BasicNetworkConfiguration,
) -> None:
    available = {
        row.get("name") or row.get("default-name")
        for row in ethernet_rows
    }
    selected = {configuration.wan_interface, *configuration.lan_ports}
    missing = sorted(item for item in selected if item not in available)
    if missing:
        raise ConfigurationConflictError(
            f"As interfaces selecionadas não existem mais: {', '.join(missing)}."
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
    ethernet_rows = _rows(client.run("/interface/ethernet/print"))
    bridge_rows = _rows(client.run("/interface/bridge/print"))
    bridge_ports = _rows(client.run("/interface/bridge/port/print"))
    ip_rows = _rows(client.run("/ip/address/print"))
    route_rows = _rows(client.run("/ip/route/print"))
    dhcp_rows = _rows(client.run("/ip/dhcp-client/print"))
    dns = _first_row(client.run("/ip/dns/print"))
    nat_rows = _rows(client.run("/ip/firewall/nat/print"))
    _validate_interfaces(ethernet_rows, configuration)

    bridge = _find_row(bridge_rows, "name", configuration.lan_bridge)
    current_lan_ip = next(
        (
            row.get("address")
            for row in ip_rows
            if row.get("interface") == configuration.lan_bridge
            and not _optional_bool(row.get("disabled"))
        ),
        None,
    )
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
        if row.get("bridge") == configuration.lan_bridge
        and row.get("interface")
        and not _optional_bool(row.get("disabled"))
    )
    managed_nat = _find_row(nat_rows, "comment", "ORION Field - NAT")

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
            "LAN",
            "Bridge",
            bridge.get("name") if bridge else None,
            configuration.lan_bridge,
        ),
        ("LAN", "Endereço", current_lan_ip, str(configuration.lan_address)),
        ("LAN", "Portas", ", ".join(current_ports) or None, ", ".join(configuration.lan_ports)),
        (
            "DNS",
            "Servidores",
            dns.get("servers"),
            ", ".join(str(server) for server in configuration.dns_servers),
        ),
        (
            "Internet",
            "NAT",
            "Ativo" if managed_nat and not _optional_bool(managed_nat.get("disabled")) else "Não gerenciado",
            "Ativar masquerade" if configuration.enable_nat else "Não configurar",
        ),
    ]
    changes = [
        _change(area, field, current, new)
        for area, field, current, new in comparisons
        if current != new
    ]
    warnings = [
        "Um backup será criado antes da primeira alteração.",
        "A sessão pode cair ao mover as portas LAN; reconecte pelo novo IP da LAN.",
        "Regras existentes não serão apagadas automaticamente.",
    ]
    return BasicNetworkPreview(
        device_identity=identity.get("name") or "MikroTik",
        changes=changes,
        warnings=warnings,
        reconnect_ip=configuration.lan_address.ip,
    )


def preview_basic_network(request: BasicNetworkPreviewRequest) -> BasicNetworkPreview:
    return _with_connection(
        request.connection,
        lambda client: _build_preview(client, request),
    )


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
        }
        backup_name = f"orion-before-network-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}"

        client.run("/system/backup/save", f"=name={backup_name}")
        client.run("/system/identity/set", f"=name={configuration.identity}")
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
        _configure_nat(client, context["nat"], configuration)

        # Ports are moved last because changing the ingress interface can end
        # the current API session. The LAN address already exists at this point.
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
            reconnect_ip=configuration.lan_address.ip,
            changes_applied=len(preview.changes),
            summary=(
                "A rede básica foi enviada. Conecte o computador a uma porta LAN "
                "e acesse o MikroTik pelo novo IP."
            ),
        )

    return _with_connection(request.connection, apply)
