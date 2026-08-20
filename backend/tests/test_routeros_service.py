from types import SimpleNamespace

import pytest
from routeros.errors import DeviceError

from app.models.mikrotik import (
    ConnectivityRequest,
    InterfaceTrafficRequest,
    MikroTikConnection,
    NetworkEngineMetrics,
    PingRequest,
)
from app.services import routeros as service


class FakeClient:
    def __init__(self) -> None:
        self.commands: list[str] = []

    def __enter__(self):
        return self

    def __exit__(self, *_args) -> None:
        return None

    def run(self, command: str):
        self.commands.append(command)

        rows = {
            "/system/identity/print": {"name": "ORION-Station"},
            "/system/resource/print": {
                "board-name": "SXTsq 5 ax",
                "version": "7.20.8 (stable)",
                "architecture-name": "arm64",
            },
            "/system/package/print": [
                {"name": "routeros", "version": "7.20.8"},
                {"name": "wifi-qcom", "version": "7.20.8"},
            ],
            "/interface/wifi/print": [
                {
                    "name": "wifi1",
                    "default-name": "wifi1",
                    "mac-address": "AA:BB:CC:DD:EE:FF",
                    "disabled": "false",
                    "running": "true",
                    "configuration.mode": "station",
                    "configuration.ssid": "ORION-Link",
                    "channel.frequency": "5805",
                    "channel.width": "20mhz",
                    "channel.band": "5ghz-ax",
                }
            ],
            "/interface/wifi/registration-table/print": [
                {
                    "interface": "wifi1",
                    "ssid": "ORION-Link",
                    "mac-address": "11:22:33:44:55:66",
                    "authorized": "true",
                    "signal": "-61",
                    "tx-rate": "144.1Mbps",
                    "rx-rate": "120.1Mbps",
                    "tx-bits-per-second": "12000000",
                    "rx-bits-per-second": "9000000",
                    "uptime": "1h20m",
                    "last-activity": "20ms",
                    "band": "5ghz-ax",
                }
            ],
            "/iot/lora/print": [],
            "/interface/ethernet/print": [
                {
                    "name": "ether1",
                    "mac-address": "AA:BB:CC:DD:EE:01",
                    "disabled": "false",
                    "running": "true",
                }
            ],
            "/interface/bridge/print": [
                {
                    "name": "bridge1",
                    "disabled": "false",
                    "running": "true",
                    "protocol-mode": "rstp",
                }
            ],
            "/interface/bridge/port/print": [
                {"interface": "wifi1", "bridge": "bridge1", "disabled": "false"},
                {"interface": "ether1", "bridge": "bridge1", "disabled": "false"},
            ],
            "/ip/address/print": [
                {
                    "address": "192.168.88.1/24",
                    "network": "192.168.88.0",
                    "interface": "bridge1",
                    "actual-interface": "bridge1",
                    "disabled": "false",
                    "invalid": "false",
                }
            ],
            "/ip/route/print": [
                {
                    "dst-address": "0.0.0.0/0",
                    "gateway": "192.168.88.254",
                    "immediate-gw": "192.168.88.254%bridge1",
                    "routing-table": "main",
                    "active": "true",
                    "disabled": "false",
                    "distance": "1",
                }
            ],
        }
        command_rows = rows[command]

        if not isinstance(command_rows, list):
            command_rows = [command_rows]

        return SimpleNamespace(
            re=[SimpleNamespace(map=row) for row in command_rows],
        )


def test_discover_device_uses_plain_api_and_maps_real_fields(monkeypatch) -> None:
    fake_client = FakeClient()
    captured: dict = {}

    def fake_dial(address, username, password, **kwargs):
        captured.update(
            address=address,
            username=username,
            password=password,
            kwargs=kwargs,
        )
        return fake_client

    monkeypatch.setattr(service.routeros, "dial", fake_dial)

    connection = MikroTikConnection(
        host="192.168.88.1",
        username="orion",
        password="secret",
    )
    result = service.discover_device(connection)

    assert result.identity == "ORION-Station"
    assert result.model == "SXTsq 5 ax"
    assert result.routeros_version == "7.20.8 (stable)"
    assert result.architecture == "arm64"
    assert result.wifi_package == "wifi-qcom"
    assert result.wifi_stack == "wifi"
    assert result.wifi_interfaces[0].name == "wifi1"
    assert result.wifi_interfaces[0].running is True
    assert result.radio_device is True
    assert result.lora_available is False
    assert result.compatibility.profile_id == "mikrotik-sxt"
    assert result.compatibility.support_level == "recognized"
    assert result.wifi_interfaces[0].mode == "station"
    assert result.wifi_interfaces[0].ssid == "ORION-Link"
    assert result.wifi_interfaces[0].frequency == "5805"
    assert result.wifi_interfaces[0].channel_width == "20mhz"
    assert result.wifi_interfaces[0].band == "5ghz-ax"
    assert result.registration_table_available is True
    assert result.wifi_peers[0].signal == "-61"
    assert result.wifi_peers[0].signal_dbm == -61
    assert result.wifi_peers[0].authorized is True
    assert result.wifi_peers[0].tx_bits_per_second == 12000000
    assert result.ethernet_interfaces[0].name == "ether1"
    assert result.bridges[0].name == "bridge1"
    assert result.bridge_ports[0].interface == "wifi1"
    assert result.ip_addresses[0].actual_interface == "bridge1"
    assert result.default_routes[0].active is True
    assert all(
        check.status == "passed"
        for check in result.structural_diagnostic.checks
    )
    assert captured == {
        "address": "192.168.88.1:8728",
        "username": "orion",
        "password": "secret",
        "kwargs": {"timeout": service.CONNECTION_TIMEOUT_SECONDS},
    }
    assert fake_client.commands == [
        "/system/identity/print",
        "/system/resource/print",
        "/system/package/print",
        "/interface/wifi/print",
        "/iot/lora/print",
        "/interface/wifi/registration-table/print",
        "/interface/ethernet/print",
        "/interface/bridge/print",
        "/interface/bridge/port/print",
        "/ip/address/print",
        "/ip/route/print",
    ]


def test_read_interface_traffic_uses_passive_routeros_monitor(monkeypatch) -> None:
    calls: list[tuple[str, ...]] = []

    class TrafficClient:
        def run(self, *words: str):
            calls.append(words)
            return SimpleNamespace(
                re=[SimpleNamespace(map={
                    "name": "ether1",
                    "rx-bits-per-second": "18400000",
                    "tx-bits-per-second": "7200000",
                    "rx-packets-per-second": "2140",
                    "tx-packets-per-second": "1080",
                    "tx-queue-drops-per-second": "0",
                })]
            )

    monkeypatch.setattr(
        service,
        "_with_connection",
        lambda _connection, operation: operation(TrafficClient()),
    )
    result = service.read_interface_traffic(
        InterfaceTrafficRequest(
            connection=MikroTikConnection(
                host="192.168.88.1",
                username="orion",
                password="secret",
            ),
            interface="ether1",
        )
    )

    assert result.interface == "ether1"
    assert result.rx_bits_per_second == 18_400_000
    assert result.tx_bits_per_second == 7_200_000
    assert result.rx_packets_per_second == 2_140
    assert result.tx_queue_drops_per_second == 0
    assert calls == [
        ("/interface/monitor-traffic", "=interface=ether1", "=once="),
    ]
def test_device_classification_separates_wifi_router_from_field_radio() -> None:
    wifi_ap = service.WiFiInterface(
        name="wifi1",
        default_name="wifi1",
        mac_address=None,
        disabled=False,
        running=True,
        mode="ap",
        ssid="Escritorio",
        frequency="2412",
        channel_width="20mhz",
        band="2ghz-ax",
    )
    wifi_station = wifi_ap.model_copy(update={"mode": "station"})

    assert service._is_radio_device("hAP ax3", [wifi_ap]) is False
    assert service._is_radio_device("CCR2004", []) is False
    assert service._is_radio_device("LHG 5 ax", [wifi_ap]) is True
    assert service._is_radio_device("Modelo desconhecido", [wifi_station]) is True


def test_discover_device_uses_tls_connector(monkeypatch) -> None:
    fake_client = FakeClient()
    captured: dict = {}

    def fake_dial_tls(address, username, password, **kwargs):
        captured.update(address=address, kwargs=kwargs)
        return fake_client

    monkeypatch.setattr(service.routeros, "dial_tls", fake_dial_tls)

    connection = MikroTikConnection(
        host="10.0.0.2",
        username="orion",
        password="secret",
        port=8729,
        use_tls=True,
        verify_tls=False,
    )
    service.discover_device(connection)

    assert captured["address"] == "10.0.0.2:8729"
    assert captured["kwargs"]["timeout"] == service.CONNECTION_TIMEOUT_SECONDS
    assert captured["kwargs"]["tls_context"].verify_mode == service.ssl.CERT_NONE


def test_discover_device_falls_back_to_legacy_wireless_menu(monkeypatch) -> None:
    class LegacyClient(FakeClient):
        def run(self, command: str):
            self.commands.append(command)

            if command == "/system/identity/print":
                rows = [{"name": "ORION-Legacy"}]
            elif command == "/system/resource/print":
                rows = [
                    {
                        "board-name": "LHG 5",
                        "version": "6.49.18",
                        "architecture-name": "mipsbe",
                    }
                ]
            elif command == "/system/package/print":
                rows = [{"name": "system"}, {"name": "wireless"}]
            elif command == "/interface/wireless/print":
                rows = [
                    {
                        "name": "wlan1",
                        "mac-address": "11:22:33:44:55:66",
                        "disabled": "false",
                        "running": "false",
                        "mode": "station-bridge",
                        "ssid": "ORION-Legacy",
                        "frequency": "5745",
                        "channel-width": "20/40mhz-Ce",
                        "band": "5ghz-a/n",
                    }
                ]
            elif command == "/interface/wireless/registration-table/print":
                rows = [
                    {
                        "interface": "wlan1",
                        "mac-address": "AA:BB:CC:DD:EE:FF",
                        "radio-name": "AP-Torre",
                        "signal-strength": "-78dBm@6Mbps",
                        "tx-rate": "54Mbps",
                        "rx-rate": "48Mbps",
                        "uptime": "3h12m",
                        "last-activity": "30ms",
                    }
                ]
            else:
                raise DeviceError(
                    SimpleNamespace(map={"message": "menu unavailable"})
                )

            return SimpleNamespace(
                re=[SimpleNamespace(map=row) for row in rows],
            )

    legacy_client = LegacyClient()
    monkeypatch.setattr(service.routeros, "dial", lambda *_args, **_kwargs: legacy_client)

    result = service.discover_device(
        MikroTikConnection(
            host="192.168.88.1",
            username="orion",
            password="secret",
        )
    )

    assert result.wifi_package == "wireless"
    assert result.wifi_stack == "wireless"
    assert result.wifi_interfaces[0].name == "wlan1"
    assert result.wifi_interfaces[0].running is False
    assert result.wifi_interfaces[0].mode == "station-bridge"
    assert result.wifi_interfaces[0].ssid == "ORION-Legacy"
    assert result.wifi_interfaces[0].frequency == "5745"
    assert result.wifi_interfaces[0].channel_width == "20/40mhz-Ce"
    assert result.wifi_interfaces[0].band == "5ghz-a/n"
    assert result.registration_table_available is True
    assert result.wifi_peers[0].radio_name == "AP-Torre"
    assert result.wifi_peers[0].signal == "-78dBm@6Mbps"
    assert result.wifi_peers[0].signal_dbm == -78
    assert result.wifi_peers[0].authorized is None
    assert all(
        check.status == "unavailable"
        for check in result.structural_diagnostic.checks[2:]
    )


def test_structural_diagnostic_explains_incomplete_bridge_without_rejecting_l2() -> None:
    diagnostic = service._structural_diagnostic(
        wifi_interfaces=[
            service.WiFiInterface(
                name="wifi1",
                default_name="wifi1",
                mac_address=None,
                disabled=False,
                running=True,
                mode="station",
                ssid="ORION-Link",
                frequency="5805",
                channel_width="20mhz",
                band="5ghz-ax",
            )
        ],
        registration_table_available=True,
        wifi_peers=[],
        ethernet_available=True,
        ethernet_interfaces=[
            service.EthernetInterface(
                name="ether1", mac_address=None, disabled=False, running=True
            )
        ],
        bridge_available=True,
        bridges=[
            service.BridgeInfo(
                name="bridge1", disabled=False, running=True, protocol_mode="rstp"
            )
        ],
        bridge_ports_available=True,
        bridge_ports=[
            service.BridgePort(
                interface="wifi1",
                bridge="bridge1",
                disabled=False,
                inactive=False,
                hw_offload=None,
            )
        ],
        ip_available=True,
        ip_addresses=[],
        routes_available=True,
        default_routes=[],
    )

    checks = {check.key: check for check in diagnostic.checks}
    assert checks["association"].status == "failed"
    assert checks["wifi_bridge"].status == "passed"
    assert checks["ethernet_bridge"].status == "failed"
    assert checks["management_ip"].status == "warning"
    assert checks["default_route"].status == "warning"
    assert "camada 2" in checks["default_route"].possible_causes[0]


@pytest.mark.parametrize(
    ("raw_signal", "expected"),
    [
        ("-61", -61),
        ("-78dBm@6Mbps", -78),
        (None, None),
        ("not-informed", None),
    ],
)
def test_signal_dbm_normalization(raw_signal, expected) -> None:
    assert service._signal_dbm(raw_signal) == expected


def test_registration_table_reports_unavailable_menu() -> None:
    class UnavailableClient:
        def run(self, _command: str):
            raise DeviceError(
                SimpleNamespace(map={"message": "menu unavailable"})
            )

    available, peers = service._read_registration_table(
        UnavailableClient(),
        "wifi",
    )

    assert available is False
    assert peers == []


@pytest.mark.parametrize(
    ("routeros_duration", "expected_ms"),
    [
        ("453us", 0.453),
        ("3ms200us", 3.2),
        ("1s20ms", 1020.0),
        ("0ms", 0.0),
        (None, None),
    ],
)
def test_routeros_duration_normalization(
    routeros_duration,
    expected_ms,
) -> None:
    assert service._duration_ms(routeros_duration) == expected_ms


def test_ping_device_uses_routeros_summary(monkeypatch) -> None:
    class PingClient:
        def __enter__(self):
            return self

        def __exit__(self, *_args) -> None:
            return None

        def run(self, *words):
            assert words == (
                "/ping",
                "=address=10.0.0.2",
                "=count=5",
                "=interval=200ms",
            )
            rows = [
                {
                    "seq": "0",
                    "time": "1ms200us",
                    "sent": "1",
                    "received": "1",
                    "packet-loss": "0",
                    "min-rtt": "1ms200us",
                    "avg-rtt": "1ms200us",
                    "max-rtt": "1ms200us",
                },
                {
                    "seq": "1",
                    "time": "4ms",
                    "sent": "5",
                    "received": "4",
                    "packet-loss": "20",
                    "min-rtt": "1ms200us",
                    "avg-rtt": "2ms500us",
                    "max-rtt": "4ms",
                },
            ]
            return SimpleNamespace(
                re=[SimpleNamespace(map=row) for row in rows],
            )

    monkeypatch.setattr(
        service,
        "_open_client",
        lambda _connection: PingClient(),
    )
    monkeypatch.setattr(
        service,
        "_read_wifi",
        lambda _client: (None, "wifi", []),
    )
    monkeypatch.setattr(
        service,
        "_read_registration_table",
        lambda _client, _stack: (False, []),
    )
    request = PingRequest(
        connection=MikroTikConnection(
            host="192.168.88.1",
            username="orion",
            password="secret",
        ),
        target="10.0.0.2",
    )

    result = service.ping_device(request)

    assert result.sent == 5
    assert result.received == 4
    assert result.packet_loss_percent == 20
    assert result.minimum_latency_ms == 1.2
    assert result.average_latency_ms == 2.5
    assert result.maximum_latency_ms == 4
    assert result.samples_ms == [1.2, 4.0]
    assert result.measurement_source == "routeros_summary"
    assert result.advanced_metrics is None
    assert result.advanced_metrics_unavailable_reason is not None


def test_ping_device_calculates_fallback_when_summary_is_missing(
    monkeypatch,
) -> None:
    class PingClient:
        def __enter__(self):
            return self

        def __exit__(self, *_args) -> None:
            return None

        def run(self, *_words):
            return SimpleNamespace(
                re=[
                    SimpleNamespace(map={"time": "2ms"}),
                    SimpleNamespace(map={"status": "timeout"}),
                    SimpleNamespace(map={"time": "4ms"}),
                ]
            )

    monkeypatch.setattr(
        service,
        "_open_client",
        lambda _connection: PingClient(),
    )
    monkeypatch.setattr(
        service,
        "_read_wifi",
        lambda _client: (None, "wifi", []),
    )
    monkeypatch.setattr(
        service,
        "_read_registration_table",
        lambda _client, _stack: (False, []),
    )
    monkeypatch.setattr(
        service,
        "analyze_network_samples",
        lambda sent, samples: NetworkEngineMetrics(
            sent_packets=sent,
            received_packets=len(samples),
            packet_loss_percent=33.333,
            availability_percent=66.667,
            minimum_latency_ms=2,
            average_latency_ms=3,
            maximum_latency_ms=4,
            jitter_ms=2,
            p95_latency_ms=3.9,
            p99_latency_ms=3.98,
            latency_range_ms=2,
            standard_deviation_ms=1,
            tail_spread_ms=0.98,
            spike_count=0,
            stability_score=73,
        ),
    )
    request = PingRequest(
        connection=MikroTikConnection(
            host="192.168.88.1",
            username="orion",
            password="secret",
        ),
        target="10.0.0.2",
        count=3,
    )

    result = service.ping_device(request)

    assert result.sent == 3
    assert result.received == 2
    assert result.packet_loss_percent == 33.33
    assert result.average_latency_ms == 3
    assert result.measurement_source == "orion_calculation"
    assert result.advanced_metrics is not None
    assert result.advanced_metrics.jitter_ms == 2
    assert result.advanced_metrics.stability_score == 73


def test_validate_connectivity_checks_gateway_arp_and_internet(monkeypatch) -> None:
    class ConnectivityClient:
        def __enter__(self):
            return self

        def __exit__(self, *_args) -> None:
            return None

        def run(self, *words):
            if words == ("/ip/route/print",):
                rows = [
                    {
                        "dst-address": "0.0.0.0/0",
                        "gateway": "192.168.88.254",
                        "active": "true",
                        "disabled": "false",
                    }
                ]
            elif words == ("/ip/arp/print",):
                rows = [
                    {
                        "address": "192.168.88.2",
                        "mac-address": "11:22:33:44:55:66",
                        "interface": "bridge1",
                        "complete": "true",
                        "status": "reachable",
                    }
                ]
            elif words[0] == "/ping":
                target = words[1].split("=", 2)[2]
                latency = "2ms" if target == "192.168.88.254" else "12ms"
                rows = [
                    {
                        "sent": "3",
                        "received": "3",
                        "packet-loss": "0",
                        "min-rtt": latency,
                        "avg-rtt": latency,
                        "max-rtt": latency,
                    }
                ]
            else:
                raise AssertionError(words)

            return SimpleNamespace(
                re=[SimpleNamespace(map=row) for row in rows]
            )

    monkeypatch.setattr(
        service, "_open_client", lambda _connection: ConnectivityClient()
    )
    request = ConnectivityRequest(
        connection=MikroTikConnection(
            host="192.168.88.1",
            username="orion",
            password="secret",
        ),
        remote_target="192.168.88.2",
    )

    result = service.validate_connectivity(request)

    assert str(result.gateway_address) == "192.168.88.254"
    assert result.gateway.status == "passed"
    assert result.gateway.average_latency_ms == 2
    assert result.remote is not None
    assert result.remote.status == "passed"
    assert str(result.remote.target) == "192.168.88.2"
    assert result.arp.status == "passed"
    assert str(result.arp.ip_address) == "192.168.88.2"
    assert result.arp.mac_address == "11:22:33:44:55:66"
    assert result.internet.status == "passed"
    assert str(result.internet.target) == "1.1.1.1"


def test_arp_validation_reports_failed_resolution() -> None:
    result = service._arp_validation(
        True,
        [
            {
                "address": "10.0.0.1",
                "interface": "bridge1",
                "status": "failed",
            }
        ],
        service.IPv4Address("10.0.0.1"),
    )

    assert result.status == "failed"
    assert result.mac_address is None
