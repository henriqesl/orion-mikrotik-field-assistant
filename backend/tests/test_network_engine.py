from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services import network_engine


def test_network_engine_parses_valid_json(monkeypatch, tmp_path: Path) -> None:
    executable = tmp_path / "orion-network-engine.exe"
    executable.touch()
    captured_arguments = None

    def fake_run(arguments, **_kwargs):
        nonlocal captured_arguments
        captured_arguments = arguments
        return SimpleNamespace(
            returncode=0,
            stdout=(
                '{"sent_packets":3,"received_packets":2,'
                '"packet_loss_percent":33.333,"availability_percent":66.667,'
                '"minimum_latency_ms":2,"average_latency_ms":3,'
                '"maximum_latency_ms":4,"jitter_ms":2,'
                '"p95_latency_ms":3.9,"p99_latency_ms":3.98,'
                '"spike_count":0,"stability_score":73}'
            ),
            stderr="",
        )

    monkeypatch.setattr(network_engine, "find_network_engine", lambda: executable)
    monkeypatch.setattr(network_engine.subprocess, "run", fake_run)

    result = network_engine.analyze_network_samples(3, [2.0, 4.0])

    assert captured_arguments == [
        str(executable),
        "analyze",
        "--sent",
        "3",
        "--samples",
        "2.000000,4.000000",
    ]
    assert result.source == "orion_network_engine"
    assert result.jitter_ms == 2
    assert result.p95_latency_ms == 3.9
    assert result.stability_score == 73


def test_network_engine_reports_missing_executable(monkeypatch) -> None:
    monkeypatch.setattr(network_engine, "find_network_engine", lambda: None)

    with pytest.raises(network_engine.NetworkEngineUnavailableError):
        network_engine.analyze_network_samples(3, [2.0, 4.0])


def test_network_engine_rejects_invalid_output(monkeypatch, tmp_path: Path) -> None:
    executable = tmp_path / "orion-network-engine.exe"
    executable.touch()
    monkeypatch.setattr(network_engine, "find_network_engine", lambda: executable)
    monkeypatch.setattr(
        network_engine.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(
            returncode=0,
            stdout="not-json",
            stderr="",
        ),
    )

    with pytest.raises(network_engine.NetworkEngineUnavailableError):
        network_engine.analyze_network_samples(3, [2.0, 4.0])
