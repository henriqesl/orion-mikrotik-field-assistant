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
    configure_lan: bool = True
    lan_bridge: str | None = Field(default="bridge-lan", min_length=1, max_length=64)
    lan_address: IPv4Interface | None = None
    lan_ports: list[str] = Field(default_factory=list)
    dns_servers: list[IPv4Address] = Field(min_length=1, max_length=3)
    enable_nat: bool = True
    enable_lan_dhcp: bool = True
    dhcp_pool_start: IPv4Address | None = None
    dhcp_pool_end: IPv4Address | None = None
    enable_ssh: bool = True
    enable_winbox: bool = True
    enable_webfig_https: bool = False
    enable_telnet: bool = False
    enable_ftp: bool = False
    enable_webfig_http: bool = False

    @model_validator(mode="after")
    def validate_basic_network(self):
        if not self.configure_lan:
            if self.lan_bridge is not None or self.lan_address is not None or self.lan_ports:
                raise ValueError("A configuração LAN deve ficar vazia quando estiver desativada.")
            if self.enable_nat or self.enable_lan_dhcp:
                raise ValueError("NAT e DHCP não podem ser ativados sem uma rede LAN.")
            if self.dhcp_pool_start is not None or self.dhcp_pool_end is not None:
                raise ValueError("O pool DHCP não pode ser informado sem uma rede LAN.")
        else:
            if self.lan_bridge is None or self.lan_address is None or not self.lan_ports:
                raise ValueError("A rede LAN exige bridge, endereço e pelo menos uma porta.")

        if len(set(self.lan_ports)) != len(self.lan_ports):
            raise ValueError("As portas LAN não podem ser repetidas.")
        if self.wan_interface in self.lan_ports:
            raise ValueError("A interface WAN não pode também ser uma porta LAN.")

        lan_network = self.lan_address.network if self.lan_address else None
        if self.lan_address and self.lan_address.ip in {
            lan_network.network_address,
            lan_network.broadcast_address,
        }:
            raise ValueError("O IP da LAN não pode ser rede ou broadcast.")

        pool_addresses = (self.dhcp_pool_start, self.dhcp_pool_end)
        if any(pool_addresses) and not all(pool_addresses):
            raise ValueError("Informe o início e o fim do pool DHCP.")
        if all(pool_addresses):
            if not self.enable_lan_dhcp:
                raise ValueError("O pool DHCP exige o DHCP Server ativo na LAN.")
            if lan_network is None or self.dhcp_pool_start not in lan_network or self.dhcp_pool_end not in lan_network:
                raise ValueError("O pool DHCP deve pertencer à rede LAN.")
            if self.dhcp_pool_start in {lan_network.network_address, lan_network.broadcast_address} or self.dhcp_pool_end in {lan_network.network_address, lan_network.broadcast_address}:
                raise ValueError("O pool DHCP não pode usar rede ou broadcast.")
            if self.lan_address and self.dhcp_pool_start <= self.lan_address.ip <= self.dhcp_pool_end:
                raise ValueError("O pool DHCP não pode incluir o IP do MikroTik.")
            if self.dhcp_pool_start > self.dhcp_pool_end:
                raise ValueError("O início do pool DHCP deve ser menor que o fim.")

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
        if lan_network and wan_network.overlaps(lan_network):
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


class LoraProtectionConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enable_lns_watchdog: bool = True
    enable_lora_guard: bool = True
    enable_device_reboot: bool = True
    ping_target: IPv4Address = IPv4Address("1.1.1.1")
    failure_threshold: int = Field(default=3, ge=1, le=10)
    lora_interval: Literal["5m", "10m", "30m", "1h"] = "30m"
    connectivity_interval: Literal["1m", "5m", "10m", "30m"] = "10m"


class LoraProtectionPreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    connection: MikroTikConnection
    configuration: LoraProtectionConfiguration


class LoraProtectionApplyRequest(LoraProtectionPreviewRequest):
    confirmation: Literal["APLICAR"]


class LoraProtectionPreview(BaseModel):
    device_identity: str
    lora_interface: str
    lora_status: str
    changes: list[ConfigurationChange]
    warnings: list[str]


class LoraProtectionApplyResult(BaseModel):
    status: Literal["applied"]
    backup_file: str
    changes_applied: int
    summary: str
