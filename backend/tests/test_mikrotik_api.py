from fastapi.testclient import TestClient

from app.api import mikrotik
from app.main import app
from app.models.configuration import ConfigurationApplyResult, ConfigurationPreview
from app.models.mikrotik import ConnectivityValidation, DeviceSummary, PingResult
from app.models.discovery import LanDiscoveryResult
from app.services.routeros import (
    MikroTikAuthenticationError,
    MikroTikConnectionError,
    MikroTikTimeoutError,
)


client = TestClient(app)

VALID_CONNECTION = {
    "host": "192.168.88.1",
    "username": "orion",
    "password": "field-secret",
    "port": 8728,
    "use_tls": False,
    "verify_tls": True,
}

VALID_CONFIGURATION = {
    "role": "ap",
    "identity": "ORION-AP",
    "wifi_interface": "wifi1",
    "ethernet_interface": "ether1",
    "bridge_name": "bridge-field",
    "ssid": "ORION-Link",
    "passphrase": "safe-field-password",
    "frequency_mhz": 5805,
    "channel_width": "20mhz",
    "management_ip": "192.168.88.2/24",
    "gateway": "192.168.88.1",
}


def test_lan_discovery_returns_mndp_devices(monkeypatch) -> None:
    monkeypatch.setattr(
        mikrotik.mndp_collector,
        "snapshot",
        lambda: LanDiscoveryResult(
            status="listening",
            devices=[
                {
                    "mac_address": "AA:BB:CC:DD:EE:FF",
                    "identity": "MikroTik",
                    "ip_address": "0.0.0.0",
                    "board": "hAP ax2",
                    "last_seen_seconds": 1.2,
                }
            ],
        ),
    )

    response = client.get("/api/mikrotik/lan-devices")

    assert response.status_code == 200
    assert response.json()["devices"][0]["mac_address"] == "AA:BB:CC:DD:EE:FF"


def test_winbox_launch_does_not_receive_password(monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(
        mikrotik,
        "open_winbox",
        lambda mac_address, username: calls.append((mac_address, username)),
    )

    response = client.post(
        "/api/mikrotik/winbox/open",
        json={"mac_address": "AA:BB:CC:DD:EE:FF", "username": "orion"},
    )

    assert response.status_code == 200
    assert calls == [("AA:BB:CC:DD:EE:FF", "orion")]


def test_bootstrap_endpoint_returns_downloadable_script() -> None:
    response = client.post(
        "/api/mikrotik/bootstrap",
        json={
            "interface_name": "ether1",
            "address": "192.168.88.1/24",
        },
    )

    assert response.status_code == 200
    assert response.json()["filename"] == "orion-bootstrap.rsc"
    assert response.json()["reconnect_ip"] == "192.168.88.1"


def test_cors_allows_orion_frontend_port() -> None:
    response = client.options(
        "/api/mikrotik/discover",
        headers={
            "Origin": "http://localhost:5174",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == (
        "http://localhost:5174"
    )


def test_cors_does_not_allow_previous_frontend_port() -> None:
    response = client.options(
        "/api/mikrotik/discover",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert "access-control-allow-origin" not in response.headers


def test_discover_mikrotik_returns_normalized_device(monkeypatch) -> None:
    def fake_discover(_connection):
        return DeviceSummary(
            identity="Radio-Torre",
            model="LHG 5 ax",
            routeros_version="7.20.8",
            architecture="arm64",
            wifi_package="wifi-qcom",
            wifi_stack="wifi",
            wifi_interfaces=[
                {
                    "name": "wifi1",
                    "default_name": "wifi1",
                    "mac_address": "AA:BB:CC:DD:EE:FF",
                    "disabled": False,
                    "running": True,
                    "mode": "station",
                    "ssid": "ORION-Link",
                    "frequency": "5805",
                    "channel_width": "20mhz",
                    "band": "5ghz-ax",
                }
            ],
            registration_table_available=True,
            wifi_peers=[
                {
                    "interface": "wifi1",
                    "mac_address": "11:22:33:44:55:66",
                    "radio_name": None,
                    "ssid": "ORION-Link",
                    "authorized": True,
                    "signal": "-72",
                    "signal_dbm": -72,
                    "tx_rate": "144.1Mbps",
                    "rx_rate": "120.1Mbps",
                    "tx_bits_per_second": 12000000,
                    "rx_bits_per_second": 9000000,
                    "uptime": "6h24m21s",
                    "last_activity": "10ms",
                    "band": "5ghz-ax",
                    "signal_assessment": {
                        "status": "good",
                        "label": "Bom",
                        "explanation": "O nível de sinal está adequado.",
                    },
                    "association_assessment": {
                        "status": "good",
                        "label": "Autorizado",
                        "explanation": "O peer concluiu a autenticação.",
                    },
                }
            ],
            ethernet_interfaces=[],
            bridges=[],
            bridge_ports=[],
            ip_addresses=[],
            default_routes=[],
            structural_diagnostic={"checks": []},
        )

    monkeypatch.setattr(mikrotik, "discover_device", fake_discover)

    response = client.post("/api/mikrotik/discover", json=VALID_CONNECTION)

    assert response.status_code == 200
    assert response.json() == {
        "identity": "Radio-Torre",
        "model": "LHG 5 ax",
        "routeros_version": "7.20.8",
        "architecture": "arm64",
        "wifi_package": "wifi-qcom",
        "wifi_stack": "wifi",
        "wifi_interfaces": [
            {
                "name": "wifi1",
                "default_name": "wifi1",
                "mac_address": "AA:BB:CC:DD:EE:FF",
                "disabled": False,
                "running": True,
                "mode": "station",
                "ssid": "ORION-Link",
                "frequency": "5805",
                "channel_width": "20mhz",
                "band": "5ghz-ax",
            }
        ],
        "registration_table_available": True,
        "wifi_peers": [
            {
                "interface": "wifi1",
                "mac_address": "11:22:33:44:55:66",
                "radio_name": None,
                "ssid": "ORION-Link",
                "authorized": True,
                "signal": "-72",
                "signal_dbm": -72,
                "tx_rate": "144.1Mbps",
                "rx_rate": "120.1Mbps",
                "tx_bits_per_second": 12000000,
                "rx_bits_per_second": 9000000,
                "uptime": "6h24m21s",
                "last_activity": "10ms",
                "band": "5ghz-ax",
                "signal_assessment": {
                    "status": "good",
                    "label": "Bom",
                    "explanation": "O nível de sinal está adequado.",
                },
                "association_assessment": {
                    "status": "good",
                    "label": "Autorizado",
                    "explanation": "O peer concluiu a autenticação.",
                },
            }
        ],
        "ethernet_interfaces": [],
        "bridges": [],
        "bridge_ports": [],
        "ip_addresses": [],
        "default_routes": [],
        "structural_diagnostic": {"checks": []},
    }
    assert "field-secret" not in response.text


def test_discover_mikrotik_translates_authentication_error(monkeypatch) -> None:
    def fake_discover(_connection):
        raise MikroTikAuthenticationError

    monkeypatch.setattr(mikrotik, "discover_device", fake_discover)

    response = client.post("/api/mikrotik/discover", json=VALID_CONNECTION)

    assert response.status_code == 401
    assert response.json() == {
        "detail": "Usuário ou senha não foram aceitos pelo MikroTik."
    }


def test_discover_mikrotik_translates_timeout(monkeypatch) -> None:
    def fake_discover(_connection):
        raise MikroTikTimeoutError

    monkeypatch.setattr(mikrotik, "discover_device", fake_discover)

    response = client.post("/api/mikrotik/discover", json=VALID_CONNECTION)

    assert response.status_code == 504


def test_discover_mikrotik_translates_connection_error(monkeypatch) -> None:
    def fake_discover(_connection):
        raise MikroTikConnectionError

    monkeypatch.setattr(mikrotik, "discover_device", fake_discover)

    response = client.post("/api/mikrotik/discover", json=VALID_CONNECTION)

    assert response.status_code == 502


def test_discover_mikrotik_rejects_invalid_ip() -> None:
    invalid_connection = {**VALID_CONNECTION, "host": "mikrotik.local"}

    response = client.post("/api/mikrotik/discover", json=invalid_connection)

    assert response.status_code == 422


def test_ping_from_mikrotik_returns_normalized_metrics(monkeypatch) -> None:
    def fake_ping(_request):
        return PingResult(
            target="10.0.0.2",
            sent=5,
            received=4,
            packet_loss_percent=20,
            minimum_latency_ms=1.2,
            average_latency_ms=3.4,
            maximum_latency_ms=8.7,
            samples_ms=[1.2, 2.4, 3.3, 8.7],
            measurement_source="routeros_summary",
            packet_loss_assessment={
                "status": "weak",
                "label": "Instável",
                "explanation": "A perda compromete a estabilidade; repita e investigue.",
            },
            average_latency_assessment={
                "status": "excellent",
                "label": "Excelente",
                "explanation": "A latência média está muito baixa.",
            },
            maximum_latency_assessment={
                "status": "excellent",
                "label": "Excelente",
                "explanation": "Não foram observados picos relevantes.",
            },
        )

    monkeypatch.setattr(mikrotik, "ping_device", fake_ping)

    response = client.post(
        "/api/mikrotik/ping",
        json={
            "connection": VALID_CONNECTION,
            "target": "10.0.0.2",
            "count": 5,
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "target": "10.0.0.2",
        "sent": 5,
        "received": 4,
        "packet_loss_percent": 20.0,
        "minimum_latency_ms": 1.2,
        "average_latency_ms": 3.4,
        "maximum_latency_ms": 8.7,
        "samples_ms": [1.2, 2.4, 3.3, 8.7],
        "measurement_source": "routeros_summary",
        "packet_loss_assessment": {
            "status": "weak",
            "label": "Instável",
            "explanation": "A perda compromete a estabilidade; repita e investigue.",
        },
        "average_latency_assessment": {
            "status": "excellent",
            "label": "Excelente",
            "explanation": "A latência média está muito baixa.",
        },
        "maximum_latency_assessment": {
            "status": "excellent",
            "label": "Excelente",
            "explanation": "Não foram observados picos relevantes.",
        },
    }
    assert "field-secret" not in response.text


def test_ping_from_mikrotik_rejects_invalid_target() -> None:
    response = client.post(
        "/api/mikrotik/ping",
        json={
            "connection": VALID_CONNECTION,
            "target": "internet.example",
        },
    )

    assert response.status_code == 422


def test_connectivity_validation_returns_independent_checks(monkeypatch) -> None:
    def fake_validation(_request):
        return ConnectivityValidation(
            gateway_address="192.168.88.254",
            gateway={
                "label": "Gateway",
                "status": "passed",
                "target": "192.168.88.254",
                "sent": 3,
                "received": 3,
                "packet_loss_percent": 0,
                "average_latency_ms": 2,
                "summary": "O destino respondeu ao MikroTik.",
            },
            arp={
                "status": "passed",
                "ip_address": "192.168.88.254",
                "mac_address": "AA:BB:CC:DD:EE:FF",
                "interface": "bridge1",
                "summary": "O endereço MAC do gateway foi resolvido.",
            },
            internet={
                "label": "Internet",
                "status": "failed",
                "target": "1.1.1.1",
                "sent": 3,
                "received": 0,
                "packet_loss_percent": 100,
                "average_latency_ms": None,
                "summary": "O destino não respondeu aos três pacotes enviados.",
            },
        )

    monkeypatch.setattr(mikrotik, "validate_connectivity", fake_validation)

    response = client.post(
        "/api/mikrotik/connectivity",
        json={"connection": VALID_CONNECTION},
    )

    assert response.status_code == 200
    assert response.json()["gateway"]["status"] == "passed"
    assert response.json()["arp"]["mac_address"] == "AA:BB:CC:DD:EE:FF"
    assert response.json()["internet"] == {
        "label": "Internet",
        "status": "failed",
        "target": "1.1.1.1",
        "sent": 3,
        "received": 0,
        "packet_loss_percent": 100.0,
        "average_latency_ms": None,
        "summary": "O destino não respondeu aos três pacotes enviados.",
    }
    assert "field-secret" not in response.text


def test_configuration_preview_does_not_expose_secrets(monkeypatch) -> None:
    def fake_preview(_request):
        return ConfigurationPreview(
            device_identity="Radio-Torre",
            wifi_stack="wifi",
            changes=[
                {
                    "area": "Segurança",
                    "field": "Senha WPA2",
                    "current_value": "Protegida pelo RouterOS",
                    "new_value": "Será atualizada",
                    "sensitive": True,
                }
            ],
            warnings=["Backup será criado antes da alteração."],
            reconnect_ip="192.168.88.2",
        )

    monkeypatch.setattr(mikrotik, "preview_link_configuration", fake_preview)
    response = client.post(
        "/api/mikrotik/configuration/preview",
        json={"connection": VALID_CONNECTION, "configuration": VALID_CONFIGURATION},
    )

    assert response.status_code == 200
    assert response.json()["wifi_stack"] == "wifi"
    assert "safe-field-password" not in response.text
    assert "field-secret" not in response.text


def test_configuration_apply_requires_explicit_confirmation() -> None:
    response = client.post(
        "/api/mikrotik/configuration/apply",
        json={"connection": VALID_CONNECTION, "configuration": VALID_CONFIGURATION},
    )

    assert response.status_code == 422


def test_configuration_apply_returns_backup_and_reconnect_ip(monkeypatch) -> None:
    def fake_apply(_request):
        return ConfigurationApplyResult(
            status="applied",
            backup_file="orion-before-20260810-120000.backup",
            reconnect_ip="192.168.88.2",
            changes_applied=8,
            summary="Configuração enviada.",
        )

    monkeypatch.setattr(mikrotik, "apply_link_configuration", fake_apply)
    response = client.post(
        "/api/mikrotik/configuration/apply",
        json={
            "connection": VALID_CONNECTION,
            "configuration": VALID_CONFIGURATION,
            "confirmation": "APLICAR",
        },
    )

    assert response.status_code == 200
    assert response.json()["backup_file"].endswith(".backup")
    assert response.json()["reconnect_ip"] == "192.168.88.2"
    assert "safe-field-password" not in response.text
    assert "field-secret" not in response.text
