from datetime import UTC, datetime
import re
from typing import Any

from routeros.errors import DeviceError

from app.models.configuration import (
    ConfigurationChange,
    ExistingConfiguration,
    LoraProtectionApplyRequest,
    LoraProtectionApplyResult,
    LoraProtectionConfiguration,
    LoraProtectionPreview,
    LoraProtectionPreviewRequest,
)
from app.services.configuration import ConfigurationConflictError, _find_row, _record_id
from app.services.routeros import _first_row, _optional_bool, _rows, _with_connection


LORA_SCRIPT = "orion-lora-watchdog"
LORA_SCHEDULER = "orion-lora-watchdog-schedule"
WAN_SCRIPT = "orion-wan-watchdog"
WAN_SCHEDULER = "orion-wan-watchdog-schedule"
SCRIPT_POLICY = "read,write,test"
REBOOT_SCRIPT_POLICY = "reboot,read,write,test"


def _context(client: Any, configuration: LoraProtectionConfiguration) -> dict[str, Any]:
    try:
        lora_interfaces = _rows(client.run("/iot/lora/print"))
    except DeviceError as error:
        raise ConfigurationConflictError(
            "O menu /iot lora não está disponível. Confirme o RouterOS 7 e o pacote IoT."
        ) from error

    if not lora_interfaces:
        raise ConfigurationConflictError(
            "Nenhuma interface LoRa foi encontrada neste equipamento."
        )

    return {
        "identity": _first_row(client.run("/system/identity/print")),
        "lora": lora_interfaces[0],
        "scripts": _rows(client.run("/system/script/print")),
        "schedulers": _rows(client.run("/system/scheduler/print")),
    }


def _state(row: dict[str, str] | None) -> str | None:
    if row is None:
        return None
    return "Inativo" if _optional_bool(row.get("disabled")) else "Ativo"


def _desired_state(enabled: bool) -> str:
    return "Ativo" if enabled else "Inativo"


def _change(
    area: str, field: str, current: str | None, desired: str
) -> ConfigurationChange | None:
    if current == desired:
        return None
    return ConfigurationChange(
        area=area,
        field=field,
        current_value=current,
        new_value=desired,
    )


def _build_preview(
    client: Any, request: LoraProtectionPreviewRequest
) -> tuple[LoraProtectionPreview, dict[str, Any]]:
    configuration = request.configuration
    context = _context(client, configuration)
    lora_enabled = configuration.enable_lns_watchdog or configuration.enable_lora_guard
    lora_scheduler = _find_row(context["schedulers"], "name", LORA_SCHEDULER)
    wan_scheduler = _find_row(context["schedulers"], "name", WAN_SCHEDULER)
    lora_script = _find_row(context["scripts"], "name", LORA_SCRIPT)
    lora_source = lora_script.get("source", "") if lora_script else ""

    candidates: list[ConfigurationChange | None] = []
    if lora_enabled or lora_scheduler:
        candidates.append(_change(
            "LoRa",
            "Proteção da interface",
            _state(lora_scheduler),
            _desired_state(lora_enabled),
        ))
    if configuration.enable_lns_watchdog or lora_script:
        candidates.append(_change(
            "LoRa",
            "Reagir à desconexão LNS",
            ("Ativo" if 'message~"LNS.*disconnected"' in lora_source else "Inativo")
            if lora_script
            else None,
            "Ativo" if configuration.enable_lns_watchdog else "Inativo",
        ))
    if configuration.enable_lora_guard or lora_script:
        candidates.append(_change(
            "LoRa",
            "Reativação automática",
            ("Ativo" if "get $loraId disabled" in lora_source else "Inativo")
            if lora_script
            else None,
            "Ativo" if configuration.enable_lora_guard else "Inativo",
        ))
    if lora_enabled:
        candidates.append(_change(
            "LoRa",
            "Intervalo de verificação",
            lora_scheduler.get("interval") if lora_scheduler else None,
            configuration.lora_interval,
        ))
    if configuration.enable_device_reboot or wan_scheduler:
        candidates.append(_change(
            "Dispositivo",
            "Reinício por falha de conectividade",
            _state(wan_scheduler),
            _desired_state(configuration.enable_device_reboot),
        ))
    if configuration.enable_device_reboot:
        candidates.extend(
            [
                _change(
                    "Dispositivo",
                    "Destino de teste",
                    None,
                    str(configuration.ping_target),
                ),
                _change(
                    "Dispositivo",
                    "Falhas antes do reinício",
                    None,
                    str(configuration.failure_threshold),
                ),
                _change(
                    "Dispositivo",
                    "Intervalo de verificação",
                    wan_scheduler.get("interval") if wan_scheduler else None,
                    configuration.connectivity_interval,
                ),
            ]
        )

    lora = context["lora"]
    existing = [
        ExistingConfiguration(
            area="LoRa",
            field="Interface",
            value=lora.get("name") or lora.get("default-name") or "LoRa",
        ),
        ExistingConfiguration(
            area="LoRa",
            field="Estado",
            value=lora.get("status")
            or ("Desativada" if _optional_bool(lora.get("disabled")) else "Ativa"),
        ),
    ]
    for key, label in (("servers", "Servidores"), ("network", "Rede"), ("antenna-gain", "Ganho da antena")):
        if lora.get(key):
            existing.append(ExistingConfiguration(area="LoRa", field=label, value=str(lora[key])))
    for script in context["scripts"]:
        name = script.get("name") or "Script sem nome"
        state = "Inativo" if _optional_bool(script.get("disabled")) else "Ativo"
        policy = script.get("policy")
        existing.append(ExistingConfiguration(
            area="Scripts",
            field=name,
            value=f"{state}{f' · política {policy}' if policy else ''}",
        ))
        source = str(script.get("source") or "")
        if name == WAN_SCRIPT:
            ping_match = re.search(r"/ping\s+([^\s\]]+)", source)
            failures_match = re.search(r"orionWanFailures\s*>=\s*(\d+)", source)
            if ping_match:
                existing.append(ExistingConfiguration(
                    area="Script de conectividade", field="Destino de teste", value=ping_match.group(1)
                ))
            if failures_match:
                existing.append(ExistingConfiguration(
                    area="Script de conectividade", field="Falhas antes do reinício", value=failures_match.group(1)
                ))
    for scheduler in context["schedulers"]:
        name = scheduler.get("name") or "Agendamento sem nome"
        state = "Inativo" if _optional_bool(scheduler.get("disabled")) else "Ativo"
        interval = scheduler.get("interval") or "sem intervalo"
        event = scheduler.get("on-event")
        existing.append(ExistingConfiguration(
            area="Agendamentos",
            field=name,
            value=f"{state} · {interval}{f' · executa {event}' if event else ''}",
        ))
    warnings = [
        "Um backup será criado antes da primeira alteração.",
        "Somente scripts e agendamentos identificados como ORION serão alterados.",
    ]
    if configuration.enable_device_reboot:
        warnings.append(
            f"Após {configuration.failure_threshold} verificações sem resposta, "
            "o MikroTik inteiro será reiniciado e todos os serviços ficarão "
            "temporariamente indisponíveis."
        )

    preview = LoraProtectionPreview(
        device_identity=context["identity"].get("name") or "MikroTik",
        lora_interface=lora.get("name") or lora.get("default-name") or "LoRa",
        lora_status=lora.get("status")
        or ("Desativada" if _optional_bool(lora.get("disabled")) else "Ativa"),
        existing=existing,
        changes=[change for change in candidates if change is not None],
        warnings=warnings,
    )
    return preview, context


def preview_lora_protection(
    request: LoraProtectionPreviewRequest,
) -> LoraProtectionPreview:
    return _with_connection(
        request.connection, lambda client: _build_preview(client, request)[0]
    )


def _wan_watchdog_source(configuration: LoraProtectionConfiguration) -> str:
    return (
        ":global orionWanFailures; "
        ':if ([:typeof $orionWanFailures] = "nothing") do={ :set orionWanFailures 0 }; '
        f":local replies [/ping {configuration.ping_target} count=5 interval=500ms]; "
        ":if ($replies = 0) do={ :set orionWanFailures ($orionWanFailures + 1) } "
        "else={ :set orionWanFailures 0 }; "
        f":if ($orionWanFailures >= {configuration.failure_threshold}) do={{ "
        ':set orionWanFailures 0; :log warning "ORION: reiniciando dispositivo por falha de conectividade"; '
        "/system reboot }"
    )


def _lora_watchdog_source(configuration: LoraProtectionConfiguration) -> str:
    source = (
        ":global orionLastLnsDisconnect; :global orionLoraWatchdogRunning; "
        ':if ($orionLoraWatchdogRunning = true) do={ :return }; '
        ":set orionLoraWatchdogRunning true; :do { "
        ":local loraIds [/iot lora find]; "
        ':if ([:len $loraIds] = 0) do={ :error "nenhuma interface LoRa encontrada" }; '
        ":local loraId [:pick $loraIds 0]; "
    )
    if configuration.enable_lora_guard:
        source += (
            ":if ([/iot lora get $loraId disabled] = true) do={ "
            "/iot lora enable $loraId; :delay 20s }; "
        )
    if configuration.enable_lns_watchdog:
        source += (
            ':local disconnectLogs [/log find where message~"LNS.*disconnected"]; '
            ":if ([:len $disconnectLogs] > 0) do={ "
            ":local newest [:pick $disconnectLogs ([:len $disconnectLogs] - 1)]; "
            ':if ([:typeof $orionLastLnsDisconnect] = "nothing") do={ :set orionLastLnsDisconnect $newest } '
            "else={ :if ($newest != $orionLastLnsDisconnect) do={ "
            ":set orionLastLnsDisconnect $newest; /iot lora disable $loraId; "
            ":delay 30s; /iot lora enable $loraId; :delay 20s } }; }; "
        )
    source += (
        '} on-error={ :log error ("ORION LORA: " . $message) }; '
        ":set orionLoraWatchdogRunning false"
    )
    return source


def _upsert_script(
    client: Any,
    rows: list[dict[str, str]],
    name: str,
    source: str,
    *,
    policy: str = SCRIPT_POLICY,
) -> None:
    row = _find_row(rows, "name", name)
    words = (f"=source={source}", f"=policy={policy}", "=disabled=no")
    if row:
        client.run("/system/script/set", f"=.id={_record_id(row, f'script {name}')}", *words)
    else:
        client.run("/system/script/add", f"=name={name}", *words)


def _set_scheduler(
    client: Any,
    rows: list[dict[str, str]],
    *,
    name: str,
    script: str,
    interval: str,
    enabled: bool,
    policy: str = SCRIPT_POLICY,
) -> None:
    row = _find_row(rows, "name", name)
    if not enabled and row is None:
        return
    words = (
        f"=on-event={script}",
        f"=interval={interval}",
        "=start-time=startup",
        f"=policy={policy}",
        f"=disabled={'no' if enabled else 'yes'}",
    )
    if row:
        client.run(
            "/system/scheduler/set",
            f"=.id={_record_id(row, f'agendamento {name}')}",
            *words,
        )
    else:
        client.run("/system/scheduler/add", f"=name={name}", *words)


def apply_lora_protection(
    request: LoraProtectionApplyRequest,
) -> LoraProtectionApplyResult:
    def apply(client: Any) -> LoraProtectionApplyResult:
        preview_request = LoraProtectionPreviewRequest(
            connection=request.connection, configuration=request.configuration
        )
        preview, context = _build_preview(client, preview_request)
        configuration = request.configuration
        backup = f"orion-before-lora-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}"
        client.run("/system/backup/save", f"=name={backup}")

        lora_enabled = (
            configuration.enable_lns_watchdog or configuration.enable_lora_guard
        )
        if lora_enabled:
            _upsert_script(
                client,
                context["scripts"],
                LORA_SCRIPT,
                _lora_watchdog_source(configuration),
            )
        _set_scheduler(
            client,
            context["schedulers"],
            name=LORA_SCHEDULER,
            script=LORA_SCRIPT,
            interval=configuration.lora_interval,
            enabled=lora_enabled,
        )

        if configuration.enable_device_reboot:
            _upsert_script(
                client,
                context["scripts"],
                WAN_SCRIPT,
                _wan_watchdog_source(configuration),
                policy=REBOOT_SCRIPT_POLICY,
            )
        _set_scheduler(
            client,
            context["schedulers"],
            name=WAN_SCHEDULER,
            script=WAN_SCRIPT,
            interval=configuration.connectivity_interval,
            enabled=configuration.enable_device_reboot,
            policy=REBOOT_SCRIPT_POLICY,
        )

        return LoraProtectionApplyResult(
            status="applied",
            backup_file=f"{backup}.backup",
            changes_applied=len(preview.changes),
            summary="As proteções LoRa foram configuradas.",
        )

    return _with_connection(request.connection, apply)
