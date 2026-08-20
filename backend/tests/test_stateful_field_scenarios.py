from copy import deepcopy

import pytest

from app.models.configuration import (
    BasicNetworkApplyRequest,
    BasicNetworkConfiguration,
    BasicNetworkPreviewRequest,
    ConfigurationApplyRequest,
    LinkConfiguration,
    LoraProtectionApplyRequest,
    LoraProtectionConfiguration,
    LoraProtectionPreviewRequest,
)
from app.models.mikrotik import MikroTikConnection
from app.services import configuration as wifi_service
from app.services import lora_configuration as lora_service
from app.services import network_configuration as network_service
from app.services import routeros as routeros_service
from app.services.configuration import ConfigurationConflictError
from tests.support.stateful_router import (
    ethernet_router,
    factory_router,
    lora_router,
    radio_router,
    wifi_station_router,
)


def connection(host: str = "10.88.99.1") -> MikroTikConnection:
    return MikroTikConnection(
        host=host,
        username="orion-lab",
        password="lab-password",
    )


def network_settings(**updates) -> BasicNetworkConfiguration:
    values = {
        "identity": "RB-LAB",
        "wan_interface": "ether5",
        "wan_mode": "dhcp",
        "wan_address": None,
        "gateway": None,
        "configure_lan": True,
        "lan_bridge": "bridge-lan",
        "lan_address": "192.168.77.1/24",
        "lan_ports": ["ether1", "ether2", "ether3", "ether4"],
        "dns_servers": ["1.1.1.1", "8.8.8.8"],
        "enable_nat": True,
        "enable_lan_dhcp": True,
        "dhcp_pool_start": "192.168.77.20",
        "dhcp_pool_end": "192.168.77.180",
        "enable_ssh": True,
        "enable_winbox": True,
        "enable_webfig_https": False,
        "enable_telnet": False,
        "enable_ftp": False,
        "enable_webfig_http": False,
    }
    values.update(updates)
    return BasicNetworkConfiguration(**values)


def test_distinct_simulated_devices_are_read_through_the_real_discovery_flow() -> None:
    generic = routeros_service._read_device_summary(wifi_station_router())
    radio = routeros_service._read_device_summary(radio_router())
    lora = routeros_service._read_device_summary(lora_router())

    assert generic.identity == "RB-WIFI-UPLINK"
    assert generic.radio_device is False
    assert generic.wifi_interfaces[0].mode == "station"
    assert generic.ip_addresses[0].interface == "wifi1"
    assert len(generic.ethernet_interfaces) == 5

    assert radio.identity == "LHG-LAB"
    assert radio.radio_device is True
    assert len(radio.ethernet_interfaces) == 1

    assert lora.identity == "KNOT-LORA-LAB"
    assert lora.lora_available is True


def test_first_time_technician_can_prepare_a_factory_router_and_then_preserve_it(
    monkeypatch,
) -> None:
    router = factory_router()
    monkeypatch.setattr(
        network_service,
        "_with_connection",
        lambda _connection, operation: operation(router),
    )

    initial = network_service.read_basic_network_state(connection("192.168.30.1"))
    assert initial.identity == "MikroTik"
    assert initial.wan_interface == "ether1"
    assert initial.wan_mode == "dhcp"
    assert initial.configure_lan is False
    assert initial.lan_ports == []

    guided = network_settings(
        identity="CLIENTE-ROTEADOR",
        wan_interface="ether1",
        lan_address="192.168.30.1/24",
        lan_ports=["ether2", "ether3", "ether4", "ether5"],
        dns_servers=["1.1.1.1", "8.8.8.8"],
        dhcp_pool_start=None,
        dhcp_pool_end=None,
    )
    preview = network_service.preview_basic_network(
        BasicNetworkPreviewRequest(connection=connection("192.168.30.1"), configuration=guided)
    )
    assert any(change.area == "LAN" and change.field == "Bridge" for change in preview.changes)
    assert any(change.area == "WAN" and change.field == "Endereçamento" for change in preview.changes)

    applied = network_service.apply_basic_network(BasicNetworkApplyRequest(
        connection=connection("192.168.30.1"),
        configuration=guided,
        confirmation="APLICAR",
    ))
    assert str(applied.reconnect_ip) == "192.168.30.1"
    assert len(router.backups) == 1

    configured = network_service.read_basic_network_state(connection("192.168.30.1"))
    assert configured.identity == "CLIENTE-ROTEADOR"
    assert configured.configure_lan is True
    assert configured.lan_bridge == "bridge-lan"
    assert configured.lan_ports == ["ether2", "ether3", "ether4", "ether5"]
    assert configured.enable_nat is True
    assert configured.enable_lan_dhcp is True

    topology_menus = (
        "/interface/bridge/print",
        "/interface/bridge/port/print",
        "/ip/address/print",
        "/ip/dhcp-server/print",
        "/ip/firewall/nat/print",
    )
    before_adjustment = router.snapshot(*topology_menus)
    services_only = guided.model_copy(update={
        "identity": "CLIENTE-ROTEADOR-AJUSTADO",
        "configure_lan": False,
        "lan_bridge": None,
        "lan_address": None,
        "lan_ports": [],
        "enable_nat": False,
        "enable_lan_dhcp": False,
        "dhcp_pool_start": None,
        "dhcp_pool_end": None,
        "enable_ssh": False,
    })
    network_service.apply_basic_network(BasicNetworkApplyRequest(
        connection=connection("192.168.30.1"),
        configuration=services_only,
        confirmation="APLICAR",
    ))
    assert router.snapshot(*topology_menus) == before_adjustment
    assert router.rows("/system/identity/print")[0]["name"] == "CLIENTE-ROTEADOR-AJUSTADO"
    assert next(row for row in router.rows("/ip/service/print") if row["name"] == "ssh")["disabled"] == "yes"


def test_wifi_uplink_round_trip_preserves_network_and_persists_service_toggles(
    monkeypatch,
) -> None:
    router = wifi_station_router()
    monkeypatch.setattr(
        network_service,
        "_with_connection",
        lambda _connection, operation: operation(router),
    )
    before_topology = router.snapshot(
        "/interface/bridge/print",
        "/interface/bridge/port/print",
        "/ip/address/print",
        "/ip/route/print",
        "/ip/dhcp-server/print",
        "/ip/firewall/nat/print",
    )

    current = network_service.read_basic_network_state(connection())
    assert current.wan_interface == "wifi1"
    assert current.wan_mode == "static"
    assert current.wan_address == "10.88.99.1/24"
    assert current.gateway == "10.88.99.254"

    first = network_settings(
        identity=current.identity,
        wan_interface="wifi1",
        wan_mode="static",
        wan_address="10.88.99.1/24",
        gateway="10.88.99.254",
        configure_lan=False,
        lan_bridge=None,
        lan_address=None,
        lan_ports=[],
        enable_nat=False,
        enable_lan_dhcp=False,
        dhcp_pool_start=None,
        dhcp_pool_end=None,
        enable_ftp=True,
        enable_webfig_https=True,
    )
    preview = network_service.preview_basic_network(
        BasicNetworkPreviewRequest(connection=connection(), configuration=first)
    )
    assert not any(change.area == "WAN" for change in preview.changes)

    result = network_service.apply_basic_network(BasicNetworkApplyRequest(
        connection=connection(),
        configuration=first,
        confirmation="APLICAR",
    ))
    assert str(result.reconnect_ip) == "10.88.99.1"
    after_first = network_service.read_basic_network_state(connection())
    assert after_first.enable_ftp is True
    assert after_first.enable_webfig_https is True
    assert router.snapshot(*before_topology.keys()) == before_topology

    second = first.model_copy(update={
        "enable_ftp": False,
        "enable_webfig_https": False,
        "enable_telnet": True,
    })
    network_service.apply_basic_network(BasicNetworkApplyRequest(
        connection=connection(),
        configuration=second,
        confirmation="APLICAR",
    ))
    after_second = network_service.read_basic_network_state(connection())
    assert after_second.enable_ftp is False
    assert after_second.enable_webfig_https is False
    assert after_second.enable_telnet is True
    assert len(router.backups) == 2


def test_five_port_router_persists_lan_nat_dhcp_pool_and_multiple_ports(
    monkeypatch,
) -> None:
    router = ethernet_router()
    monkeypatch.setattr(
        network_service,
        "_with_connection",
        lambda _connection, operation: operation(router),
    )
    settings = network_settings()

    preview = network_service.preview_basic_network(
        BasicNetworkPreviewRequest(connection=connection(), configuration=settings)
    )
    assert any(change.field == "Pool DHCP" for change in preview.changes)
    network_service.apply_basic_network(BasicNetworkApplyRequest(
        connection=connection(),
        configuration=settings,
        confirmation="APLICAR",
    ))

    saved = network_service.read_basic_network_state(connection())
    assert saved.wan_interface == "ether5"
    assert saved.wan_mode == "dhcp"
    assert saved.lan_bridge == "bridge-lan"
    assert saved.lan_address == "192.168.77.1/24"
    assert saved.lan_ports == ["ether1", "ether2", "ether3", "ether4"]
    assert saved.enable_nat is True
    assert saved.enable_lan_dhcp is True
    assert saved.dhcp_pool_start == "192.168.77.20"
    assert saved.dhcp_pool_end == "192.168.77.180"

    disabled = settings.model_copy(update={
        "enable_nat": False,
        "enable_lan_dhcp": False,
        "dhcp_pool_start": None,
        "dhcp_pool_end": None,
    })
    network_service.apply_basic_network(BasicNetworkApplyRequest(
        connection=connection(),
        configuration=disabled,
        confirmation="APLICAR",
    ))
    saved_disabled = network_service.read_basic_network_state(connection())
    assert saved_disabled.enable_nat is False
    assert saved_disabled.enable_lan_dhcp is False
    assert router.rows("/ip/service/print")[4]["disabled"] == "no"
    assert router.rows("/ip/service/print")[7]["disabled"] == "yes"


def test_generic_wifi_apply_changes_wifi_but_not_network_topology(monkeypatch) -> None:
    router = wifi_station_router()
    monkeypatch.setattr(
        wifi_service,
        "_with_connection",
        lambda _connection, operation: operation(router),
    )
    topology_menus = (
        "/interface/bridge/print",
        "/interface/bridge/port/print",
        "/ip/address/print",
        "/ip/route/print",
        "/ip/dhcp-client/print",
        "/ip/firewall/nat/print",
    )
    before = router.snapshot(*topology_menus)
    settings = LinkConfiguration(
        role="station",
        device_kind="generic",
        manage_topology=False,
        identity="RB-WIFI-UPDATED",
        wifi_interface="wifi1",
        bridge_interfaces=[],
        bridge_name="bridge-lan",
        ssid="REDE-PRINCIPAL-2",
        passphrase="senha-segura-lab",
        frequency_mhz=2462,
        channel_width="20mhz",
        management_ip="192.168.88.2/24",
        gateway="10.88.99.254",
    )

    result = wifi_service.apply_link_configuration(ConfigurationApplyRequest(
        connection=connection(),
        configuration=settings,
        confirmation="APLICAR",
    ))

    saved_wifi = router.rows("/interface/wifi/print")[0]
    assert saved_wifi["configuration.mode"] == "station"
    assert saved_wifi["configuration.ssid"] == "REDE-PRINCIPAL-2"
    assert saved_wifi["channel.frequency"] == "2462"
    assert router.snapshot(*topology_menus) == before
    assert str(result.reconnect_ip) == "10.88.99.1"
    assert len(router.backups) == 1


def test_generic_router_can_explicitly_add_several_ports_without_moving_existing_ip(
    monkeypatch,
) -> None:
    router = wifi_station_router()
    monkeypatch.setattr(
        wifi_service,
        "_with_connection",
        lambda _connection, operation: operation(router),
    )
    original_address = deepcopy(router.rows("/ip/address/print")[0])
    settings = LinkConfiguration(
        role="station",
        device_kind="generic",
        manage_topology=True,
        identity="RB-BRIDGE-EXPLICIT",
        wifi_interface="wifi1",
        bridge_interfaces=["ether1", "ether2", "ether3", "ether4"],
        bridge_name="bridge-lan",
        ssid="REDE-PRINCIPAL",
        passphrase="senha-segura-lab",
        frequency_mhz=2437,
        channel_width="20mhz",
        management_ip="10.88.99.1/24",
        gateway="10.88.99.254",
    )

    wifi_service.apply_link_configuration(ConfigurationApplyRequest(
        connection=connection(),
        configuration=settings,
        confirmation="APLICAR",
    ))

    members = {
        row["interface"]
        for row in router.rows("/interface/bridge/port/print")
        if row.get("bridge") == "bridge-lan" and row.get("disabled") != "yes"
    }
    assert members == {"wifi1", "ether1", "ether2", "ether3", "ether4"}
    assert router.rows("/ip/address/print")[0] == original_address


def test_radio_and_lora_profiles_persist_enable_and_disable_cycles(monkeypatch) -> None:
    radio = radio_router()
    monkeypatch.setattr(
        wifi_service,
        "_with_connection",
        lambda _connection, operation: operation(radio),
    )
    radio_settings = LinkConfiguration(
        role="station",
        device_kind="radio",
        manage_topology=True,
        identity="LHG-STATION-LAB",
        wifi_interface="wifi1",
        bridge_interfaces=["ether1"],
        bridge_name="bridge-lan",
        ssid="ENLACE-LAB",
        passphrase="enlace-seguro-lab",
        frequency_mhz=5805,
        channel_width="20mhz",
        management_ip="192.168.50.2/24",
        gateway=None,
    )
    wifi_service.apply_link_configuration(ConfigurationApplyRequest(
        connection=connection(),
        configuration=radio_settings,
        confirmation="APLICAR",
    ))
    assert radio.rows("/interface/wifi/print")[0]["configuration.mode"] == "station-bridge"
    assert radio.rows("/interface/wifi/print")[0]["configuration.ssid"] == "ENLACE-LAB"

    lora = lora_router()
    monkeypatch.setattr(
        lora_service,
        "_with_connection",
        lambda _connection, operation: operation(lora),
    )
    enabled = LoraProtectionConfiguration(
        enable_lns_watchdog=True,
        enable_lora_guard=True,
        enable_device_reboot=True,
        ping_target="1.1.1.1",
        failure_threshold=4,
        lora_interval="10m",
        connectivity_interval="5m",
    )
    lora_service.apply_lora_protection(LoraProtectionApplyRequest(
        connection=connection(),
        configuration=enabled,
        confirmation="APLICAR",
    ))
    enabled_preview = lora_service.preview_lora_protection(
        LoraProtectionPreviewRequest(connection=connection(), configuration=enabled)
    )
    assert any(item.field == "orion-lora-watchdog" for item in enabled_preview.existing)
    assert all(row.get("disabled") == "no" for row in lora.rows("/system/scheduler/print"))

    disabled = enabled.model_copy(update={
        "enable_lns_watchdog": False,
        "enable_lora_guard": False,
        "enable_device_reboot": False,
    })
    lora_service.apply_lora_protection(LoraProtectionApplyRequest(
        connection=connection(),
        configuration=disabled,
        confirmation="APLICAR",
    ))
    assert all(row.get("disabled") == "yes" for row in lora.rows("/system/scheduler/print"))
    assert len(lora.backups) == 2


def test_interface_disappearing_between_preview_and_apply_is_rejected_before_backup(
    monkeypatch,
) -> None:
    router = ethernet_router()
    monkeypatch.setattr(
        network_service,
        "_with_connection",
        lambda _connection, operation: operation(router),
    )
    settings = network_settings()
    network_service.preview_basic_network(
        BasicNetworkPreviewRequest(connection=connection(), configuration=settings)
    )
    router.remove_interface("ether4")

    with pytest.raises(ConfigurationConflictError, match="ether4"):
        network_service.apply_basic_network(BasicNetworkApplyRequest(
            connection=connection(),
            configuration=settings,
            confirmation="APLICAR",
        ))

    assert router.backups == []


def test_external_connection_drop_during_last_port_move_never_reports_success(
    monkeypatch,
) -> None:
    router = ethernet_router()
    original_run = router.run

    def unstable_run(*words):
        if words[0] in {"/interface/bridge/port/add", "/interface/bridge/port/set"}:
            raise ConnectionResetError("cabo removido durante a aplicação")
        return original_run(*words)

    router.run = unstable_run
    monkeypatch.setattr(
        network_service,
        "_with_connection",
        lambda _connection, operation: operation(router),
    )

    with pytest.raises(ConnectionResetError, match="cabo removido"):
        network_service.apply_basic_network(BasicNetworkApplyRequest(
            connection=connection(),
            configuration=network_settings(),
            confirmation="APLICAR",
        ))

    assert len(router.backups) == 1
    assert router.commands.index(next(command for command in router.commands if command[0] == "/system/backup/save")) < router.commands.index(next(command for command in router.commands if command[0] == "/system/identity/set"))
    assert not any(command[0].startswith("/user") for command in router.commands)
