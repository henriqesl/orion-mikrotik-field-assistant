import os

import pytest

from app.desktop import (
    DEFAULT_DESKTOP_PORT,
    _configure_file_logging,
    _is_process_running,
    _start_parent_watchdog,
    create_parser,
)


def test_desktop_backend_uses_fixed_loopback_port():
    options = create_parser().parse_args([])

    assert options.port == DEFAULT_DESKTOP_PORT
    assert options.log_level == "warning"


def test_desktop_backend_accepts_installer_port_override():
    options = create_parser().parse_args(
        ["--port", "8877", "--log-level", "info", "--parent-pid", "1234"]
    )

    assert options.port == 8877
    assert options.log_level == "info"
    assert options.parent_pid == 1234


def test_desktop_backend_skips_parent_watchdog_without_pid(monkeypatch):
    started = False

    def fail_if_started(*args, **kwargs):
        nonlocal started
        started = True

    monkeypatch.setattr("app.desktop.threading.Thread", fail_if_started)

    _start_parent_watchdog(None)

    assert started is False


def test_desktop_backend_detects_current_process():
    assert _is_process_running(os.getpid()) is True


def test_desktop_backend_writes_logs_to_local_application_data(monkeypatch, tmp_path):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))

    log_file = _configure_file_logging("warning")

    assert log_file == tmp_path / "BIONIC" / "ORION Field" / "logs" / "backend.log"
    assert log_file.parent.is_dir()


@pytest.mark.parametrize("port", ["0", "1023", "65536"])
def test_desktop_backend_rejects_unsafe_ports(port):
    with pytest.raises(SystemExit):
        create_parser().parse_args(["--port", port])


@pytest.mark.parametrize("process_id", ["0", "-1"])
def test_desktop_backend_rejects_invalid_parent_pid(process_id):
    with pytest.raises(SystemExit):
        create_parser().parse_args(["--parent-pid", process_id])
