from ipaddress import IPv4Address, IPv4Interface
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class LanDevice(BaseModel):
    mac_address: str
    identity: str | None = None
    ip_address: IPv4Address | None = None
    platform: str | None = None
    version: str | None = None
    board: str | None = None
    interface: str | None = None
    last_seen_seconds: float = Field(ge=0)


class LanDiscoveryResult(BaseModel):
    status: Literal["listening", "unavailable"]
    devices: list[LanDevice]
    message: str | None = None


class WinBoxLaunchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mac_address: str
    username: str = Field(default="admin", min_length=1, max_length=64)

    @field_validator("mac_address")
    @classmethod
    def validate_mac_address(cls, value: str) -> str:
        normalized = value.strip().upper().replace("-", ":")
        parts = normalized.split(":")
        if len(parts) != 6 or any(
            len(part) != 2
            or any(character not in "0123456789ABCDEF" for character in part)
            for part in parts
        ):
            raise ValueError("Informe um endereço MAC válido.")
        return normalized


class WinBoxLaunchResult(BaseModel):
    status: Literal["opened"]
    summary: str


class BootstrapRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    interface_name: str = Field(
        default="ether1",
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9_.-]+$",
    )
    address: IPv4Interface

    @model_validator(mode="after")
    def validate_bootstrap_network(self):
        network = self.address.network
        if network.prefixlen > 30:
            raise ValueError("Use uma rede com pelo menos dois endereços utilizáveis.")
        if self.address.ip in {network.network_address, network.broadcast_address}:
            raise ValueError("O IP temporário não pode ser rede ou broadcast.")
        return self


class BootstrapResult(BaseModel):
    filename: str
    script: str
    reconnect_ip: IPv4Address
    computer_ip_suggestion: IPv4Address
    prefix_length: int
