from unittest.mock import Mock

import pytest

from app.models.discovery import MacBootstrapApplyRequest, MacBootstrapRequest
from app.services import mac_bootstrap
from app.services.mac_telnet import _Packet, ACK


def request_model(model=MacBootstrapRequest):
    values = dict(
        mac_address="AA:BB:CC:DD:EE:FF",
        username="admin",
        password="secret",
        adapter_index=7,
        router_interface="ether1",
        management_address="192.168.70.2/24",
    )
    if model is MacBootstrapApplyRequest:
        values["confirmation"] = "APLICAR"
    return model(**values)


def adapter():
    return mac_bootstrap.LocalNetworkAdapter(
        interface_index=7,
        name="Ethernet",
        description="Adapter",
        mac_address="11:22:33:44:55:66",
        ipv4_address="192.168.70.10",
    )


def test_packet_round_trip():
    packet = _Packet(
        ACK,
        bytes.fromhex("112233445566"),
        bytes.fromhex("AABBCCDDEEFF"),
        123,
        counter=42,
    )
    decoded = _Packet.decode(packet.encode())
    assert decoded.session_id == 123
    assert decoded.counter == 42
    assert decoded.src == packet.src


def test_adapter_discovery_parses_single_adapter(monkeypatch):
    raw = [{
        "interface_index": 7,
        "name": "Ethernet",
        "description": "Adapter",
        "mac_address": "11:22:33:44:55:66",
        "ipv4_address": "192.168.70.10",
    }]
    monkeypatch.setattr(mac_bootstrap, "_windows_adapters", lambda: raw)
    adapters = mac_bootstrap.list_network_adapters()
    assert adapters[0].interface_index == 7


def test_preview_reads_existing_state(monkeypatch):
    monkeypatch.setattr(mac_bootstrap, "list_network_adapters", lambda: [adapter()])
    execute = Mock(return_value=(
        "ORION_IDENTITY=radio-a\r\n"
        "ORION_IP=10.0.0.1/24|bridge\r\n"
        "ORION_API=true|8728|10.0.0.0/24\r\n"
        "ORION_MAC_READ_OK\r\n"
    ))
    monkeypatch.setattr(mac_bootstrap.MacTelnetClient, "execute", execute)
    preview = mac_bootstrap.preview_mac_bootstrap(request_model())
    assert preview.current.identity == "radio-a"
    assert preview.current.api_enabled is False
    assert preview.reconnect_ip.exploded == "192.168.70.2"
    assert any("Adicionar" in item for item in preview.commands)


def test_apply_is_idempotent_and_never_embeds_password(monkeypatch):
    monkeypatch.setattr(mac_bootstrap, "list_network_adapters", lambda: [adapter()])
    execute = Mock(return_value="ORION_MAC_BOOTSTRAP_OK")
    monkeypatch.setattr(mac_bootstrap.MacTelnetClient, "execute", execute)
    result = mac_bootstrap.apply_mac_bootstrap(request_model(MacBootstrapApplyRequest))
    command = execute.call_args.args[0]
    assert 'find where address="192.168.70.2/24"' in command
    assert "secret" not in command
    assert result.host.exploded == "192.168.70.2"


def test_router_interface_rejects_script_injection():
    with pytest.raises(ValueError):
        MacBootstrapRequest(
            mac_address="AA:BB:CC:DD:EE:FF",
            username="admin",
            password="secret",
            adapter_index=7,
            router_interface='ether1"; /system reset-configuration',
            management_address="192.168.70.2/24",
        )
