from ipaddress import IPv4Address, IPv4Interface
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.mikrotik import MikroTikConnection


class LinkConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["ap", "station"]
    identity: str = Field(min_length=1, max_length=64)
    wifi_interface: str = Field(min_length=1, max_length=64)
    ethernet_interface: str = Field(min_length=1, max_length=64)
    bridge_name: str = Field(default="bridge-field", min_length=1, max_length=64)
    ssid: str = Field(min_length=1, max_length=32)
    passphrase: str = Field(min_length=8, max_length=63)
    frequency_mhz: int = Field(ge=4900, le=6100)
    channel_width: Literal["20mhz", "20/40mhz"] = "20mhz"
    management_ip: IPv4Interface
    gateway: IPv4Address | None = None

    @model_validator(mode="after")
    def validate_network(self):
        network = self.management_ip.network

        if self.management_ip.ip in {network.network_address, network.broadcast_address}:
            raise ValueError("O IP de gerenciamento não pode ser rede ou broadcast.")
        if self.gateway is not None and self.gateway not in network:
            raise ValueError("O gateway deve pertencer à rede do IP de gerenciamento.")
        return self


class ConfigurationPreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    connection: MikroTikConnection
    configuration: LinkConfiguration


class ConfigurationApplyRequest(ConfigurationPreviewRequest):
    confirmation: Literal["APLICAR"]


class ConfigurationChange(BaseModel):
    area: str
    field: str
    current_value: str | None
    new_value: str
    sensitive: bool = False


class ConfigurationPreview(BaseModel):
    device_identity: str
    wifi_stack: Literal["wifi", "wifiwave2", "wireless"]
    changes: list[ConfigurationChange]
    warnings: list[str]
    reconnect_ip: IPv4Address


class ConfigurationApplyResult(BaseModel):
    status: Literal["applied"]
    backup_file: str
    reconnect_ip: IPv4Address
    changes_applied: int
    summary: str


class BasicNetworkConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    identity: str = Field(min_length=1, max_length=64)
    wan_interface: str = Field(min_length=1, max_length=64)
    wan_mode: Literal["dhcp", "static"] = "dhcp"
    wan_address: IPv4Interface | None = None
    gateway: IPv4Address | None = None
    lan_bridge: str = Field(default="bridge-lan", min_length=1, max_length=64)
    lan_address: IPv4Interface
    lan_ports: list[str] = Field(min_length=1)
    dns_servers: list[IPv4Address] = Field(min_length=1, max_length=3)
    enable_nat: bool = True
    enable_lan_dhcp: bool = True

    @model_validator(mode="after")
    def validate_basic_network(self):
        if len(set(self.lan_ports)) != len(self.lan_ports):
            raise ValueError("As portas LAN não podem ser repetidas.")
        if self.wan_interface in self.lan_ports:
            raise ValueError("A interface WAN não pode também ser uma porta LAN.")

        lan_network = self.lan_address.network
        if self.lan_address.ip in {
            lan_network.network_address,
            lan_network.broadcast_address,
        }:
            raise ValueError("O IP da LAN não pode ser rede ou broadcast.")

        if self.wan_mode == "dhcp":
            if self.wan_address is not None or self.gateway is not None:
                raise ValueError("WAN por DHCP não utiliza IP ou gateway fixos.")
            return self

        if self.wan_address is None or self.gateway is None:
            raise ValueError("WAN com IP fixo exige endereço e gateway.")
        wan_network = self.wan_address.network
        if self.wan_address.ip in {
            wan_network.network_address,
            wan_network.broadcast_address,
        }:
            raise ValueError("O IP da WAN não pode ser rede ou broadcast.")
        if self.gateway not in wan_network:
            raise ValueError("O gateway deve pertencer à rede da WAN.")
        if wan_network.overlaps(lan_network):
            raise ValueError("As redes WAN e LAN não podem se sobrepor.")
        return self


class BasicNetworkPreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    connection: MikroTikConnection
    configuration: BasicNetworkConfiguration


class BasicNetworkApplyRequest(BasicNetworkPreviewRequest):
    confirmation: Literal["APLICAR"]


class BasicNetworkPreview(BaseModel):
    device_identity: str
    changes: list[ConfigurationChange]
    warnings: list[str]
    reconnect_ip: IPv4Address


class BasicNetworkApplyResult(BaseModel):
    status: Literal["applied"]
    backup_file: str
    reconnect_ip: IPv4Address
    changes_applied: int
    summary: str
