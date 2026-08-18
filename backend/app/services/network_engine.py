import os
import shutil
import subprocess
import sys
from pathlib import Path

from pydantic import ValidationError

from app.models.mikrotik import NetworkEngineMetrics


ENGINE_BASE_NAME = "orion-network-engine"
ENGINE_TARGET_NAME = f"{ENGINE_BASE_NAME}-x86_64-pc-windows-msvc.exe"
ENGINE_TIMEOUT_SECONDS = 5


class NetworkEngineUnavailableError(RuntimeError):
    pass


def _engine_candidates() -> list[Path]:
    candidates: list[Path] = []
    configured_path = os.environ.get("ORION_NETWORK_ENGINE_PATH")
    if configured_path:
        candidates.append(Path(configured_path))

    executable_directory = Path(sys.executable).resolve().parent
    candidates.extend(
        [
            executable_directory / f"{ENGINE_BASE_NAME}.exe",
            executable_directory / ENGINE_TARGET_NAME,
        ]
    )

    project_root = Path(__file__).resolve().parents[3]
    candidates.extend(
        [
            project_root / "frontend" / "src-tauri" / "binaries" / ENGINE_TARGET_NAME,
            project_root
            / "native"
            / "network-engine"
            / "build"
            / "Release"
            / f"{ENGINE_BASE_NAME}.exe",
        ]
    )

    path_candidate = shutil.which(f"{ENGINE_BASE_NAME}.exe") or shutil.which(
        ENGINE_BASE_NAME
    )
    if path_candidate:
        candidates.append(Path(path_candidate))
    return candidates


def find_network_engine() -> Path | None:
    return next((candidate for candidate in _engine_candidates() if candidate.is_file()), None)


def analyze_network_samples(
    sent_packets: int,
    latency_samples_ms: list[float],
) -> NetworkEngineMetrics:
    executable = find_network_engine()
    if executable is None:
        raise NetworkEngineUnavailableError("motor nativo não encontrado")

    arguments = [str(executable), "analyze", "--sent", str(sent_packets)]
    if latency_samples_ms:
        arguments.extend(
            ["--samples", ",".join(f"{sample:.6f}" for sample in latency_samples_ms)]
        )

    try:
        completed = subprocess.run(
            arguments,
            capture_output=True,
            check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            encoding="utf-8",
            timeout=ENGINE_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise NetworkEngineUnavailableError("motor nativo não respondeu") from error

    if completed.returncode != 0:
        raise NetworkEngineUnavailableError("motor nativo rejeitou as amostras")

    try:
        metrics = NetworkEngineMetrics.model_validate_json(completed.stdout)
    except ValidationError as error:
        raise NetworkEngineUnavailableError("resposta inválida do motor nativo") from error

    if (
        metrics.sent_packets != sent_packets
        or metrics.received_packets != len(latency_samples_ms)
    ):
        raise NetworkEngineUnavailableError("contagem divergente no motor nativo")
    return metrics
