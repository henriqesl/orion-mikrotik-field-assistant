import json
import tomllib
from pathlib import Path

from app.version import APP_VERSION


def test_release_versions_match_across_desktop_and_api():
    root = Path(__file__).resolve().parents[2]
    for filename in ("frontend/package.json", "frontend/package-lock.json", "frontend/src-tauri/tauri.conf.json"):
        assert json.loads((root / filename).read_text(encoding="utf-8"))["version"] == APP_VERSION
    assert tomllib.loads((root / "backend/pyproject.toml").read_text(encoding="utf-8"))["project"]["version"] == APP_VERSION
    assert tomllib.loads((root / "frontend/src-tauri/Cargo.toml").read_text(encoding="utf-8"))["package"]["version"] == APP_VERSION
