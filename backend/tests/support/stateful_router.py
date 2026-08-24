from __future__ import annotations

from copy import deepcopy
from types import SimpleNamespace
from typing import Iterable


def _reply(rows: Iterable[dict[str, str]] = ()) -> SimpleNamespace:
    return SimpleNamespace(
        re=[SimpleNamespace(map=deepcopy(row)) for row in rows]
    )


class StatefulRouter:
    """Small in-memory RouterOS command surface with persistent mutations."""

    def __init__(self, tables: dict[str, list[dict[str, str]]]) -> None:
        self.tables = deepcopy(tables)
        self.commands: list[tuple[str, ...]] = []
        self.backups: list[str] = []
        self._next_id = 100

    def __enter__(self):
        return self

    def __exit__(self, *_args) -> None:
        return None

    def rows(self, menu: str) -> list[dict[str, str]]:
        return self.tables.setdefault(menu, [])

    def snapshot(self, *menus: str) -> dict[str, list[dict[str, str]]]:
        return {menu: deepcopy(self.rows(menu)) for menu in menus}

    def remove_interface(self, name: str) -> None:
        for menu in ("/interface/print", "/interface/ethernet/print"):
            self.tables[menu] = [
                row
                for row in self.rows(menu)
                if (row.get("name") or row.get("default-name")) != name
            ]
        self.tables["/interface/bridge/port/print"] = [
            row
            for row in self.rows("/interface/bridge/port/print")
            if row.get("interface") != name
        ]

    @staticmethod
    def _assignments(words: tuple[str, ...]) -> dict[str, str]:
        assignments: dict[str, str] = {}
        for word in words:
            if not word.startswith("=") or "=" not in word[1:]:
                continue
            key, value = word[1:].split("=", 1)
            assignments[key] = value
        return assignments

    @staticmethod
    def _table_for_mutation(command: str) -> str:
        menu, _operation = command.rsplit("/", 1)
        return f"{menu}/print"

    def _new_id(self) -> str:
        record_id = f"*SIM{self._next_id}"
        self._next_id += 1
        return record_id

    def _set(self, command: str, assignments: dict[str, str]) -> None:
        table = self._table_for_mutation(command)
        rows = self.rows(table)
        record_id = assignments.pop(".id", None)
        if record_id is None:
            if not rows:
                rows.append({".id": self._new_id()})
            row = rows[0]
        else:
            row = next((item for item in rows if item.get(".id") == record_id), None)
            if row is None:
                raise AssertionError(f"Registro {record_id} não existe em {table}.")
        row.update(assignments)

    def _add(self, command: str, assignments: dict[str, str]) -> None:
        table = self._table_for_mutation(command)
        row = {".id": self._new_id(), **assignments}
        self.rows(table).append(row)
        if command == "/interface/bridge/add":
            self.rows("/interface/print").append({
                ".id": row[".id"],
                "name": row.get("name", "bridge"),
                "type": "bridge",
                "disabled": row.get("disabled", "no"),
                "running": "true",
            })

    def run(self, *words: str) -> SimpleNamespace:
        if not words:
            raise AssertionError("Comando RouterOS vazio.")
        self.commands.append(tuple(words))
        command = words[0]

        if command.endswith("/print"):
            return _reply(self.rows(command))

        assignments = self._assignments(tuple(words[1:]))
        if command == "/system/backup/save":
            name = assignments.get("name")
            if not name:
                raise AssertionError("Backup sem nome.")
            self.backups.append(name)
            return _reply()
        if command.endswith("/set"):
            self._set(command, assignments)
            return _reply()
        if command.endswith("/add"):
            self._add(command, assignments)
            return _reply()

        raise AssertionError(f"Comando não implementado no simulador: {words!r}")


def _services() -> list[dict[str, str]]:
    return [
        {".id": "*S1", "name": "telnet", "port": "23", "disabled": "yes"},
        {".id": "*S2", "name": "ftp", "port": "21", "disabled": "yes"},
        {".id": "*S3", "name": "www", "port": "80", "disabled": "yes"},
        {".id": "*S4", "name": "ssh", "port": "22", "disabled": "no"},
        {".id": "*S5", "name": "api", "port": "8728", "disabled": "no"},
        {".id": "*S6", "name": "winbox", "port": "8291", "disabled": "no"},
        {".id": "*S7", "name": "www-ssl", "port": "443", "disabled": "yes"},
        {".id": "*S8", "name": "api-ssl", "port": "8729", "disabled": "yes"},
    ]


def wifi_station_router() -> StatefulRouter:
    ethernet = [
        {
            ".id": f"*E{index}",
            "name": f"ether{index}",
            "default-name": f"ether{index}",
            "type": "ether",
            "disabled": "false",
            "running": "true",
        }
        for index in range(1, 6)
    ]
    wifi = {
        ".id": "*W1",
        "name": "wifi1",
        "default-name": "wifi1",
        "type": "wifi",
        "disabled": "false",
        "running": "true",
        "configuration.mode": "station",
        "configuration.ssid": "REDE-PRINCIPAL",
        "channel.frequency": "2437",
        "channel.width": "20mhz",
        "channel.band": "2ghz-ax",
    }
    bridge = {
        ".id": "*B1",
        "name": "bridge-lan",
        "type": "bridge",
        "disabled": "false",
        "running": "true",
        "protocol-mode": "rstp",
    }
    return StatefulRouter({
        "/system/identity/print": [{".id": "*I1", "name": "RB-WIFI-UPLINK"}],
        "/system/resource/print": [{"version": "7.20.8", "board-name": "hAP ax3", "architecture-name": "arm64"}],
        "/system/package/print": [{"name": "routeros"}, {"name": "wifi-qcom"}],
        "/interface/print": [*ethernet, wifi, bridge],
        "/interface/ethernet/print": ethernet,
        "/interface/wifi/print": [wifi],
        "/interface/wifi/registration-table/print": [{
            "interface": "wifi1",
            "mac-address": "02:00:00:00:10:01",
            "ssid": "REDE-PRINCIPAL",
            "authorized": "true",
            "signal": "-61",
            "tx-rate": "600Mbps",
            "rx-rate": "480Mbps",
        }],
        "/interface/bridge/print": [bridge],
        "/interface/bridge/port/print": [
            {".id": f"*P{index}", "bridge": "bridge-lan", "interface": f"ether{index}", "disabled": "false"}
            for index in range(1, 5)
        ],
        "/ip/address/print": [
            {".id": "*A1", "address": "10.88.99.1/24", "network": "10.88.99.0", "interface": "wifi1", "actual-interface": "wifi1", "dynamic": "false", "disabled": "false"},
            {".id": "*A2", "address": "192.168.88.1/24", "network": "192.168.88.0", "interface": "bridge-lan", "actual-interface": "bridge-lan", "dynamic": "false", "disabled": "false"},
        ],
        "/ip/route/print": [{".id": "*R1", "dst-address": "0.0.0.0/0", "gateway": "10.88.99.254", "immediate-gw": "10.88.99.254%wifi1", "active": "true", "disabled": "false"}],
        "/ip/dhcp-client/print": [],
        "/ip/dns/print": [{".id": "*D1", "servers": "1.1.1.1,8.8.8.8", "allow-remote-requests": "yes"}],
        "/ip/firewall/nat/print": [{".id": "*N1", "chain": "srcnat", "action": "masquerade", "out-interface": "wifi1", "disabled": "false"}],
        "/ip/pool/print": [{".id": "*PL1", "name": "pool-lan", "ranges": "192.168.88.20-192.168.88.200"}],
        "/ip/dhcp-server/print": [{".id": "*DH1", "name": "dhcp-lan", "interface": "bridge-lan", "address-pool": "pool-lan", "disabled": "false"}],
        "/ip/dhcp-server/network/print": [{".id": "*DN1", "address": "192.168.88.0/24", "gateway": "192.168.88.1"}],
        "/ip/service/print": _services(),
        "/iot/lora/print": [],
    })


def ethernet_router() -> StatefulRouter:
    router = wifi_station_router()
    router.rows("/system/identity/print")[0]["name"] = "RB-ETHERNET-WAN"
    router.rows("/interface/wifi/print")[0].update({
        "configuration.mode": "ap",
        "configuration.ssid": "CLIENTES",
    })
    router.tables["/interface/wifi/registration-table/print"] = []
    router.tables["/ip/address/print"] = [
        {".id": "*A1", "address": "100.64.20.10/24", "network": "100.64.20.0", "interface": "ether5", "actual-interface": "ether5", "dynamic": "true", "disabled": "false"},
        {".id": "*A2", "address": "192.168.10.1/24", "network": "192.168.10.0", "interface": "bridge-lan", "actual-interface": "bridge-lan", "dynamic": "false", "disabled": "false"},
    ]
    router.tables["/ip/route/print"] = [{".id": "*R1", "dst-address": "0.0.0.0/0", "gateway": "100.64.20.1", "immediate-gw": "100.64.20.1%ether5", "active": "true", "dynamic": "true", "disabled": "false"}]
    router.tables["/ip/dhcp-client/print"] = [{".id": "*DC1", "interface": "ether5", "disabled": "false"}]
    router.tables["/ip/firewall/nat/print"] = []
    router.tables["/ip/pool/print"] = []
    router.tables["/ip/dhcp-server/print"] = []
    router.tables["/ip/dhcp-server/network/print"] = []
    router.tables["/interface/bridge/port/print"] = [
        {".id": "*P1", "bridge": "bridge-lan", "interface": "ether1", "disabled": "false"},
        {".id": "*P2", "bridge": "bridge-lan", "interface": "ether2", "disabled": "false"},
    ]
    return router


def factory_router() -> StatefulRouter:
    """RouterBOARD reachable by API but without WAN, LAN, IP or bridge setup."""
    router = wifi_station_router()
    router.rows("/system/identity/print")[0]["name"] = "MikroTik"
    router.rows("/interface/wifi/print")[0].update({
        "configuration.mode": "ap",
        "configuration.ssid": "MikroTik",
    })
    router.tables["/interface/wifi/registration-table/print"] = []
    router.tables["/interface/print"] = [
        row for row in router.rows("/interface/print") if row.get("type") != "bridge"
    ]
    router.tables["/interface/bridge/print"] = []
    router.tables["/interface/bridge/port/print"] = []
    router.tables["/ip/address/print"] = []
    router.tables["/ip/route/print"] = []
    router.tables["/ip/dhcp-client/print"] = []
    router.tables["/ip/dns/print"] = [{".id": "*D1", "servers": "", "allow-remote-requests": "no"}]
    router.tables["/ip/firewall/nat/print"] = []
    router.tables["/ip/pool/print"] = []
    router.tables["/ip/dhcp-server/print"] = []
    router.tables["/ip/dhcp-server/network/print"] = []
    return router


def radio_router() -> StatefulRouter:
    router = wifi_station_router()
    router.rows("/system/identity/print")[0]["name"] = "LHG-LAB"
    router.rows("/system/resource/print")[0]["board-name"] = "LHG 5 ax"
    router.tables["/interface/ethernet/print"] = router.rows("/interface/ethernet/print")[:1]
    router.tables["/interface/print"] = [
        router.rows("/interface/print")[0],
        next(row for row in router.rows("/interface/print") if row.get("name") == "wifi1"),
        next(row for row in router.rows("/interface/print") if row.get("name") == "bridge-lan"),
    ]
    router.tables["/interface/bridge/port/print"] = [
        {".id": "*P1", "bridge": "bridge-lan", "interface": "ether1", "disabled": "false"},
        {".id": "*P2", "bridge": "bridge-lan", "interface": "wifi1", "disabled": "false"},
    ]
    router.tables["/ip/address/print"] = [{".id": "*A1", "address": "192.168.50.2/24", "network": "192.168.50.0", "interface": "bridge-lan", "actual-interface": "bridge-lan", "dynamic": "false", "disabled": "false"}]
    router.tables["/ip/route/print"] = []
    router.tables["/ip/dhcp-client/print"] = []
    return router


def lora_router() -> StatefulRouter:
    router = ethernet_router()
    router.rows("/system/identity/print")[0]["name"] = "KNOT-LORA-LAB"
    router.rows("/system/resource/print")[0]["board-name"] = "KNOT LR8 kit"
    router.tables["/iot/lora/print"] = [{
        ".id": "*L1",
        "name": "lora1",
        "status": "connected",
        "servers": "lns.bionic.local",
        "network": "private",
        "disabled": "false",
    }]
    router.tables["/system/script/print"] = []
    router.tables["/system/scheduler/print"] = []
    return router
