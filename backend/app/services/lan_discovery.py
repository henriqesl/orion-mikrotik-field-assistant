import atexit
import os
import shutil
import socket
import struct
import subprocess
import threading
import time
from ipaddress import IPv4Address
from pathlib import Path

from app.models.discovery import LanDevice, LanDiscoveryResult


MNDP_PORT = 5678
MNDP_PROBE = b"\x00\x00\x00\x00"
DEVICE_MAX_AGE_SECONDS = 120
TLV_MAC = 1
TLV_IDENTITY = 5
TLV_VERSION = 7
TLV_PLATFORM = 8
TLV_BOARD = 12
TLV_INTERFACE = 15
TLV_IPV4 = 16


class WinBoxNotFoundError(RuntimeError):
    pass


def _text(value: bytes) -> str | None:
    decoded = value.decode("utf-8", errors="replace").strip("\x00 ")
    return decoded or None


def _mac(value: bytes) -> str | None:
    if len(value) != 6:
        return None
    return ":".join(f"{part:02X}" for part in value)


def parse_mndp_packet(data: bytes, source_ip: str) -> dict[str, str | None] | None:
    """Decode the public MNDP TLV payload used by RouterOS neighbor discovery."""
    if len(data) < 4:
        return None

    values: dict[int, bytes] = {}
    offset = 4
    while offset + 4 <= len(data):
        field_type, length = struct.unpack_from("!HH", data, offset)
        offset += 4
        if length < 0 or offset + length > len(data):
            return None
        values[field_type] = data[offset : offset + length]
        offset += length

    mac_address = _mac(values.get(TLV_MAC, b""))
    if not mac_address:
        return None

    advertised_ip = values.get(TLV_IPV4)
    ip_address = source_ip if source_ip != "0.0.0.0" else None
    if advertised_ip and len(advertised_ip) == 4:
        ip_address = str(IPv4Address(advertised_ip))

    return {
        "mac_address": mac_address,
        "identity": _text(values.get(TLV_IDENTITY, b"")),
        "ip_address": ip_address,
        "platform": _text(values.get(TLV_PLATFORM, b"")),
        "version": _text(values.get(TLV_VERSION, b"")),
        "board": _text(values.get(TLV_BOARD, b"")),
        "interface": _text(values.get(TLV_INTERFACE, b"")),
    }


class MndpCollector:
    def __init__(self) -> None:
        self._devices: dict[str, tuple[float, dict[str, str | None]]] = {}
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._error: str | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._listen,
            name="orion-mndp-listener",
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _listen(self) -> None:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as listener:
                listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                listener.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
                listener.bind(("", MNDP_PORT))
                listener.settimeout(1)
                self._error = None
                next_probe_at = 0.0

                while not self._stop.is_set():
                    now = time.monotonic()
                    if now >= next_probe_at:
                        try:
                            listener.sendto(
                                MNDP_PROBE,
                                ("255.255.255.255", MNDP_PORT),
                            )
                        except OSError:
                            pass
                        next_probe_at = now + 5

                    try:
                        data, source = listener.recvfrom(65535)
                    except TimeoutError:
                        continue
                    except OSError as error:
                        if not self._stop.is_set():
                            self._error = str(error)
                        return

                    parsed = parse_mndp_packet(data, source[0])
                    if parsed:
                        with self._lock:
                            self._devices[parsed["mac_address"]] = (
                                time.monotonic(),
                                parsed,
                            )
        except OSError:
            self._error = (
                "A escuta MNDP não pôde iniciar. Confira o firewall do Windows "
                "e se a porta UDP 5678 está disponível."
            )

    def snapshot(self) -> LanDiscoveryResult:
        self.start()
        now = time.monotonic()
        with self._lock:
            expired = [
                mac_address
                for mac_address, (seen_at, _) in self._devices.items()
                if now - seen_at > DEVICE_MAX_AGE_SECONDS
            ]
            for mac_address in expired:
                del self._devices[mac_address]

            devices = [
                LanDevice(
                    **values,
                    last_seen_seconds=round(now - seen_at, 1),
                )
                for seen_at, values in self._devices.values()
            ]

        devices.sort(key=lambda device: (device.identity or "", device.mac_address))
        return LanDiscoveryResult(
            status="unavailable" if self._error else "listening",
            devices=devices,
            message=self._error,
        )


def _winbox_candidates() -> list[Path]:
    project_root = Path(__file__).resolve().parents[3]
    candidates = [
        project_root / "winbox.exe",
        project_root / "tools" / "winbox.exe",
    ]
    for environment_name in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
        directory = os.environ.get(environment_name)
        if directory:
            candidates.extend(
                [
                    Path(directory) / "MikroTik" / "WinBox" / "winbox.exe",
                    Path(directory) / "Programs" / "WinBox" / "winbox.exe",
                ]
            )
    path_candidate = shutil.which("winbox.exe") or shutil.which("winbox")
    if path_candidate:
        candidates.append(Path(path_candidate))
    return candidates


def find_winbox() -> Path | None:
    return next((path for path in _winbox_candidates() if path.is_file()), None)


def open_winbox(mac_address: str, username: str) -> None:
    executable = find_winbox()
    if executable is None:
        raise WinBoxNotFoundError(
            "WinBox não encontrado. Coloque winbox.exe na pasta principal do ORION."
        )
    subprocess.Popen(
        [str(executable), mac_address, username],
        cwd=executable.parent,
    )


mndp_collector = MndpCollector()
atexit.register(mndp_collector.stop)
