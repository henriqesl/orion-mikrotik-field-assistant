from ipaddress import IPv4Address, IPv4Interface
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator


def normalize_mac_address(value: str) -> str:
    normalized = value.strip().upper().replace("-", ":")
    parts = normalized.split(":")
    if len(parts) != 6 or any(
        len(part) != 2
        or any(character not in "0123456789ABCDEF" for character in part)
        for part in parts
    ):
        raise ValueError("Informe um endereço MAC válido.")
    return normalized


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
    executable_path: str | None = Field(default=None, max_length=1024)
    try_blank_password: bool = False

    @field_validator("mac_address")
    @classmethod
    def validate_mac_address(cls, value: str) -> str:
        return normalize_mac_address(value)


class WinBoxLaunchResult(BaseModel):
    status: Literal["opened"]
    summary: str


class LocalNetworkAdapter(BaseModel):
    interface_index: int = Field(ge=1)
    name: str
    description: str | None = None
    mac_address: str
    ipv4_address: IPv4Address


class MacBootstrapRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mac_address: str
    username: str = Field(default="admin", min_length=1, max_length=64)
    password: SecretStr
    adapter_index: int = Field(ge=1)
    router_interface: str = Field(min_length=1, max_length=64)
    management_address: IPv4Interface

    @field_validator("mac_address")
    @classmethod
    def validate_mac_address(cls, value: str) -> str:
        return normalize_mac_address(value)

    @field_validator("router_interface")
    @classmethod
    def validate_router_interface(cls, value: str) -> str:
        value = value.strip()
        if any(character in value for character in {'"', "\r", "\n"}):
            raise ValueError("A interface do MikroTik contém caracteres inválidos.")
        return value


class MacBootstrapApplyRequest(MacBootstrapRequest):
    confirmation: Literal["APLICAR"]


class MacBootstrapCurrentState(BaseModel):
    identity: str | None = None
    addresses: list[str] = Field(default_factory=list)
    api_enabled: bool | None = None
    api_port: int | None = None
    api_allowed_addresses: str | None = None


class MacBootstrapPreview(BaseModel):
    target_mac: str
    adapter: LocalNetworkAdapter
    current: MacBootstrapCurrentState
    commands: list[str]
    warnings: list[str]
    reconnect_ip: IPv4Address


class MacBootstrapResult(BaseModel):
    status: Literal["applied"]
    host: IPv4Address
    api_port: int = 8728
    summary: str
