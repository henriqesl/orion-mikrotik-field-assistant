import struct
from pathlib import Path

from app.services import lan_discovery as service


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
    monkeypatch.setattr(service, "find_winbox", lambda _path=None: executable)
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
    monkeypatch.setattr(service, "find_winbox", lambda _path=None: None)

    try:
        service.open_winbox("AA:BB:CC:DD:EE:FF", "admin")
    except service.WinBoxNotFoundError as error:
        assert "própria tela" in str(error)
    else:
        raise AssertionError("WinBoxNotFoundError was not raised")


def test_open_winbox_can_try_factory_blank_password(monkeypatch, tmp_path: Path) -> None:
    executable = tmp_path / "winbox.exe"
    executable.touch()
    calls = []
    monkeypatch.setattr(service, "find_winbox", lambda _path=None: executable)
    monkeypatch.setattr(
        service.subprocess,
        "Popen",
        lambda arguments, **options: calls.append((arguments, options)),
    )

    service.open_winbox(
        "AA:BB:CC:DD:EE:FF",
        "admin",
        try_blank_password=True,
    )

    assert calls[0][0] == [
        str(executable),
        "AA:BB:CC:DD:EE:FF",
        "admin",
        "",
    ]


def test_selected_winbox_path_is_saved(monkeypatch, tmp_path: Path) -> None:
    executable = tmp_path / "winbox64.exe"
    executable.touch()
    settings_file = tmp_path / "settings" / "winbox-path.txt"
    monkeypatch.setattr(service, "_winbox_settings_file", lambda: settings_file)

    result = service.find_winbox(str(executable))

    assert result == executable.resolve()
    assert settings_file.read_text(encoding="utf-8") == str(executable.resolve())


def test_selected_non_winbox_executable_is_rejected(tmp_path: Path) -> None:
    executable = tmp_path / "other.exe"
    executable.touch()

    try:
        service.find_winbox(str(executable))
    except service.InvalidWinBoxPathError as error:
        assert "winbox.exe" in str(error)
    else:
        raise AssertionError("InvalidWinBoxPathError was not raised")
