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
