from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.models.configuration import (
    BasicNetworkApplyRequest,
    BasicNetworkConfiguration,
    BasicNetworkPreviewRequest,
)
from app.models.mikrotik import MikroTikConnection
from app.services import network_configuration as service


def configuration(**updates) -> BasicNetworkConfiguration:
    values = {
        "identity": "ORION-Router-01",
        "wan_interface": "ether1",
        "wan_mode": "dhcp",
        "lan_bridge": "bridge-lan",
        "lan_address": "192.168.50.1/24",
        "lan_ports": ["ether2", "ether3"],
        "dns_servers": ["1.1.1.1", "8.8.8.8"],
        "enable_nat": True,
        "enable_lan_dhcp": True,
        "dhcp_pool_start": None,
        "dhcp_pool_end": None,
        "enable_ssh": True,
        "enable_winbox": True,
        "enable_webfig_https": False,
        "enable_telnet": False,
        "enable_ftp": False,
        "enable_webfig_http": False,
    }
    values.update(updates)
    return BasicNetworkConfiguration(**values)


class NetworkClient:
    def run(self, *words):
        rows = {
            "/system/identity/print": [{"name": "MikroTik"}],
            "/interface/ethernet/print": [
                {"name": "ether1"},
                {"name": "ether2"},
                {"name": "ether3"},
            ],
            "/interface/print": [
                {"name": "ether1", "type": "ether"},
                {"name": "ether2", "type": "ether"},
                {"name": "ether3", "type": "ether"},
                {"name": "wifi1", "type": "wifi"},
            ],
            "/interface/bridge/print": [],
            "/interface/bridge/port/print": [],
            "/ip/address/print": [{"address": "10.0.0.2/24", "interface": "ether1"}],
            "/ip/route/print": [{"dst-address": "0.0.0.0/0", "gateway": "10.0.0.1"}],
            "/ip/dhcp-client/print": [],
            "/ip/dns/print": [{"servers": "9.9.9.9"}],
            "/ip/firewall/nat/print": [],
            "/ip/pool/print": [],
            "/ip/dhcp-server/print": [],
            "/ip/dhcp-server/network/print": [],
            "/ip/service/print": [
                {".id": "*1", "name": "telnet", "disabled": "false"},
                {".id": "*2", "name": "ftp", "disabled": "true"},
                {".id": "*3", "name": "www", "disabled": "false"},
                {".id": "*4", "name": "ssh", "disabled": "false"},
                {".id": "*5", "name": "api", "disabled": "false"},
                {".id": "*6", "name": "winbox", "disabled": "false"},
                {".id": "*7", "name": "www-ssl", "disabled": "true"},
            ],
        }.get(words[0], [])
        return SimpleNamespace(re=[SimpleNamespace(map=row) for row in rows])


def request(settings: BasicNetworkConfiguration) -> BasicNetworkPreviewRequest:
    return BasicNetworkPreviewRequest(
        connection=MikroTikConnection(
            host="192.168.88.1",
            username="orion",
            password="field-secret",
        ),
        configuration=settings,
    )


def apply_request(settings: BasicNetworkConfiguration) -> BasicNetworkApplyRequest:
    preview_request = request(settings)
    return BasicNetworkApplyRequest(
        connection=preview_request.connection,
        configuration=settings,
        confirmation="APLICAR",
    )


def test_preview_basic_network_without_mutating_router(monkeypatch) -> None:
    client = NetworkClient()
    commands = []

    def operation(_connection, callback):
        original_run = client.run

        def tracked_run(*words):
            commands.append(words)
            return original_run(*words)

        client.run = tracked_run
        return callback(client)

    monkeypatch.setattr(service, "_with_connection", operation)

    result = service.preview_basic_network(request(configuration()))

    assert str(result.reconnect_ip) == "192.168.50.1"
    assert any(change.field == "Endereçamento" for change in result.changes)
    assert any(change.field == "NAT" for change in result.changes)
    assert any(change.field == "Telnet" for change in result.changes)
    assert all(command[0].endswith("/print") for command in commands)


def test_current_network_state_maps_router_values_into_editable_fields(monkeypatch) -> None:
    class CurrentNetworkClient(NetworkClient):
        def run(self, *words):
            rows = {
                "/interface/bridge/print": [
                    {"name": "bridge", "disabled": "false"},
                ],
                "/interface/bridge/port/print": [
                    {"bridge": "bridge", "interface": "ether2", "disabled": "false"},
                    {"bridge": "bridge", "interface": "ether3", "disabled": "false"},
                ],
                "/ip/address/print": [
                    {"address": "100.64.0.2/24", "interface": "ether1", "dynamic": "true"},
                    {"address": "192.168.88.1/24", "interface": "bridge", "dynamic": "false"},
                ],
                "/ip/route/print": [
                    {
                        "dst-address": "0.0.0.0/0",
                        "gateway": "100.64.0.1",
                        "immediate-gw": "100.64.0.1%ether1",
                        "dynamic": "true",
                    },
                ],
                "/ip/dhcp-client/print": [
                    {"interface": "ether1", "disabled": "false"},
                ],
                "/ip/dns/print": [{"servers": "1.1.1.1,8.8.8.8"}],
                "/ip/firewall/nat/print": [
                    {"action": "masquerade", "out-interface": "ether1", "disabled": "false"},
                ],
                "/ip/dhcp-server/print": [
                    {"name": "dhcp-lan", "interface": "bridge", "address-pool": "pool-lan", "disabled": "false"},
                ],
                "/ip/pool/print": [
                    {"name": "pool-lan", "ranges": "192.168.88.20-192.168.88.250"},
                ],
            }.get(words[0])
            if rows is not None:
                return SimpleNamespace(re=[SimpleNamespace(map=row) for row in rows])
            return super().run(*words)

    monkeypatch.setattr(
        service,
        "_with_connection",
        lambda _connection, callback: callback(CurrentNetworkClient()),
    )
    state = service.read_basic_network_state(
        MikroTikConnection(
            host="192.168.88.1",
            username="orion",
            password="field-secret",
        )
    )

    assert state.wan_interface == "ether1"
    assert state.wan_mode == "dhcp"
    assert state.configure_lan is True
    assert state.lan_bridge == "bridge"
    assert state.lan_address == "192.168.88.1/24"
    assert state.lan_ports == ["ether2", "ether3"]
    assert state.dns_servers == ["1.1.1.1", "8.8.8.8"]
    assert state.enable_nat is True
    assert state.enable_lan_dhcp is True
    assert state.dhcp_pool_start == "192.168.88.20"
    assert state.dhcp_pool_end == "192.168.88.250"
    assert state.enable_winbox is True
    assert state.enable_telnet is True


def test_wifi_station_with_fixed_ip_is_detected_as_static_wan(monkeypatch) -> None:
    class WifiWanClient(NetworkClient):
        def run(self, *words):
            rows = {
                "/interface/print": [
                    {"name": "ether1", "type": "ether"},
                    {"name": "ether2", "type": "ether"},
                    {"name": "wifi1", "type": "wifi", "running": "true"},
                ],
                "/ip/address/print": [
                    {"address": "10.10.1.229/24", "interface": "wifi1", "dynamic": "false"},
                ],
                "/ip/route/print": [
                    {
                        "dst-address": "0.0.0.0/0",
                        "gateway": "10.10.1.1",
                        "immediate-gw": "10.10.1.1%wifi1",
                    },
                ],
                "/ip/dhcp-client/print": [],
            }.get(words[0])
            if rows is not None:
                return SimpleNamespace(re=[SimpleNamespace(map=row) for row in rows])
            return super().run(*words)

    client = WifiWanClient()
    monkeypatch.setattr(
        service,
        "_with_connection",
        lambda _connection, callback: callback(client),
    )

    state = service.read_basic_network_state(request(configuration()).connection)
    assert state.wan_interface == "wifi1"
    assert state.wan_mode == "static"
    assert state.wan_address == "10.10.1.229/24"
    assert state.gateway == "10.10.1.1"

    selected = configuration(
        wan_interface="wifi1",
        wan_mode="static",
        wan_address="10.10.1.229/24",
        gateway="10.10.1.1",
        configure_lan=False,
        lan_bridge=None,
        lan_address=None,
        lan_ports=[],
        enable_nat=False,
        enable_lan_dhcp=False,
    )
    preview = service.preview_basic_network(request(selected))
    assert not any(
        change.area == "WAN" and change.field == "Endereçamento"
        for change in preview.changes
    )


def test_static_wan_requires_address_and_gateway() -> None:
    with pytest.raises(ValidationError):
        configuration(wan_mode="static")


def test_wan_and_lan_cannot_overlap() -> None:
    with pytest.raises(ValidationError):
        configuration(
            wan_mode="static",
            wan_address="192.168.50.2/24",
            gateway="192.168.50.254",
        )


def test_wan_cannot_be_a_lan_port() -> None:
    with pytest.raises(ValidationError):
        configuration(lan_ports=["ether1", "ether2"])


def test_lan_can_be_omitted() -> None:
    settings = configuration(
        configure_lan=False,
        lan_bridge=None,
        lan_address=None,
        lan_ports=[],
        enable_nat=False,
        enable_lan_dhcp=False,
    )

    assert settings.configure_lan is False
    assert settings.lan_address is None


def test_lan_resources_cannot_be_enabled_without_lan() -> None:
    with pytest.raises(ValidationError, match="NAT e DHCP"):
        configuration(
            configure_lan=False,
            lan_bridge=None,
            lan_address=None,
            lan_ports=[],
            enable_lan_dhcp=False,
        )


def test_preview_rejects_missing_interface(monkeypatch) -> None:
    monkeypatch.setattr(
        service,
        "_with_connection",
        lambda _connection, callback: callback(NetworkClient()),
    )

    with pytest.raises(service.ConfigurationConflictError):
        service.preview_basic_network(
            request(configuration(lan_ports=["ether9"]))
        )


def test_preview_rejects_disabled_interface(monkeypatch) -> None:
    class DisabledInterfaceClient(NetworkClient):
        def run(self, *words):
            if words[0] == "/interface/ethernet/print":
                rows = [
                    {"name": "ether1"},
                    {"name": "ether2", "disabled": "true"},
                    {"name": "ether3"},
                ]
                return SimpleNamespace(
                    re=[SimpleNamespace(map=row) for row in rows]
                )
            return super().run(*words)

    monkeypatch.setattr(
        service,
        "_with_connection",
        lambda _connection, callback: callback(DisabledInterfaceClient()),
    )

    with pytest.raises(service.ConfigurationConflictError, match="Ative as interfaces"):
        service.preview_basic_network(request(configuration()))


def test_preview_rejects_bridge_name_equal_to_physical_interface(monkeypatch) -> None:
    monkeypatch.setattr(
        service,
        "_with_connection",
        lambda _connection, callback: callback(NetworkClient()),
    )

    with pytest.raises(service.ConfigurationConflictError, match="interface física"):
        service.preview_basic_network(
            request(configuration(lan_bridge="ether1"))
        )


def test_preview_warns_before_moving_port_from_another_bridge(monkeypatch) -> None:
    class ExistingBridgePortClient(NetworkClient):
        def run(self, *words):
            if words[0] == "/interface/bridge/port/print":
                rows = [{"interface": "ether2", "bridge": "bridge-antiga"}]
                return SimpleNamespace(
                    re=[SimpleNamespace(map=row) for row in rows]
                )
            return super().run(*words)

    monkeypatch.setattr(
        service,
        "_with_connection",
        lambda _connection, callback: callback(ExistingBridgePortClient()),
    )

    result = service.preview_basic_network(request(configuration()))

    assert any("ether2" in warning for warning in result.warnings)


def test_apply_creates_backup_and_moves_lan_ports_last(monkeypatch) -> None:
    client = NetworkClient()
    commands = []
    original_run = client.run

    def tracked_run(*words):
        commands.append(words)
        return original_run(*words)

    client.run = tracked_run
    monkeypatch.setattr(
        service,
        "_with_connection",
        lambda _connection, callback: callback(client),
    )

    result = service.apply_basic_network(apply_request(configuration()))

    mutations = [
        command
        for command in commands
        if command[0].endswith(("/set", "/add", "/save"))
    ]
    assert mutations[0][0] == "/system/backup/save"
    assert mutations[-1][0] == "/interface/bridge/port/add"
    assert any(command[0] == "/ip/dhcp-client/add" for command in mutations)
    assert any(command[0] == "/ip/firewall/nat/add" for command in mutations)
    assert any(
        command[0] == "/ip/pool/add" and "=ranges=192.168.50.100-192.168.50.199" in command
        for command in mutations
    )
    assert any(command[0] == "/ip/dhcp-server/add" for command in mutations)
    disabled_services = [
        command
        for command in mutations
        if command[0] == "/ip/service/set" and "=disabled=yes" in command
    ]
    assert {command[1] for command in disabled_services} == {"=.id=*1", "=.id=*3"}
    assert not any("=.id=*4" in command or "=.id=*5" in command for command in commands)
    assert not any(command[0].endswith("/remove") for command in commands)
    assert result.backup_file.endswith(".backup")
    assert str(result.reconnect_ip) == "192.168.50.1"


def test_apply_without_lan_preserves_lan_configuration(monkeypatch) -> None:
    client = NetworkClient()
    commands = []
    original_run = client.run

    def tracked_run(*words):
        commands.append(words)
        return original_run(*words)

    client.run = tracked_run
    monkeypatch.setattr(
        service,
        "_with_connection",
        lambda _connection, callback: callback(client),
    )
    settings = configuration(
        configure_lan=False,
        lan_bridge=None,
        lan_address=None,
        lan_ports=[],
        enable_nat=False,
        enable_lan_dhcp=False,
    )

    preview = service.preview_basic_network(request(settings))
    result = service.apply_basic_network(apply_request(settings))

    assert str(preview.reconnect_ip) == "192.168.88.1"
    assert not any(change.area == "LAN" for change in preview.changes)
    assert any("preservados" in warning for warning in preview.warnings)
    assert str(result.reconnect_ip) == "192.168.88.1"
    assert not any(command[0].startswith("/interface/bridge") and command[0].endswith(("/add", "/set")) for command in commands)
    assert not any("=comment=ORION Field - LAN" in command for command in commands)
    assert not any(command[0].startswith("/ip/dhcp-server") and command[0].endswith(("/add", "/set")) for command in commands)
    assert not any(command[0].startswith("/ip/firewall/nat") and command[0].endswith(("/add", "/set")) for command in commands)


def test_apply_static_wan_adds_address_and_gateway(monkeypatch) -> None:
    client = NetworkClient()
    commands = []
    original_run = client.run

    def tracked_run(*words):
        commands.append(words)
        return original_run(*words)

    client.run = tracked_run
    monkeypatch.setattr(
        service,
        "_with_connection",
        lambda _connection, callback: callback(client),
    )
    settings = configuration(
        wan_mode="static",
        wan_address="172.16.0.2/24",
        gateway="172.16.0.1",
    )

    service.apply_basic_network(apply_request(settings))

    assert any(
        command[0] == "/ip/address/add" and "=comment=ORION Field - WAN" in command
        for command in commands
    )
    assert any(
        command[0] == "/ip/route/add" and "=gateway=172.16.0.1" in command
        for command in commands
    )


def test_small_lan_pool_avoids_router_address() -> None:
    assert (
        service._dhcp_pool_range(
            configuration(lan_address="192.168.50.1/29").lan_address
        )
        == "192.168.50.2-192.168.50.6"
    )


def test_custom_dhcp_pool_must_belong_to_lan() -> None:
    with pytest.raises(ValidationError, match="rede LAN"):
        configuration(
            dhcp_pool_start="10.0.0.100",
            dhcp_pool_end="10.0.0.199",
        )


def test_apply_uses_custom_dhcp_pool(monkeypatch) -> None:
    client = NetworkClient()
    commands = []
    original_run = client.run

    def tracked_run(*words):
        commands.append(words)
        return original_run(*words)

    client.run = tracked_run
    monkeypatch.setattr(
        service,
        "_with_connection",
        lambda _connection, callback: callback(client),
    )

    settings = configuration(
        dhcp_pool_start="192.168.50.20",
        dhcp_pool_end="192.168.50.80",
    )
    service.apply_basic_network(apply_request(settings))

    assert any(
        command[0] == "/ip/pool/add"
        and "=ranges=192.168.50.20-192.168.50.80" in command
        for command in commands
    )


def test_apply_can_enable_selected_access_service(monkeypatch) -> None:
    client = NetworkClient()
    commands = []
    original_run = client.run

    def tracked_run(*words):
        commands.append(words)
        return original_run(*words)

    client.run = tracked_run
    monkeypatch.setattr(
        service,
        "_with_connection",
        lambda _connection, callback: callback(client),
    )

    service.apply_basic_network(apply_request(configuration(enable_ftp=True)))

    assert any(
        command[0] == "/ip/service/set"
        and "=.id=*2" in command
        and "=disabled=no" in command
        for command in commands
    )
