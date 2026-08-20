import io
import json
import zipfile

from fastapi.testclient import TestClient

from app.main import app
from app.models.support import SupportBundleRequest
from app.services import support_bundle as service


def test_support_bundle_redacts_secrets_and_contains_runtime(monkeypatch, tmp_path) -> None:
    log_file = tmp_path / "backend.log"
    log_file.write_text(
        "password=nao-incluir token:abc123\nAuthorization: Basic dXNlcjpzZWNyZXQ=\nlog seguro",
        encoding="utf-8",
    )
    monkeypatch.setattr(service, "_log_path", lambda: log_file)

    filename, content = service.create_support_bundle(
        SupportBundleRequest(recent_error="secret=erro-privado")
    )

    assert filename.startswith("orion-support-")
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        report = json.loads(archive.read("orion-support-report.json"))
        log = archive.read("backend-sanitized.log").decode()
    assert report["orion_version"] == "0.7.1"
    assert "erro-privado" not in report["recent_error"]
    assert "nao-incluir" not in log
    assert "abc123" not in log
    assert "dXNlcjpzZWNyZXQ=" not in log
    assert "log seguro" in log


def test_support_bundle_endpoint_returns_zip() -> None:
    response = TestClient(app).post(
        "/api/support/bundle",
        json={"device": None, "recent_error": None},
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert "orion-support-" in response.headers["content-disposition"]
    assert zipfile.is_zipfile(io.BytesIO(response.content))
