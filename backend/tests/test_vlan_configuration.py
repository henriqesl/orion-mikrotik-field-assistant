from types import SimpleNamespace

import pytest

from app.models.configuration import VlanApplyRequest, VlanConfiguration, VlanPreviewRequest
from app.models.mikrotik import MikroTikConnection
from app.services import vlan_configuration as service


class Client:
    def __init__(self):
        self.commands = []

    def run(self, *words):
        self.commands.append(words)
        rows = {
            "/system/identity/print": [{"name": "ORION-Router"}],
            "/interface/bridge/print": [{".id": "*b", "name": "bridge-lan", "vlan-filtering": "false"}],
            "/interface/bridge/port/print": [
                {".id": "*1", "interface": "ether2", "bridge": "bridge-lan"},
                {".id": "*2", "interface": "ether3", "bridge": "bridge-lan"},
                {".id": "*3", "interface": "ether4", "bridge": "bridge-lan"},
            ],
            "/interface/vlan/print": [],
            "/interface/bridge/vlan/print": [],
            "/ip/address/print": [],
            "/ip/pool/print": [],
            "/ip/dhcp-server/print": [],
            "/ip/dhcp-server/network/print": [],
        }.get(words[0], [])
        return SimpleNamespace(re=[SimpleNamespace(map=row) for row in rows])


def settings(**updates):
    values = {
        "name": "vlan-120",
        "vlan_id": 120,
        "bridge": "bridge-lan",
        "address": "10.120.0.1/24",
        "tagged_ports": ["ether2"],
        "untagged_ports": ["ether3"],
        "enable_dhcp": True,
        "dns_servers": ["1.1.1.1"],
        "enable_filtering": True,
    }
    values.update(updates)
    return VlanConfiguration(**values)


def connection():
    return MikroTikConnection(host="192.168.88.1", username="orion", password="secret")


def test_preview_is_read_only(monkeypatch):
    client = Client()
    monkeypatch.setattr(service, "_with_connection", lambda _connection, callback: callback(client))
    result = service.preview_vlan(VlanPreviewRequest(connection=connection(), configuration=settings()))
    assert any(change.field == "ID" for change in result.changes)
    assert any("ether4" in warning for warning in result.warnings)
    assert all(command[0].endswith("/print") for command in client.commands)


def test_filtering_requires_recovery_port(monkeypatch):
    client = Client()
    monkeypatch.setattr(service, "_with_connection", lambda _connection, callback: callback(client))
    with pytest.raises(service.ConfigurationConflictError, match="recuperação"):
        service.preview_vlan(VlanPreviewRequest(connection=connection(), configuration=settings(tagged_ports=["ether2", "ether4"])))


def test_apply_creates_backup_and_enables_filtering_last(monkeypatch):
    client = Client()
    monkeypatch.setattr(service, "_with_connection", lambda _connection, callback: callback(client))
    request = VlanApplyRequest(connection=connection(), configuration=settings(), confirmation="APLICAR")
    result = service.apply_vlan(request)
    mutations = [command for command in client.commands if command[0].endswith(("/set", "/add", "/save"))]
    assert mutations[0][0] == "/system/backup/save"
    assert mutations[-1][0] == "/interface/bridge/set"
    assert any(command[0] == "/interface/vlan/add" for command in mutations)
    assert any(command[0] == "/ip/dhcp-server/add" for command in mutations)
    assert not any(command[0].endswith("/remove") for command in client.commands)
    assert result.backup_file.endswith(".backup")
