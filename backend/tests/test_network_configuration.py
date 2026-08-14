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
            "/interface/bridge/print": [],
            "/interface/bridge/port/print": [],
            "/ip/address/print": [{"address": "10.0.0.2/24", "interface": "ether1"}],
            "/ip/route/print": [{"dst-address": "0.0.0.0/0", "gateway": "10.0.0.1"}],
            "/ip/dhcp-client/print": [],
            "/ip/dns/print": [{"servers": "9.9.9.9"}],
            "/ip/firewall/nat/print": [],
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
    assert all(command[0].endswith("/print") for command in commands)


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
    assert not any(command[0].endswith("/remove") for command in commands)
    assert result.backup_file.endswith(".backup")
    assert str(result.reconnect_ip) == "192.168.50.1"


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
