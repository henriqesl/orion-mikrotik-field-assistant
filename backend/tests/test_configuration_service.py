from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.models.configuration import (
    ConfigurationApplyRequest,
    ConfigurationPreviewRequest,
    LinkConfiguration,
)
from app.models.mikrotik import MikroTikConnection
from app.services import configuration as service


def connection() -> MikroTikConnection:
    return MikroTikConnection(
        host="192.168.88.1",
        username="orion",
        password="field-secret",
    )


def settings(**updates) -> LinkConfiguration:
    values = {
        "role": "station",
        "identity": "ORION-Station",
        "wifi_interface": "wifi1",
        "ethernet_interface": "ether1",
        "bridge_name": "bridge1",
        "ssid": "ORION-New-Link",
        "passphrase": "safe-field-password",
        "frequency_mhz": 5805,
        "channel_width": "20mhz",
        "management_ip": "192.168.88.2/24",
        "gateway": "192.168.88.254",
    }
    values.update(updates)
    return LinkConfiguration(**values)


class ConfigurationClient:
    def __init__(self) -> None:
        self.commands: list[tuple[str, ...]] = []

    def __enter__(self):
        return self

    def __exit__(self, *_args) -> None:
        return None

    def run(self, *words):
        self.commands.append(words)
        rows = {
            "/system/identity/print": [{"name": "Old-Station"}],
            "/system/package/print": [
                {"name": "routeros"},
                {"name": "wifi-qcom"},
            ],
            "/interface/wifi/print": [
                {
                    ".id": "*1",
                    "name": "wifi1",
                    "default-name": "wifi1",
                    "disabled": "false",
                    "running": "true",
                    "configuration.mode": "ap",
                    "configuration.ssid": "Old-Link",
                    "channel.frequency": "5500",
                    "channel.width": "20mhz",
                }
            ],
            "/interface/ethernet/print": [
                {".id": "*2", "name": "ether1", "disabled": "false"}
            ],
            "/interface/bridge/print": [
                {".id": "*3", "name": "bridge1", "disabled": "false"}
            ],
            "/interface/bridge/port/print": [
                {".id": "*4", "interface": "wifi1", "bridge": "bridge1"},
                {".id": "*5", "interface": "ether1", "bridge": "bridge1"},
            ],
            "/ip/address/print": [
                {
                    ".id": "*6",
                    "address": "192.168.88.1/24",
                    "interface": "bridge1",
                }
            ],
            "/ip/route/print": [
                {
                    ".id": "*7",
                    "dst-address": "0.0.0.0/0",
                    "gateway": "192.168.88.254",
                }
            ],
        }.get(words[0], [])
        return SimpleNamespace(
            re=[SimpleNamespace(map=row) for row in rows]
        )


class LegacyConfigurationClient(ConfigurationClient):
    def run(self, *words):
        self.commands.append(words)
        legacy_rows = {
            "/system/package/print": [
                {"name": "routeros"},
                {"name": "wireless"},
            ],
            "/interface/wireless/print": [
                {
                    ".id": "*8",
                    "name": "wifi1",
                    "default-name": "wifi1",
                    "disabled": "false",
                    "running": "true",
                    "mode": "bridge",
                    "ssid": "Old-Link",
                    "frequency": "5500",
                    "channel-width": "20mhz",
                }
            ],
            "/interface/wireless/security-profiles/print": [],
        }
        if words[0] in legacy_rows:
            rows = legacy_rows[words[0]]
            return SimpleNamespace(re=[SimpleNamespace(map=row) for row in rows])

        # Reuse common Ethernet, bridge and IP fixtures without recording twice.
        self.commands.pop()
        return super().run(*words)


def test_preview_lists_changes_without_exposing_passphrase(monkeypatch) -> None:
    fake = ConfigurationClient()
    monkeypatch.setattr(service, "_with_connection", lambda _c, operation: operation(fake))
    request = ConfigurationPreviewRequest(
        connection=connection(), configuration=settings()
    )

    result = service.preview_link_configuration(request)

    assert result.wifi_stack == "wifi"
    assert str(result.reconnect_ip) == "192.168.88.2"
    assert any(change.field == "SSID" for change in result.changes)
    security = next(change for change in result.changes if change.sensitive)
    assert security.new_value == "Será atualizada"
    assert "safe-field-password" not in result.model_dump_json()


def test_apply_creates_backup_before_router_changes(monkeypatch) -> None:
    fake = ConfigurationClient()
    monkeypatch.setattr(service, "_with_connection", lambda _c, operation: operation(fake))
    request = ConfigurationApplyRequest(
        connection=connection(),
        configuration=settings(),
        confirmation="APLICAR",
    )

    result = service.apply_link_configuration(request)

    mutations = [command for command in fake.commands if command[0].endswith(("/set", "/add", "/save"))]
    assert mutations[0][0] == "/system/backup/save"
    assert any(command[0] == "/interface/wifi/set" for command in mutations)
    assert any(command[0] == "/ip/address/add" for command in mutations)
    assert not any(command[0] == "/ip/route/add" for command in mutations)
    assert not any(command[0] == "/ip/address/remove" for command in mutations)
    assert mutations[-1][0] == "/interface/bridge/port/set"
    assert result.status == "applied"
    assert result.backup_file.endswith(".backup")
    assert "safe-field-password" not in result.model_dump_json()


def test_configuration_rejects_gateway_outside_management_network() -> None:
    with pytest.raises(ValidationError):
        settings(gateway="10.0.0.1")


def test_existing_management_ip_is_moved_to_bridge_without_duplicate(monkeypatch) -> None:
    fake = ConfigurationClient()
    monkeypatch.setattr(service, "_with_connection", lambda _c, operation: operation(fake))
    request = ConfigurationApplyRequest(
        connection=connection(),
        configuration=settings(management_ip="192.168.88.1/24"),
        confirmation="APLICAR",
    )

    service.apply_link_configuration(request)

    assert not any(command[0] == "/ip/address/add" for command in fake.commands)
    address_set = next(
        command for command in fake.commands if command[0] == "/ip/address/set"
    )
    assert "=interface=bridge1" in address_set


def test_apply_supports_legacy_wireless_stack(monkeypatch) -> None:
    fake = LegacyConfigurationClient()
    monkeypatch.setattr(service, "_with_connection", lambda _c, operation: operation(fake))
    request = ConfigurationApplyRequest(
        connection=connection(),
        configuration=settings(channel_width="20/40mhz"),
        confirmation="APLICAR",
    )

    result = service.apply_link_configuration(request)

    assert result.status == "applied"
    assert any(
        command[0] == "/interface/wireless/security-profiles/add"
        for command in fake.commands
    )
    wireless_set = next(
        command for command in fake.commands if command[0] == "/interface/wireless/set"
    )
    assert "=mode=station-bridge" in wireless_set
    assert "=channel-width=20/40mhz-XX" in wireless_set
