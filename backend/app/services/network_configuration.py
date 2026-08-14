from typing import Any

from app.models.configuration import (
    BasicNetworkConfiguration,
    BasicNetworkPreview,
    BasicNetworkPreviewRequest,
    ConfigurationChange,
)
from app.services.configuration import ConfigurationConflictError, _find_row
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
        "Esta etapa apenas mostra a prévia e não altera o MikroTik.",
        "Ao aplicar futuramente, um backup será criado antes da primeira alteração.",
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
