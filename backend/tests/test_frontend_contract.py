"""Validate the actual JavaScript form payload against the production API model."""

import json
from pathlib import Path
import shutil
import subprocess

import pytest

from app.models.configuration import BasicNetworkConfiguration
from app.services.network_configuration import _read_basic_network_state
from tests.support.stateful_router import factory_router, ethernet_router, wifi_station_router
from tests.test_stateful_field_scenarios import network_settings


@pytest.mark.parametrize("factory", [factory_router, ethernet_router, wifi_station_router])
def test_real_network_form_payload_matches_backend_schema(factory):
    node = shutil.which("node")
    if not node:
        pytest.skip("Node.js is required for the frontend/backend contract check")
    module = Path(__file__).resolve().parents[2] / "frontend/src/services/networkForm.js"
    current = _read_basic_network_state(factory()).model_dump(mode="json")
    fallback = network_settings().model_dump(mode="json")
    fallback["dns_servers"] = ", ".join(fallback["dns_servers"])
    source = """
      const { networkFormFromCurrent, networkPayload } = await import(process.argv[1]);
      let input = ''; for await (const part of process.stdin) input += part;
      const { current, fallback } = JSON.parse(input);
      const form = networkFormFromCurrent(current, fallback);
      process.stdout.write(JSON.stringify(networkPayload(form)));
    """
    result = subprocess.run([node, "--input-type=module", "-e", source, module.as_uri()], input=json.dumps({"current": current, "fallback": fallback}), text=True, capture_output=True, check=True, timeout=15)
    config = BasicNetworkConfiguration.model_validate_json(result.stdout)
    if current["wan_configured"]:
        assert config.configure_wan is False
        assert config.configure_dns is False
