from ipaddress import IPv4Address
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
