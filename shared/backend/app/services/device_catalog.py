from dataclasses import dataclass

from app.models.mikrotik import DeviceCompatibility, WiFiInterface


@dataclass(frozen=True)
class CatalogEntry:
    profile_id: str
    name: str
    category: str
    markers: tuple[str, ...]
    guidance: tuple[str, ...]


CATALOG = (
    CatalogEntry(
        profile_id="mikrotik-lhg",
        name="Família LHG",
        category="radio",
        markers=("lhg",),
        guidance=("Indicada para enlace direcional.", "Confirme faixa e regulamentação antes de aplicar a frequência."),
    ),
    CatalogEntry(
        profile_id="mikrotik-sxt",
        name="Família SXT",
        category="radio",
        markers=("sxt", "sextant"),
        guidance=("Indicada para enlace de campo.", "A disponibilidade de recursos depende do pacote Wi-Fi instalado."),
    ),
    CatalogEntry(
        profile_id="mikrotik-outdoor-radio",
        name="Rádio outdoor MikroTik",
        category="radio",
        markers=("basebox", "disc", "dynadish", "groove", "mantbox", "metal", "netbox", "netmetal", "omnitik", "qrt"),
        guidance=("Perfil de rádio reconhecido.", "Revise interfaces, frequência e largura na prévia."),
    ),
    CatalogEntry(
        profile_id="mikrotik-cube",
        name="Família Cube / Wireless Wire",
        category="radio",
        markers=("cube", "wireless wire"),
        guidance=("Equipamento de enlace reconhecido.", "Alguns modelos utilizam interfaces específicas de 60 GHz."),
    ),
    CatalogEntry(
        profile_id="mikrotik-lora-gateway",
        name="Gateway LoRa MikroTik",
        category="lora_gateway",
        markers=("wap lr", "ltap lr", "knot lr"),
        guidance=("O pacote IoT e a interface LoRa foram detectados.", "A configuração do servidor LoRaWAN permanece sob controle do técnico."),
    ),
    CatalogEntry(
        profile_id="mikrotik-router",
        name="Roteador MikroTik",
        category="router",
        markers=("hap", "hex", "rb5009", "rb4011", "ccr", "crs", "chateau", "audience", "cap"),
        guidance=("Perfil de roteador reconhecido.", "Recursos de enlace permanecem separados da configuração Wi-Fi comum."),
    ),
)


def identify_device(
    model: str | None,
    wifi_interfaces: list[WiFiInterface],
    *,
    lora_available: bool,
) -> DeviceCompatibility:
    normalized = (model or "").casefold().replace("®", "")
    matches = [
        entry
        for entry in CATALOG
        if any(marker in normalized for marker in entry.markers)
    ]
    if lora_available:
        lora_match = next((entry for entry in matches if entry.category == "lora_gateway"), None)
        if lora_match:
            return _result(lora_match)

    radio_match = next((entry for entry in matches if entry.category == "radio"), None)
    if radio_match:
        return _result(radio_match)

    router_match = next((entry for entry in matches if entry.category == "router"), None)
    if router_match:
        return _result(router_match)

    if wifi_interfaces and any(
        (interface.mode or "").casefold().startswith("station")
        for interface in wifi_interfaces
    ):
        return DeviceCompatibility(
            profile_id="generic-station",
            profile_name="Rádio em modo Station",
            category="radio",
            support_level="generic",
            guidance=["O modelo não está no catálogo, mas o modo Station indica uso como enlace.", "Revise cuidadosamente a prévia antes de aplicar."],
        )

    category = "router" if wifi_interfaces else "generic"
    return DeviceCompatibility(
        profile_id="generic",
        profile_name="Equipamento genérico",
        category=category,
        support_level="generic",
        guidance=["Modelo ainda não catalogado.", "O ORION usará apenas as capacidades informadas pelo RouterOS."],
    )


def _result(entry: CatalogEntry) -> DeviceCompatibility:
    return DeviceCompatibility(
        profile_id=entry.profile_id,
        profile_name=entry.name,
        category=entry.category,
        support_level="recognized",
        guidance=list(entry.guidance),
    )
