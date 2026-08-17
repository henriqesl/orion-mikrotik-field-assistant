import pytest

from app.desktop import DEFAULT_DESKTOP_PORT, _configure_file_logging, create_parser


def test_desktop_backend_uses_fixed_loopback_port():
    options = create_parser().parse_args([])

    assert options.port == DEFAULT_DESKTOP_PORT
    assert options.log_level == "warning"


def test_desktop_backend_accepts_installer_port_override():
    options = create_parser().parse_args(["--port", "8877", "--log-level", "info"])

    assert options.port == 8877
    assert options.log_level == "info"


def test_desktop_backend_writes_logs_to_local_application_data(monkeypatch, tmp_path):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))

    log_file = _configure_file_logging("warning")

    assert log_file == tmp_path / "BIONIC" / "ORION Field" / "logs" / "backend.log"
    assert log_file.parent.is_dir()


@pytest.mark.parametrize("port", ["0", "1023", "65536"])
def test_desktop_backend_rejects_unsafe_ports(port):
    with pytest.raises(SystemExit):
        create_parser().parse_args(["--port", port])
