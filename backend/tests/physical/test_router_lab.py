from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Callable

import pytest

from app.models.configuration import (
    BasicNetworkApplyRequest,
    BasicNetworkConfiguration,
    BasicNetworkPreviewRequest,
    ConfigurationApplyRequest,
    ConfigurationPreviewRequest,
    LinkConfiguration,
    LoraProtectionApplyRequest,
    LoraProtectionConfiguration,
    LoraProtectionPreviewRequest,
)
from app.models.mikrotik import ConnectivityRequest, MikroTikConnection, PingRequest
from app.services.configuration import apply_link_configuration, preview_link_configuration
from app.services.lora_configuration import apply_lora_protection, preview_lora_protection
from app.services.network_configuration import (
    apply_basic_network,
    preview_basic_network,
    read_basic_network_state,
)
from app.services.routeros import discover_device, ping_device, validate_connectivity


pytestmark = pytest.mark.physical


def _laboratory() -> dict[str, Any]:
    path_text = os.environ.get("ORION_PHYSICAL_LAB_FILE")
    if not path_text:
        pytest.skip("Defina ORION_PHYSICAL_LAB_FILE para executar a bancada física.")
    path = Path(path_text).expanduser().resolve()
    if not path.is_file():
        pytest.fail(f"Arquivo da bancada não encontrado: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _connection(device: dict[str, Any], *, host: str | None = None) -> MikroTikConnection:
    settings = device["connection"]
    password_environment = settings["password_env"]
    password = os.environ.get(password_environment)
    if password is None:
        pytest.fail(
            f"Defina a variável {password_environment} com a senha de {device['name']}."
        )
    return MikroTikConnection(
        host=host or settings["host"],
        username=settings["username"],
        password=password,
        port=settings.get("api_port", 8728),
        use_tls=settings.get("use_tls", False),
        verify_tls=settings.get("verify_tls", True),
    )


def _assert_fields(actual: Any, expected: dict[str, Any], context: str) -> None:
    values = actual.model_dump(mode="json") if hasattr(actual, "model_dump") else actual
    for key, expected_value in expected.items():
        assert values.get(key) == expected_value, (
            f"{context}: {key} retornou {values.get(key)!r}, esperado {expected_value!r}."
        )


def _retry(
    operation: Callable[[], Any],
    *,
    attempts: int = 8,
    interval_seconds: float = 1.5,
) -> Any:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            return operation()
        except Exception as error:  # physical reconnection intentionally spans errors
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(interval_seconds)
    raise AssertionError("O equipamento não voltou a responder dentro da janela de teste.") from last_error


def test_physical_lab_read_discovery_connectivity_and_external_targets() -> None:
    laboratory = _laboratory()
    assert laboratory.get("devices"), "A bancada precisa declarar pelo menos um equipamento."

    for device in laboratory["devices"]:
        active_connection = _connection(device)
        summary = discover_device(active_connection)
        _assert_fields(summary, device.get("expect_device", {}), device["name"])

        network_state = read_basic_network_state(active_connection)
        _assert_fields(
            network_state,
            device.get("expect_network", {}),
            f"{device['name']} / rede",
        )

        if device.get("validate_connectivity", True):
            connectivity = validate_connectivity(ConnectivityRequest(
                connection=active_connection,
                remote_target=device.get("remote_target"),
            ))
            assert connectivity.gateway.status in {"passed", "failed", "unavailable"}
            assert connectivity.arp.status in {"passed", "failed", "unavailable"}
            assert connectivity.internet.status in {"passed", "failed", "unavailable"}

        for target in device.get("ping_targets", []):
            result = ping_device(PingRequest(
                connection=active_connection,
                target=target,
                count=5,
            ))
            assert result.sent == 5
            assert 0 <= result.received <= 5
            assert 0 <= result.packet_loss_percent <= 100


def test_physical_lab_confirmed_write_cycles_and_persistence() -> None:
    laboratory = _laboratory()
    if os.environ.get("ORION_ALLOW_PHYSICAL_WRITES") != "APLICAR":
        pytest.skip("Bancada física executada somente em leitura; gravações não autorizadas.")

    for device in laboratory["devices"]:
        cycles = device.get("write_cycles", {})
        if not any(cycles.get(kind) for kind in ("network", "wifi", "lora")):
            continue
        assert device.get("dedicated_lab") is True, (
            f"{device['name']}: gravação exige dedicated_lab=true."
        )
        assert device.get("recovery_plan"), (
            f"{device['name']}: informe recovery_plan antes do teste destrutivo."
        )
        active_connection = _connection(device)

        for cycle in cycles.get("network", []):
            configuration = BasicNetworkConfiguration(**cycle["configuration"])
            preview = preview_basic_network(BasicNetworkPreviewRequest(
                connection=active_connection,
                configuration=configuration,
            ))
            assert preview.device_identity
            result = apply_basic_network(BasicNetworkApplyRequest(
                connection=active_connection,
                configuration=configuration,
                confirmation="APLICAR",
            ))
            reconnect_host = cycle.get("reconnect_host") or str(result.reconnect_ip)
            active_connection = _connection(device, host=reconnect_host)
            state = _retry(lambda: read_basic_network_state(active_connection))
            _assert_fields(state, cycle.get("expect_network", {}), cycle.get("name", "rede"))

        for cycle in cycles.get("wifi", []):
            configuration = LinkConfiguration(**cycle["configuration"])
            preview = preview_link_configuration(ConfigurationPreviewRequest(
                connection=active_connection,
                configuration=configuration,
            ))
            assert preview.device_identity
            result = apply_link_configuration(ConfigurationApplyRequest(
                connection=active_connection,
                configuration=configuration,
                confirmation="APLICAR",
            ))
            reconnect_host = cycle.get("reconnect_host") or str(result.reconnect_ip)
            active_connection = _connection(device, host=reconnect_host)
            summary = _retry(lambda: discover_device(active_connection))
            _assert_fields(summary, cycle.get("expect_device", {}), cycle.get("name", "wifi"))

        for cycle in cycles.get("lora", []):
            configuration = LoraProtectionConfiguration(**cycle["configuration"])
            preview = preview_lora_protection(LoraProtectionPreviewRequest(
                connection=active_connection,
                configuration=configuration,
            ))
            assert preview.lora_interface
            apply_lora_protection(LoraProtectionApplyRequest(
                connection=active_connection,
                configuration=configuration,
                confirmation="APLICAR",
            ))
            repeated = _retry(lambda: preview_lora_protection(
                LoraProtectionPreviewRequest(
                    connection=active_connection,
                    configuration=configuration,
                )
            ))
            assert repeated.lora_interface == preview.lora_interface
