from types import SimpleNamespace

import pytest

from app.models.configuration import (
    LoraProtectionApplyRequest,
    LoraProtectionConfiguration,
    LoraProtectionPreviewRequest,
)
from app.models.mikrotik import MikroTikConnection
from app.services import lora_configuration as service
from tests.support.stateful_router import StatefulRouter, lora_router
from app.services.mutations import ConfigurationApplyError


class Client:
    def __init__(self, *, lora=True, managed=False):
        self.commands = []
        self.lora = lora
        self.managed = managed
        self.router = None

    def run(self, *words):
        self.commands.append(words)
        if self.router is not None:
            return self.router.run(*words)
        schedulers = []
        scripts = []
        if self.managed:
            schedulers = [
                {
                    ".id": "*ls",
                    "name": service.LORA_SCHEDULER,
                    "interval": "10m",
                    "disabled": "no",
                },
                {
                    ".id": "*ws",
                    "name": service.WAN_SCHEDULER,
                    "interval": "5m",
                    "disabled": "no",
                },
            ]
            scripts = [
                {".id": "*l", "name": service.LORA_SCRIPT, "disabled": "no"},
                {".id": "*w", "name": service.WAN_SCRIPT, "disabled": "no"},
            ]
        tables = {
            "/iot/lora/print": (
                [{".id": "*1", "name": "lora1", "status": "connected", "disabled": "no"}]
                if self.lora
                else []
            ),
            "/interface/ethernet/print": [
                {".id": "*2", "name": "ether1", "default-name": "ether1"}
            ],
            "/system/identity/print": [{"name": "ORION-LORA"}],
            "/system/script/print": scripts,
            "/system/scheduler/print": schedulers,
        }
        self.router = StatefulRouter(tables)
        return self.router.run(*words)


def connection():
    return MikroTikConnection(
        host="192.168.88.1", username="orion", password="secret"
    )


def settings(**updates):
    values = {"enable_device_reboot": True}
    values.update(updates)
    return LoraProtectionConfiguration(**values)


def test_preview_detects_lora_and_is_read_only(monkeypatch):
    client = Client()
    monkeypatch.setattr(
        service, "_with_connection", lambda _connection, callback: callback(client)
    )

    result = service.preview_lora_protection(
        LoraProtectionPreviewRequest(
            connection=connection(), configuration=settings()
        )
    )

    assert result.lora_interface == "lora1"
    assert result.lora_status == "connected"
    assert all(command[0].endswith("/print") for command in client.commands)


def test_preview_rejects_device_without_lora(monkeypatch):
    client = Client(lora=False)
    monkeypatch.setattr(
        service, "_with_connection", lambda _connection, callback: callback(client)
    )

    with pytest.raises(service.ConfigurationConflictError, match="Nenhuma interface LoRa"):
        service.preview_lora_protection(
            LoraProtectionPreviewRequest(
                connection=connection(), configuration=settings()
            )
        )


def test_apply_backs_up_first_and_never_removes(monkeypatch):
    client = Client()
    monkeypatch.setattr(
        service, "_with_connection", lambda _connection, callback: callback(client)
    )

    result = service.apply_lora_protection(
        LoraProtectionApplyRequest(
            connection=connection(), configuration=settings(), confirmation="APLICAR"
        )
    )

    mutations = [
        command
        for command in client.commands
        if command[0].endswith(("/set", "/add", "/save", "/remove"))
    ]
    assert mutations[0][0] == "/system/backup/save"
    assert any(command[0] == "/system/script/add" for command in mutations)
    assert any(command[0] == "/system/scheduler/add" for command in mutations)
    assert not any(command[0].endswith("/remove") for command in mutations)
    watchdog = next(
        command
        for command in mutations
        if command[0] == "/system/script/add"
        and f"=name={service.WAN_SCRIPT}" in command
    )
    source = next(word for word in watchdog if word.startswith("=source="))
    assert "/system reboot" in source
    assert "/interface ethernet disable" not in source
    assert "=policy=reboot,read,write,test" in watchdog
    lora_script = next(
        command
        for command in mutations
        if command[0] == "/system/script/add"
        and f"=name={service.LORA_SCRIPT}" in command
    )
    assert "=policy=read,write,test" in lora_script
    assert "=policy=reboot,read,write,test" not in lora_script
    scheduler = next(
        command
        for command in mutations
        if command[0] == "/system/scheduler/add"
        and f"=name={service.WAN_SCHEDULER}" in command
    )
    assert "=policy=reboot,read,write,test" in scheduler
    assert result.backup_file.endswith(".backup")
    assert all("=disabled=no" not in command for command in mutations if command[0].startswith("/system/script/"))


def test_disabling_protections_disables_managed_schedulers(monkeypatch):
    client = Client(managed=True)
    monkeypatch.setattr(
        service, "_with_connection", lambda _connection, callback: callback(client)
    )

    service.apply_lora_protection(
        LoraProtectionApplyRequest(
            connection=connection(),
            configuration=settings(
                enable_lns_watchdog=False,
                enable_lora_guard=False,
                enable_device_reboot=False,
            ),
            confirmation="APLICAR",
        )
    )

    scheduler_sets = [
        command for command in client.commands if command[0] == "/system/scheduler/set"
    ]
    assert len(scheduler_sets) == 2
    assert all("=disabled=yes" in command for command in scheduler_sets)
    assert not any(command[0].endswith("/remove") for command in client.commands)


@pytest.mark.parametrize("failure", ["backup", "script", "verification"])
def test_apply_failure_reports_recovery_without_leaking_routeros_error(monkeypatch, failure):
    from routeros.errors import DeviceError

    client = lora_router()
    original_run = client.run
    def run(*words):
        if (failure == "backup" and words[0] == "/system/backup/save") or (failure == "script" and words[0] == "/system/script/add"):
                raise DeviceError(SimpleNamespace(map={"message": "private-command-with-secret"}))
        if failure == "verification" and words[0] == "/system/script/print" and client.backups:
            return SimpleNamespace(re=[])
        return original_run(*words)
    client.run = run
    monkeypatch.setattr(service, "_with_connection", lambda _connection, operation: operation(client))
    with pytest.raises(ConfigurationApplyError) as caught:
        service.apply_lora_protection(LoraProtectionApplyRequest(connection=connection(), configuration=settings(), confirmation="APLICAR"))
    assert "private-command-with-secret" not in str(caught.value)
    assert ("Nenhuma configuração" if failure == "backup" else "alterações parciais") in str(caught.value)


def test_repeated_lora_preview_matches_saved_values_and_routeros_intervals(monkeypatch):
    client = lora_router()
    monkeypatch.setattr(service, "_with_connection", lambda _connection, operation: operation(client))
    config = settings()
    service.apply_lora_protection(LoraProtectionApplyRequest(connection=connection(), configuration=config, confirmation="APLICAR"))
    for scheduler in client.rows("/system/scheduler/print"):
        scheduler["interval"] = "00:30:00" if scheduler["name"] == service.LORA_SCHEDULER else "00:10:00"
    preview = service.preview_lora_protection(LoraProtectionPreviewRequest(connection=connection(), configuration=config))
    assert preview.changes == []
    assert service.read_lora_protection(connection()).configuration == config


def test_new_gateway_loads_without_enabling_reboot_or_other_schedules(monkeypatch):
    client = lora_router()
    monkeypatch.setattr(service, "_with_connection", lambda _connection, operation: operation(client))
    current = service.read_lora_protection(connection())
    assert current.configuration.enable_device_reboot is False
    assert current.configuration.enable_lns_watchdog is False
    assert current.configuration.enable_lora_guard is False
    assert all(command[0].endswith("/print") for command in client.commands)
