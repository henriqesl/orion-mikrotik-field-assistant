import re
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.models.mikrotik import MikroTikConnection


def normalize_bssid(value: str) -> str:
    value = value.strip().replace("-", ":").upper()
    if not re.fullmatch(r"(?:[0-9A-F]{2}:){5}[0-9A-F]{2}", value) or value == "00:00:00:00:00:00" or int(value[:2], 16) & 1:
        raise ValueError("Informe o MAC unicast do AP, por exemplo 02:11:22:33:44:55.")
    return value


BSSID = Annotated[str, AfterValidator(normalize_bssid)]


class RadioInterfaceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    connection: MikroTikConnection
    wifi_interface: str = Field(min_length=1, max_length=64)


class RadioScanRequest(RadioInterfaceRequest):
    confirmation: Literal["BUSCAR"]


class AccessPoint(BaseModel):
    bssid: str
    ssid: str
    signal_dbm: int | None = None
    frequency_mhz: int | None = None
    channel: str | None = None
    security: str | None = None


class RadioScanResult(BaseModel):
    wifi_interface: str
    wifi_stack: str
    access_points: list[AccessPoint]


class APLockStatus(BaseModel):
    supported: bool
    managed: bool = False
    locked_bssid: str | None = None
    external_rules: bool = False
    reason: str | None = None
