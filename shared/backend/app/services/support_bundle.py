import io
import json
import os
import platform
import re
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from app.models.support import SupportBundleRequest
from app.version import APP_VERSION


MAX_LOG_BYTES = 256_000
SENSITIVE_PATTERNS = (
    re.compile(r"(?i)(password|passphrase|secret|token)(\s*[=:]\s*)([^\s,;]+)"),
    re.compile(r"(?i)(authorization)(\s*:\s*basic\s+)([A-Za-z0-9+/=]+)"),
)


def _log_path() -> Path:
    local_data = Path(os.environ.get("LOCALAPPDATA", Path.home()))
    return local_data / "BIONIC" / "ORION Field" / "logs" / "backend.log"


def sanitize_text(value: str) -> str:
    sanitized = value
    for pattern in SENSITIVE_PATTERNS:
        sanitized = pattern.sub(r"\1\2[REDACTED]", sanitized)
    return sanitized


def _recent_log() -> str:
    path = _log_path()
    if not path.is_file():
        return "Nenhum log local foi encontrado."
    with path.open("rb") as log_file:
        log_file.seek(0, 2)
        size = log_file.tell()
        log_file.seek(max(0, size - MAX_LOG_BYTES))
        content = log_file.read().decode("utf-8", errors="replace")
    return sanitize_text(content)


def create_support_bundle(request: SupportBundleRequest) -> tuple[str, bytes]:
    created_at = datetime.now(UTC)
    report = {
        "schema_version": 1,
        "created_at": created_at.isoformat(),
        "orion_version": APP_VERSION,
        "runtime": {
            "operating_system": platform.platform(),
            "machine": platform.machine(),
            "python": platform.python_version(),
            "desktop_runtime": os.environ.get("ORION_DESKTOP_RUNTIME") == "1",
        },
        "device": request.device.model_dump(mode="json") if request.device else None,
        "recent_error": sanitize_text(request.recent_error) if request.recent_error else None,
        "privacy": "Credenciais, senhas, tokens e cabeçalhos de autorização não são incluídos.",
    }
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "orion-support-report.json",
            json.dumps(report, ensure_ascii=False, indent=2),
        )
        archive.writestr("backend-sanitized.log", _recent_log())
        archive.writestr(
            "LEIA-ME.txt",
            "Pacote de suporte do ORION Field. Revise o conteúdo antes de compartilhar externamente.\n",
        )
    filename = f"orion-support-{created_at.strftime('%Y%m%d-%H%M%S')}.zip"
    return filename, output.getvalue()
