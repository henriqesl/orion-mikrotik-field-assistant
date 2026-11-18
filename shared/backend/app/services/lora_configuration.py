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
    LoraProtectionCurrentState,
    LoraProtectionPreview,
    LoraProtectionPreviewRequest,
)
from app.services.configuration import ConfigurationConflictError, _find_row, _record_id
from app.services.routeros import _first_row, _optional_bool, _rows, _with_connection
from app.services.mutations import ConfigurationWriter
from pydantic import ValidationError


LORA_SCRIPT = "orion-lora-watchdog"
LORA_SCHEDULER = "orion-lora-watchdog-schedule"
WAN_SCRIPT = "orion-wan-watchdog"
WAN_SCHEDULER = "orion-wan-watchdog-schedule"
SCRIPT_POLICY = "read,write,test"
REBOOT_SCRIPT_POLICY = "reboot,read,write,test"


def _interval(value: str | None) -> str | None:
    """RouterOS may print 30m as 00:30:00."""
    aliases = {"00:01:00": "1m", "00:05:00": "5m", "00:10:00": "10m", "00:30:00": "30m", "01:00:00": "1h"}
    return aliases.get(value, value)


def _wan_parameters(script: dict[str, str] | None) -> tuple[str | None, str | None]:
    source = (script or {}).get("source", "")
    target = re.search(r"/ping\s+([^\s\]]+)", source)
    failures = re.search(r"orionWanFailures\s*>=\s*(\d+)", source)
    return target.group(1) if target else None, failures.group(1) if failures else None


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
    lora_active = bool(lora_scheduler and not _optional_bool(lora_scheduler.get("disabled")))
    ping_target, failure_threshold = _wan_parameters(_find_row(context["scripts"], "name", WAN_SCRIPT))

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
            ("Ativo" if lora_active and 'message~"LNS.*disconnected"' in lora_source else "Inativo")
            if lora_script
            else None,
            "Ativo" if configuration.enable_lns_watchdog else "Inativo",
        ))
    if configuration.enable_lora_guard or lora_script:
        candidates.append(_change(
            "LoRa",
            "Reativação automática",
            ("Ativo" if lora_active and "get $loraId disabled" in lora_source else "Inativo")
            if lora_script
            else None,
            "Ativo" if configuration.enable_lora_guard else "Inativo",
        ))
    if lora_enabled:
        candidates.append(_change(
            "LoRa",
            "Intervalo de verificação",
            _interval(lora_scheduler.get("interval")) if lora_scheduler else None,
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
                    ping_target,
                    str(configuration.ping_target),
                ),
                _change(
                    "Dispositivo",
                    "Falhas antes do reinício",
                    failure_threshold,
                    str(configuration.failure_threshold),
                ),
                _change(
                    "Dispositivo",
                    "Intervalo de verificação",
                    _interval(wan_scheduler.get("interval")) if wan_scheduler else None,
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
        state = "Salvo"
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


def read_lora_protection(connection) -> LoraProtectionCurrentState:
    def operation(client):
        context = _context(client, LoraProtectionConfiguration())
        script = _find_row(context["scripts"], "name", LORA_SCRIPT)
        source = (script or {}).get("source", "")
        lora_schedule = _find_row(context["schedulers"], "name", LORA_SCHEDULER)
        wan_schedule = _find_row(context["schedulers"], "name", WAN_SCHEDULER)
        enabled = bool(lora_schedule and not _optional_bool(lora_schedule.get("disabled")))
        target, failures = _wan_parameters(_find_row(context["scripts"], "name", WAN_SCRIPT))
        try:
            config = LoraProtectionConfiguration(
                enable_lns_watchdog=enabled and 'message~"LNS.*disconnected"' in source,
                enable_lora_guard=enabled and "get $loraId disabled" in source,
                enable_device_reboot=bool(wan_schedule and not _optional_bool(wan_schedule.get("disabled"))),
                ping_target=target or "1.1.1.1",
                failure_threshold=int(failures or 3),
                lora_interval=_interval((lora_schedule or {}).get("interval")) or "30m",
                connectivity_interval=_interval((wan_schedule or {}).get("interval")) or "10m",
            )
        except (ValidationError, ValueError) as error:
            raise ConfigurationConflictError("As proteções ORION foram personalizadas fora do aplicativo. Confira os scripts e intervalos no WinBox antes de alterá-los aqui.") from error
        preview, _ = _build_preview(client, LoraProtectionPreviewRequest(connection=connection, configuration=config))
        return LoraProtectionCurrentState(configuration=config, existing=preview.existing)
    return _with_connection(connection, operation)


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
        '} on-error={ :log error "ORION LORA: falha ao verificar a interface; confira o pacote IoT e as permissoes" }; '
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
    words = (f"=source={source}", f"=policy={policy}")
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
        backup = f"orion-before-lora-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S-%f')}"
        writer = ConfigurationWriter(client, backup)
        writer.create_backup()

        write_client = writer.tracked_client("o salvamento das proteções LoRa")

        lora_enabled = (
            configuration.enable_lns_watchdog or configuration.enable_lora_guard
        )
        if lora_enabled:
            _upsert_script(
                write_client,
                context["scripts"],
                LORA_SCRIPT,
                _lora_watchdog_source(configuration),
            )
        _set_scheduler(
            write_client,
            context["schedulers"],
            name=LORA_SCHEDULER,
            script=LORA_SCRIPT,
            interval=configuration.lora_interval,
            enabled=lora_enabled,
        )

        if configuration.enable_device_reboot:
            _upsert_script(
                write_client,
                context["scripts"],
                WAN_SCRIPT,
                _wan_watchdog_source(configuration),
                policy=REBOOT_SCRIPT_POLICY,
            )
        _set_scheduler(
            write_client,
            context["schedulers"],
            name=WAN_SCHEDULER,
            script=WAN_SCRIPT,
            interval=configuration.connectivity_interval,
            enabled=configuration.enable_device_reboot,
            policy=REBOOT_SCRIPT_POLICY,
        )

        scripts = _rows(writer.run("a leitura dos scripts salvos", "/system/script/print"))
        schedulers = _rows(writer.run("a leitura dos agendamentos salvos", "/system/scheduler/print"))
        for name, source, enabled, scheduler_name, interval, policy in (
            (LORA_SCRIPT, _lora_watchdog_source(configuration), lora_enabled, LORA_SCHEDULER, configuration.lora_interval, SCRIPT_POLICY),
            (WAN_SCRIPT, _wan_watchdog_source(configuration), configuration.enable_device_reboot, WAN_SCHEDULER, configuration.connectivity_interval, REBOOT_SCRIPT_POLICY),
        ):
            script = _find_row(scripts, "name", name)
            scheduler = _find_row(schedulers, "name", scheduler_name)
            if enabled and (not script or script.get("source") != source or set(script.get("policy", "").split(",")) != set(policy.split(","))):
                writer.fail("o conteúdo do script salvo")
            if enabled and (not scheduler or _optional_bool(scheduler.get("disabled")) or scheduler.get("on-event") != name or _interval(scheduler.get("interval")) != interval or set(scheduler.get("policy", "").split(",")) != set(policy.split(","))):
                writer.fail("o agendamento das proteções")
            if not enabled and scheduler and not _optional_bool(scheduler.get("disabled")):
                writer.fail("a desativação do agendamento")

        return LoraProtectionApplyResult(
            status="applied",
            backup_file=f"{backup}.backup",
            changes_applied=len(preview.changes),
            summary="Scripts e agendamentos salvos e conferidos. A execução será feita nos intervalos configurados.",
        )

    return _with_connection(request.connection, apply)
