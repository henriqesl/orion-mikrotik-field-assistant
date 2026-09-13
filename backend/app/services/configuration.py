from datetime import UTC, datetime
from hashlib import sha256
from typing import Any
from app.services.ap_lock import validate_lock, apply_lock
from app.services.mutations import ConfigurationWriter

from app.models.configuration import (
    ConfigurationApplyRequest,
    ConfigurationApplyResult,
    ConfigurationChange,
    ExistingConfiguration,
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

    interface_rows = _rows(client.run("/interface/print"))
    available_interfaces = {
        row.get("name") or row.get("default-name"): row
        for row in interface_rows
        if row.get("name") or row.get("default-name")
    }
    missing_interfaces = sorted(
        name
        for name in configuration.bridge_interfaces
        if name not in available_interfaces
    )
    if configuration.manage_topology and missing_interfaces:
        raise ConfigurationConflictError(
            "As interfaces selecionadas não existem mais: "
            f"{', '.join(missing_interfaces)}."
        )

    if configuration.frequency_mhz is not None:
        # Coarse band check only. RouterOS still enforces hardware/country/DFS.
        band = (wifi.band or "").lower()
        limits = next((bounds for prefix, bounds in (("2ghz", (2400, 2500)), ("5ghz", (4900, 5925)), ("6ghz", (5925, 7125))) if band.startswith(prefix)), None)
        if limits and not limits[0] <= configuration.frequency_mhz <= limits[1]:
            raise ConfigurationConflictError("A frequência informada não corresponde à banda selecionada desta interface. Preserve a frequência atual ou escolha um canal da banda correta.")
    if wifi_row.get("configuration.manager") in {"capsman", "capsman-or-local"} or _optional_bool(wifi_row.get("dynamic")):
        raise ConfigurationConflictError("Esta interface é gerenciada centralmente. Peça ao responsável pela rede para ajustá-la no CAPsMAN.")
    if stack == "wireless" and wifi_row.get("wireless-protocol") in {"nv2", "nstreme", "nv2-nstreme", "nv2-nstreme-802.11"}:
        raise ConfigurationConflictError("Este enlace usa um protocolo avançado. Preserve-o e faça o ajuste pelo WinBox; o assistente básico usa enlaces 802.11.")
    if stack == "wireless" and configuration.passphrase is not None:
        profile_name = "orion-field-" + sha256(configuration.wifi_interface.encode()).hexdigest()[:12]
        if any(row.get("name") != configuration.wifi_interface and row.get("security-profile") == profile_name for row in wifi_rows):
            raise ConfigurationConflictError("O perfil de segurança desta interface foi compartilhado. Separe os perfis no WinBox antes de trocar a senha.")

    return {
        "identity": identity,
        "stack": stack,
        "wifi": wifi,
        "wifi_row": wifi_row,
        "interfaces": interface_rows,
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
    lock_state = validate_lock(client, context, configuration)
    wifi = context["wifi"]
    desired_mode = _desired_wifi_mode(configuration, modern=context["stack"] != "wireless")
    changes: list[ConfigurationChange] = []

    comparisons = [
        ("Equipamento", "Identidade", context["identity"].get("name"), configuration.identity),
        ("Rádio", "Função", wifi.mode, desired_mode),
        ("Rádio", "SSID", wifi.ssid, configuration.ssid),
    ]
    if configuration.frequency_mhz is not None:
        comparisons.append(("Rádio", "Frequência", wifi.frequency, str(configuration.frequency_mhz)))
    if configuration.channel_width:
        comparisons.append(("Rádio", "Largura", wifi.channel_width, configuration.channel_width))
    if configuration.country:
        comparisons.append(("Rádio", "País regulatório", context["wifi_row"].get("configuration.country") or context["wifi_row"].get("country"), configuration.country))
    if configuration.manage_topology:
        comparisons.extend([
            (
                "Bridge",
                f"Porta {configuration.wifi_interface}",
                _current_bridge(context, configuration.wifi_interface),
                configuration.bridge_name,
            ),
            *(
                (
                    "Bridge",
                    f"Porta {interface}",
                    _current_bridge(context, interface),
                    configuration.bridge_name,
                )
                for interface in configuration.bridge_interfaces
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
        ])
    changes.extend(
        _change(area, field, current, new)
        for area, field, current, new in comparisons
        if current != new
    )
    if configuration.ap_lock_action != "preserve":
        changes.append(_change("Enlace", "Lock no AP (BSSID)", lock_state.locked_bssid or "Sem lock ORION confirmado", str(configuration.ap_bssid) if configuration.ap_lock_action == "lock" else "Remover lock ORION e restaurar regra anterior"))
    if configuration.passphrase is not None:
        changes.append(
            _change("Segurança", "Senha WPA2", "Protegida pelo RouterOS", "Será atualizada", sensitive=True)
        )

    warnings = [
        "A interface Wi-Fi será reiniciada e o enlace poderá cair temporariamente.",
        "Um backup binário será criado no MikroTik antes da primeira alteração.",
        "Servidores DHCP, clientes DHCP, regras de NAT e firewall existentes não serão removidos. Em rádios novos, use a preparação limpa do manual de campo.",
    ]
    if configuration.manage_topology:
        warnings.insert(
            2,
            "Endereços IP existentes não serão removidos nem movidos; um IP novo será adicionado somente se necessário.",
        )
    else:
        warnings.insert(
            2,
            "Bridge, portas, IPs, gateway, DHCP, NAT e firewall serão preservados.",
        )
    if context["stack"] == "wireless" and configuration.passphrase is not None:
        warnings.append(
            "O equipamento usa Wireless legado; o ORION aplicará o perfil WPA2 compatível."
        )
    if configuration.role == "station" and configuration.device_kind == "radio":
        warnings.append(
            "Station-bridge exige um AP MikroTik com a mesma família de driver Wi-Fi."
        )
    if configuration.frequency_mhz is not None:
        warnings.append("A frequência depende do país e dos canais permitidos pelo RouterOS; canais DFS podem demorar a iniciar. Confirme a associação antes de encerrar o serviço.")
    if configuration.ap_lock_action == "lock":
        warnings.append("A Station aceitará somente o MAC do AP escolhido; se ele estiver fora de alcance ou incorreto, o enlace não conectará. Lock não substitui a senha WPA2.")
    if configuration.passphrase is None:
        warnings.append("A senha e os métodos de segurança atuais serão mantidos. Para um enlace novo, defina a mesma senha WPA2 nos dois lados.")

    preview = ConfigurationPreview(
        device_identity=context["identity"].get("name") or "MikroTik",
        wifi_stack=context["stack"],
        existing=[
            ExistingConfiguration(
                area=area,
                field=field,
                value=current or "Não configurado",
            )
            for area, field, current, _new in comparisons
        ] + [
            ExistingConfiguration(
                area="Endereços IP",
                field=str(row.get("interface") or "Interface"),
                value=str(row.get("address") or "Sem endereço"),
            )
            for row in context["ip_addresses"]
            if not _optional_bool(row.get("disabled"))
        ],
        changes=changes,
        warnings=warnings,
        reconnect_ip=(
            configuration.management_ip.ip
            if configuration.manage_topology
            else request.connection.host
        ),
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
    mode = _desired_wifi_mode(configuration, modern=True)
    client.run(
        f"/interface/{context['stack']}/set",
        f"=.id={_record_id(context['wifi_row'], 'interface Wi-Fi')}",
        f"=configuration.mode={mode}",
        *((f"=configuration.country={configuration.country}",) if configuration.country else ()),
        f"=configuration.ssid={configuration.ssid}",
        *((f"=channel.frequency={configuration.frequency_mhz}",) if configuration.frequency_mhz is not None else ()),
        *((f"=channel.width={configuration.channel_width}",) if configuration.channel_width else ()),
        *(("=security.authentication-types=wpa2-psk", f"=security.passphrase={configuration.passphrase}") if configuration.passphrase is not None else ()),
        "=disabled=no",
    )


def _configure_legacy_wifi(
    client: Any,
    context: dict[str, Any],
    configuration: LinkConfiguration,
) -> None:
    profile_name = "orion-field-" + sha256(configuration.wifi_interface.encode()).hexdigest()[:12]
    profiles = _rows(client.run("/interface/wireless/security-profiles/print"))
    profile = _find_row(profiles, "name", profile_name)
    profile_words = (
        "=mode=dynamic-keys",
        "=authentication-types=wpa2-psk",
        "=unicast-ciphers=aes-ccm",
        "=group-ciphers=aes-ccm",
        f"=wpa2-pre-shared-key={configuration.passphrase}",
    )
    if configuration.passphrase is None:
        pass  # Keep the currently selected security profile and all its properties.
    elif profile:
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

    mode = _desired_wifi_mode(configuration, modern=False)
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
        *((f"=frequency={configuration.frequency_mhz}",) if configuration.frequency_mhz is not None else ()),
        *((f"=channel-width={width}",) if configuration.channel_width else ()),
        *(("=country=brazil",) if configuration.country else ()),
        *((f"=security-profile={profile_name}",) if configuration.passphrase is not None else ()),
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
        # An address already in use may be the path of the current API
        # session. Moving it between interfaces can immediately strand the
        # technician, so an exact match is always preserved in place.
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
        backup_name = f"orion-before-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S-%f')}"

        writer = ConfigurationWriter(client, backup_name)
        writer.create_backup()
        client = writer.tracked_client("o envio da configuração Wi-Fi")
        client.run("/system/identity/set", f"=name={configuration.identity}")
        if configuration.manage_topology:
            _ensure_bridge(client, context, configuration.bridge_name)

        if context["stack"] in {"wifi", "wifiwave2"}:
            _configure_modern_wifi(client, context, configuration)
        else:
            _configure_legacy_wifi(client, context, configuration)
        apply_lock(client, context, configuration, writer=writer)

        if configuration.manage_topology:
            _ensure_gateway(client, context, configuration)
            _ensure_management_ip(client, context, configuration)
            _ensure_bridge_port(
                client,
                context,
                configuration.wifi_interface,
                configuration.bridge_name,
            )
            # Physical ports are deliberately moved last: changing the ingress
            # port can interrupt the API session.
            for interface in configuration.bridge_interfaces:
                _ensure_bridge_port(
                    client,
                    context,
                    interface,
                    configuration.bridge_name,
                )

        return ConfigurationApplyResult(
            status="applied",
            backup_file=f"{backup_name}.backup",
            reconnect_ip=(
                configuration.management_ip.ip
                if configuration.manage_topology
                else request.connection.host
            ),
            changes_applied=len(preview.changes),
            summary=(
                "A configuração foi enviada ao MikroTik. Reconecte no IP informado "
                "e execute a validação do enlace."
                if configuration.manage_topology
                else "A configuração Wi-Fi foi enviada sem alterar a topologia de rede."
            ),
        )

    return _with_connection(request.connection, apply)


def _desired_wifi_mode(
    configuration: LinkConfiguration,
    *,
    modern: bool,
) -> str:
    if configuration.role == "ap":
        return "ap" if modern else ("bridge" if configuration.device_kind == "radio" and configuration.link_scenario == "pair" else "ap-bridge")
    return "station-bridge" if configuration.device_kind == "radio" else "station"
