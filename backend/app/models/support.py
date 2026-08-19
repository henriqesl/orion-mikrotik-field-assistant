from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SupportDeviceSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    identity: str = Field(max_length=64)
    model: str | None = Field(default=None, max_length=128)
    routeros_version: str = Field(max_length=128)
    architecture: str | None = Field(default=None, max_length=64)
    wifi_stack: str = Field(max_length=32)
    compatibility_profile: str | None = Field(default=None, max_length=128)
    compatibility_level: Literal["recognized", "generic"] | None = None
    radio_device: bool
    lora_available: bool
    wifi_interface_count: int = Field(ge=0, le=128)
    ethernet_interface_count: int = Field(ge=0, le=128)


class SupportBundleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    device: SupportDeviceSnapshot | None = None
    recent_error: str | None = Field(default=None, max_length=1000)
