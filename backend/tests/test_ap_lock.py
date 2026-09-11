from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.models.configuration import ConfigurationApplyRequest, ConfigurationPreviewRequest
from app.models.radio import RadioInterfaceRequest, RadioScanRequest, normalize_bssid
from app.services import ap_lock, configuration
from app.services.configuration import ConfigurationConflictError
from tests.test_configuration_service import connection, settings
from tests.support.stateful_router import radio_router


def legacy_radio():
    router = radio_router()
    router.tables["/system/package/print"] = [{"name": "wireless"}]
    row = router.rows("/interface/wifi/print")[0]
    row.update({"mode": "station-bridge", "ssid": "ENLACE", "frequency": "5500", "default-authentication": "yes"})
    router.tables["/interface/wireless/print"] = [row]
    router.tables["/interface/wifi/print"] = []
    return router


def wire(monkeypatch, router):
    for service in (configuration, ap_lock):
        monkeypatch.setattr(service, "_with_connection", lambda _connection, operation, **_kwargs: operation(router))


def test_lock_change_and_unlock_preserve_other_interfaces(monkeypatch):
    router = legacy_radio()
    unrelated = {".id": "*OTHER", "interface": "wlan-other", "mac-address": "02:44:55:66:77:88", "connect": "yes"}
    router.rows(f"{ap_lock.MENU}/print").append(unrelated.copy())
    wire(monkeypatch, router)
    for mac in ("02:11:22:33:44:55", "02:11:22:33:44:66"):
        config = settings(ap_lock_action="lock", ap_bssid=mac)
        preview = configuration.preview_link_configuration(ConfigurationPreviewRequest(connection=connection(), configuration=config))
        assert any(change.new_value == mac for change in preview.changes)
        configuration.apply_link_configuration(ConfigurationApplyRequest(connection=connection(), configuration=config, confirmation="APLICAR"))
        state = ap_lock.read_ap_lock(RadioInterfaceRequest(connection=connection(), wifi_interface="wifi1"))
        assert state.locked_bssid == mac
        assert len(router.rows(f"{ap_lock.MENU}/print")) == 2
    configuration.apply_link_configuration(ConfigurationApplyRequest(connection=connection(), configuration=settings(ap_lock_action="unlock"), confirmation="APLICAR"))
    assert router.rows("/interface/wireless/print")[0]["default-authentication"] == "yes"
    assert router.rows(f"{ap_lock.MENU}/print")[0] == unrelated
    assert not any(command[0].endswith("/remove") for command in router.commands)


def test_empty_modern_menu_does_not_hide_legacy_interfaces():
    from app.services.routeros import _read_wifi
    router = legacy_radio()
    router.tables["/system/package/print"] = [{"name": "wifi-qcom"}]
    _package, stack, interfaces = _read_wifi(router)
    assert stack == "wireless"
    assert interfaces[0].name == "wifi1"


@pytest.mark.parametrize("factory", [legacy_radio, radio_router])
def test_custom_rules_or_unsupported_stack_block_before_backup(monkeypatch, factory):
    router = factory()
    router.rows(f"{ap_lock.MENU}/print").append({".id": "*CUSTOM", "interface": "wifi1", "connect": "yes"})
    wire(monkeypatch, router)
    with pytest.raises(ConfigurationConflictError):
        configuration.apply_link_configuration(ConfigurationApplyRequest(connection=connection(), configuration=settings(ap_lock_action="lock", ap_bssid="02:11:22:33:44:55"), confirmation="APLICAR"))
    assert router.backups == []


@pytest.mark.parametrize("value", ["00:00:00:00:00:00", "FF:FF:FF:FF:FF:FF", "01:12:34:56:78:90", "1; /system reboot", "192.168.88.1"])
def test_invalid_ap_mac_rejected(value):
    with pytest.raises(ValueError):
        normalize_bssid(value)


def test_mac_normalization_and_ap_role_validation():
    assert normalize_bssid("02-aa-bb-cc-dd-ee") == "02:AA:BB:CC:DD:EE"
    with pytest.raises(ValidationError):
        settings(role="ap", ap_lock_action="lock", ap_bssid="02:11:22:33:44:55")


def test_password_change_cannot_mutate_another_interface_security(monkeypatch):
    router = legacy_radio()
    router.rows("/interface/wireless/print").append({".id": "*W2", "name": "wlan2", "security-profile": "orion-field-security"})
    router.rows("/interface/wireless/security-profiles/print").append({".id": "*SEC", "name": "orion-field-security", "wpa2-pre-shared-key": "untouched-password"})
    wire(monkeypatch, router)
    configuration.apply_link_configuration(ConfigurationApplyRequest(connection=connection(), configuration=settings(), confirmation="APLICAR"))
    assert router.rows("/interface/wireless/security-profiles/print")[0]["wpa2-pre-shared-key"] == "untouched-password"
    assert router.rows("/interface/wireless/print")[1]["security-profile"] == "orion-field-security"


@pytest.mark.parametrize("factory", [legacy_radio, radio_router])
def test_preserve_security_frequency_and_country_omits_writes(monkeypatch, factory):
    router = factory()
    wire(monkeypatch, router)
    config = settings(passphrase=None, frequency_mhz=None, channel_width=None, country=None)
    configuration.apply_link_configuration(ConfigurationApplyRequest(connection=connection(), configuration=config, confirmation="APLICAR"))
    writes = [word for command in router.commands if command[0].endswith(("/set", "/add")) for word in command[1:]]
    assert not any(any(term in word for term in ("passphrase=", "pre-shared-key=", "security-profile=", "authentication-types=", "country=", "frequency=", "channel-width=", "channel.width=")) for word in writes)


def test_generic_legacy_ap_supports_multiple_clients(monkeypatch):
    router = legacy_radio()
    wire(monkeypatch, router)
    configuration.apply_link_configuration(ConfigurationApplyRequest(connection=connection(), configuration=settings(role="ap", device_kind="generic", manage_topology=False), confirmation="APLICAR"))
    assert router.rows("/interface/wireless/print")[0]["mode"] == "ap-bridge"


@pytest.mark.parametrize("factory,argument", [(legacy_radio, "interface"), (radio_router, "number")])
def test_scan_is_bounded_deduplicates_and_never_writes(monkeypatch, factory, argument):
    router = factory()
    original = router.run
    def run(*words):
        if words[0].endswith("/scan"):
            router.commands.append(words)
            assert f"={argument}=wifi1" in words
            assert ("=rounds=1" if argument == "interface" else "=duration=5s") in words
            return SimpleNamespace(re=[SimpleNamespace(map=row) for row in [
                {"address": "02:AA:BB:CC:DD:EE", "ssid": "ENLACE", "signal": "-70", "channel": "5500/ax/Ce"},
                {"mac-address": "02:AA:BB:CC:DD:EE", "ssid": "ENLACE", "signal-strength": "-51@6Mbps", "channel": "5500/20"},
                {"address": "02:AA:BB:CC:DD:EF", "ssid": "", "signal": "-80"},
                {"address": "not-a-mac"},
            ]])
        return original(*words)
    router.run = run
    wire(monkeypatch, router)
    result = ap_lock.scan_access_points(RadioScanRequest(connection=connection(), wifi_interface="wifi1", confirmation="BUSCAR"))
    assert len(result.access_points) == 2
    assert result.access_points[0].signal_dbm == -51
    assert result.access_points[0].frequency_mhz == 5500
    assert all(command[0].endswith(("/scan", "/print")) for command in router.commands)
