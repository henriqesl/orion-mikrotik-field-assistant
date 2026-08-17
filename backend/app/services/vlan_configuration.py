from datetime import UTC, datetime
from typing import Any

from app.models.configuration import (
    ConfigurationChange,
    VlanApplyRequest,
    VlanApplyResult,
    VlanConfiguration,
    VlanPreview,
    VlanPreviewRequest,
)
from app.services.configuration import ConfigurationConflictError, _find_row, _record_id
from app.services.network_configuration import _dhcp_pool_range, _ensure_ip
from app.services.routeros import _first_row, _optional_bool, _rows, _with_connection


def _context(client: Any, configuration: VlanConfiguration) -> dict[str, Any]:
    context = {
        "identity": _first_row(client.run("/system/identity/print")),
        "bridges": _rows(client.run("/interface/bridge/print")),
        "ports": _rows(client.run("/interface/bridge/port/print")),
        "vlans": _rows(client.run("/interface/vlan/print")),
        "vlan_table": _rows(client.run("/interface/bridge/vlan/print")),
        "addresses": _rows(client.run("/ip/address/print")),
        "pools": _rows(client.run("/ip/pool/print")),
        "dhcp_servers": _rows(client.run("/ip/dhcp-server/print")),
        "dhcp_networks": _rows(client.run("/ip/dhcp-server/network/print")),
    }
    bridge = _find_row(context["bridges"], "name", configuration.bridge)
    if not bridge:
        raise ConfigurationConflictError("A bridge selecionada não existe mais.")
    bridge_ports = {
        row.get("interface")
        for row in context["ports"]
        if row.get("bridge") == configuration.bridge and row.get("interface")
    }
    selected = {*configuration.tagged_ports, *configuration.untagged_ports}
    missing = sorted(selected - bridge_ports)
    if missing:
        raise ConfigurationConflictError(
            f"Estas portas não pertencem à bridge: {', '.join(missing)}."
        )
    if configuration.enable_filtering and not (bridge_ports - selected):
        raise ConfigurationConflictError(
            "Mantenha ao menos uma porta da bridge fora da VLAN para recuperação."
        )
    existing = _find_row(context["vlans"], "name", configuration.name)
    if existing and (
        str(existing.get("vlan-id")) != str(configuration.vlan_id)
        or existing.get("interface") != configuration.bridge
    ):
        raise ConfigurationConflictError(
            "Já existe uma interface com esse nome e outra configuração."
        )
    matching_table = next(
        (row for row in context["vlan_table"] if row.get("bridge") == configuration.bridge and str(row.get("vlan-ids")) == str(configuration.vlan_id)),
        None,
    )
    if matching_table and matching_table.get("comment") != f"ORION Field - VLAN {configuration.vlan_id}":
        raise ConfigurationConflictError("Já existe uma regra preexistente para esse VLAN ID na bridge.")
    context["bridge"] = bridge
    context["bridge_ports"] = bridge_ports
    return context


def _pool_range(configuration: VlanConfiguration) -> str:
    if configuration.dhcp_pool_start and configuration.dhcp_pool_end:
        return f"{configuration.dhcp_pool_start}-{configuration.dhcp_pool_end}"
    return _dhcp_pool_range(configuration.address)


def _build_preview(client: Any, request: VlanPreviewRequest) -> VlanPreview:
    configuration = request.configuration
    context = _context(client, configuration)
    vlan = _find_row(context["vlans"], "name", configuration.name)
    managed_table = _find_row(
        context["vlan_table"], "comment", f"ORION Field - VLAN {configuration.vlan_id}"
    )
    current_ip = next(
        (row.get("address") for row in context["addresses"] if row.get("interface") == configuration.name and not _optional_bool(row.get("disabled"))),
        None,
    )
    server_name = f"orion-vlan-{configuration.vlan_id}-dhcp"
    server = _find_row(context["dhcp_servers"], "name", server_name)
    current_filtering = "Ativa" if _optional_bool(context["bridge"].get("vlan-filtering")) else "Desativada"
    current_dhcp = "Ativo" if server and not _optional_bool(server.get("disabled")) else "Inativo"
    desired_tagged = [configuration.bridge, *configuration.tagged_ports]
    comparisons = [
        ("VLAN", "Interface", vlan.get("name") if vlan else None, configuration.name),
        ("VLAN", "ID", vlan.get("vlan-id") if vlan else None, str(configuration.vlan_id)),
        ("VLAN", "Bridge", vlan.get("interface") if vlan else None, configuration.bridge),
        ("VLAN", "Endereço", current_ip, str(configuration.address)),
        ("Portas", "Tagged", managed_table.get("tagged") if managed_table else None, ", ".join(desired_tagged)),
        ("Portas", "Untagged", managed_table.get("untagged") if managed_table else None, ", ".join(configuration.untagged_ports) or "Nenhuma"),
        ("VLAN", "Filtragem", current_filtering, "Ativa" if configuration.enable_filtering else current_filtering),
        ("DHCP", "Servidor", current_dhcp, "Ativo" if configuration.enable_dhcp else current_dhcp),
    ]
    if configuration.enable_dhcp:
        comparisons.append(("DHCP", "Pool", None, _pool_range(configuration)))
    changes = [
        ConfigurationChange(area=area, field=field, current_value=current, new_value=new)
        for area, field, current, new in comparisons if current != new
    ]
    warnings = [
        "Um backup será criado antes da primeira alteração.",
        "Regras VLAN preexistentes não serão apagadas.",
    ]
    if configuration.enable_filtering:
        recovery = sorted(context["bridge_ports"] - {*configuration.tagged_ports, *configuration.untagged_ports})
        warnings.append(f"A filtragem será ativada por último. Porta de recuperação: {', '.join(recovery)}.")
    return VlanPreview(device_identity=context["identity"].get("name") or "MikroTik", changes=changes, warnings=warnings)


def preview_vlan(request: VlanPreviewRequest) -> VlanPreview:
    return _with_connection(request.connection, lambda client: _build_preview(client, request))


def _configure_dhcp(client: Any, context: dict[str, Any], configuration: VlanConfiguration) -> None:
    if not configuration.enable_dhcp:
        return
    suffix = str(configuration.vlan_id)
    pool_name = f"orion-vlan-{suffix}-pool"
    server_name = f"orion-vlan-{suffix}-dhcp"
    pool = _find_row(context["pools"], "name", pool_name)
    if pool:
        client.run("/ip/pool/set", f"=.id={_record_id(pool, 'pool da VLAN')}", f"=ranges={_pool_range(configuration)}")
    else:
        client.run("/ip/pool/add", f"=name={pool_name}", f"=ranges={_pool_range(configuration)}")
    server = _find_row(context["dhcp_servers"], "name", server_name)
    words = (f"=interface={configuration.name}", f"=address-pool={pool_name}", "=disabled=no")
    if server:
        client.run("/ip/dhcp-server/set", f"=.id={_record_id(server, 'DHCP da VLAN')}", *words)
    else:
        client.run("/ip/dhcp-server/add", f"=name={server_name}", *words)
    comment = f"ORION Field - VLAN {suffix}"
    network_row = _find_row(context["dhcp_networks"], "comment", comment)
    network_words = (f"=address={configuration.address.network}", f"=gateway={configuration.address.ip}", f"=dns-server={','.join(map(str, configuration.dns_servers))}", f"=comment={comment}")
    if network_row:
        client.run("/ip/dhcp-server/network/set", f"=.id={_record_id(network_row, 'rede DHCP da VLAN')}", *network_words)
    else:
        client.run("/ip/dhcp-server/network/add", *network_words)


def apply_vlan(request: VlanApplyRequest) -> VlanApplyResult:
    def apply(client: Any) -> VlanApplyResult:
        preview_request = VlanPreviewRequest(connection=request.connection, configuration=request.configuration)
        preview = _build_preview(client, preview_request)
        configuration = request.configuration
        context = _context(client, configuration)
        backup = f"orion-before-vlan-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}"
        client.run("/system/backup/save", f"=name={backup}")
        vlan = _find_row(context["vlans"], "name", configuration.name)
        vlan_words = (f"=name={configuration.name}", f"=vlan-id={configuration.vlan_id}", f"=interface={configuration.bridge}", "=disabled=no", f"=comment=ORION Field - VLAN {configuration.vlan_id}")
        if vlan:
            client.run("/interface/vlan/set", f"=.id={_record_id(vlan, 'interface VLAN')}", *vlan_words[1:])
        else:
            client.run("/interface/vlan/add", *vlan_words)
        _ensure_ip(client, context["addresses"], address=str(configuration.address), interface=configuration.name, comment=f"ORION Field - VLAN {configuration.vlan_id}")
        _configure_dhcp(client, context, configuration)
        table_comment = f"ORION Field - VLAN {configuration.vlan_id}"
        table = _find_row(context["vlan_table"], "comment", table_comment)
        table_words = (f"=bridge={configuration.bridge}", f"=vlan-ids={configuration.vlan_id}", f"=tagged={','.join([configuration.bridge, *configuration.tagged_ports])}", f"=untagged={','.join(configuration.untagged_ports)}", f"=comment={table_comment}")
        if table:
            client.run("/interface/bridge/vlan/set", f"=.id={_record_id(table, 'tabela VLAN')}", *table_words)
        else:
            client.run("/interface/bridge/vlan/add", *table_words)
        for interface in configuration.untagged_ports:
            port = _find_row(context["ports"], "interface", interface)
            client.run("/interface/bridge/port/set", f"=.id={_record_id(port, f'porta {interface}')}", f"=pvid={configuration.vlan_id}")
        if configuration.enable_filtering:
            client.run("/interface/bridge/set", f"=.id={_record_id(context['bridge'], 'bridge')}", "=vlan-filtering=yes")
        return VlanApplyResult(status="applied", backup_file=f"{backup}.backup", changes_applied=len(preview.changes), summary="A VLAN foi configurada. Valide a porta de acesso antes de encerrar a instalação.")
    return _with_connection(request.connection, apply)
