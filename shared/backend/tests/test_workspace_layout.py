import json
from pathlib import Path

from app.main import FRONTEND_DIST
from app.services.lan_discovery import _winbox_candidates


ROOT = Path(__file__).resolve().parents[3]
FRONTEND = ROOT / "shared" / "frontend"


def test_api_serves_the_radio_build_in_shared_frontend():
    assert FRONTEND_DIST == FRONTEND / "dist"


def test_desktop_license_resources_survive_workspace_move():
    shell = FRONTEND / "src-tauri"
    config = json.loads((shell / "tauri.conf.json").read_text(encoding="utf-8"))
    for resource in config["bundle"]["resources"]:
        if resource.startswith("binaries/"):
            continue  # Generated only when packaging the desktop application.
        assert (shell / resource).resolve().exists(), resource


def test_winbox_lookup_still_uses_repository_root():
    candidates = _winbox_candidates()
    assert ROOT / "winbox.exe" in candidates
    assert ROOT / "tools" / "winbox.exe" in candidates


def test_desktop_script_references_survive_workspace_move():
    package = json.loads((FRONTEND / "package.json").read_text(encoding="utf-8"))
    for name in ("desktop:backend", "desktop:engine", "desktop:build:signed"):
        relative = package["scripts"][name].split("-File ", 1)[1]
        assert (FRONTEND / relative).resolve().is_file(), name
