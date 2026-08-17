import struct
from ipaddress import IPv4Address
from pathlib import Path

from app.services import lan_discovery as service
from app.models.discovery import BootstrapRequest


def tlv(field_type: int, value: bytes) -> bytes:
    return struct.pack("!HH", field_type, len(value)) + value


def test_parse_mndp_packet_returns_normalized_device() -> None:
    packet = b"\x00\x00\x00\x01" + b"".join(
        [
            tlv(1, bytes.fromhex("AABBCCDDEEFF")),
            tlv(5, b"ORION-Radio"),
            tlv(7, b"7.20.8"),
            tlv(8, b"MikroTik"),
            tlv(12, b"LHG 5 ax"),
            tlv(16, bytes([0, 0, 0, 0])),
        ]
    )

    result = service.parse_mndp_packet(packet, "0.0.0.0")

    assert result == {
        "mac_address": "AA:BB:CC:DD:EE:FF",
        "identity": "ORION-Radio",
        "ip_address": "0.0.0.0",
        "platform": "MikroTik",
        "version": "7.20.8",
        "board": "LHG 5 ax",
        "interface": None,
    }


def test_parse_mndp_packet_rejects_truncated_tlv() -> None:
    packet = b"\x00\x00\x00\x01" + struct.pack("!HH", 5, 20) + b"short"

    assert service.parse_mndp_packet(packet, "192.168.88.1") is None


def test_open_winbox_uses_argument_list_without_password(monkeypatch, tmp_path: Path) -> None:
    executable = tmp_path / "winbox.exe"
    executable.touch()
    calls = []
    monkeypatch.setattr(service, "find_winbox", lambda: executable)
    monkeypatch.setattr(
        service.subprocess,
        "Popen",
        lambda arguments, **options: calls.append((arguments, options)),
    )

    service.open_winbox("AA:BB:CC:DD:EE:FF", "orion")

    assert calls[0][0] == [
        str(executable),
        "AA:BB:CC:DD:EE:FF",
        "orion",
    ]
    assert "password" not in " ".join(calls[0][0]).lower()


def test_open_winbox_explains_where_to_place_executable(monkeypatch) -> None:
    monkeypatch.setattr(service, "find_winbox", lambda: None)

    try:
        service.open_winbox("AA:BB:CC:DD:EE:FF", "admin")
    except service.WinBoxNotFoundError as error:
        assert "pasta principal" in str(error)
    else:
        raise AssertionError("WinBoxNotFoundError was not raised")


def test_bootstrap_restricts_api_and_does_not_reset_device() -> None:
    result = service.build_bootstrap(
        BootstrapRequest(
            interface_name="ether1",
            address="192.168.88.1/24",
        )
    )

    assert result.filename == "orion-bootstrap.rsc"
    assert result.reconnect_ip == IPv4Address("192.168.88.1")
    assert result.computer_ip_suggestion == IPv4Address("192.168.88.2")
    assert 'address="192.168.88.0/24"' in result.script
    assert 'name="api"' in result.script
    assert "reset-configuration" not in result.script
    assert "/user" not in result.script
    assert "password" not in result.script.lower()
