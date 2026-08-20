from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import app, mount_frontend


client = TestClient(app)


def test_health_check() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "orion-field-api",
        "version": "0.7.1",
    }


def test_frontend_build_is_served_from_root(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text(
        "<h1>ORION Field</h1>",
        encoding="utf-8",
    )
    test_app = FastAPI()
    mount_frontend(test_app, tmp_path)

    response = TestClient(test_app).get("/")

    assert response.status_code == 200
    assert "ORION Field" in response.text


def test_missing_frontend_build_returns_setup_message(tmp_path: Path) -> None:
    test_app = FastAPI()
    mount_frontend(test_app, tmp_path / "dist")

    response = TestClient(test_app).get("/")

    assert response.status_code == 200
    assert response.json()["status"] == "frontend_not_built"

