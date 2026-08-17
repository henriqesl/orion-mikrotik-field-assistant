from fastapi import APIRouter, HTTPException, status

from app.models.configuration import (
    BasicNetworkApplyRequest,
    BasicNetworkApplyResult,
    BasicNetworkPreview,
    BasicNetworkPreviewRequest,
    ConfigurationApplyRequest,
    ConfigurationApplyResult,
    ConfigurationPreview,
    ConfigurationPreviewRequest,
    LoraProtectionApplyRequest,
    LoraProtectionApplyResult,
    LoraProtectionPreview,
    LoraProtectionPreviewRequest,
    VlanApplyRequest,
    VlanApplyResult,
    VlanPreview,
    VlanPreviewRequest,
)
from app.models.mikrotik import (
    ConnectivityRequest,
    ConnectivityValidation,
    DeviceSummary,
    MikroTikConnection,
    PingRequest,
    PingResult,
)
from app.models.discovery import (
    BootstrapRequest,
    BootstrapResult,
    LanDiscoveryResult,
    WinBoxLaunchRequest,
    WinBoxLaunchResult,
)
from app.services.routeros import (
    MikroTikAuthenticationError,
    MikroTikError,
    MikroTikResponseError,
    MikroTikTimeoutError,
    MikroTikTLSVerificationError,
    discover_device,
    ping_device,
    validate_connectivity,
)
from app.services.configuration import (
    ConfigurationConflictError,
    apply_link_configuration,
    preview_link_configuration,
)
from app.services.network_configuration import apply_basic_network, preview_basic_network
from app.services.vlan_configuration import apply_vlan, preview_vlan
from app.services.lora_configuration import apply_lora_protection, preview_lora_protection
from app.services.lan_discovery import (
    WinBoxNotFoundError,
    build_bootstrap,
    mndp_collector,
    open_winbox,
)


router = APIRouter(prefix="/api/mikrotik", tags=["mikrotik"])


@router.post("/lora/preview", response_model=LoraProtectionPreview)
def preview_lora_configuration(
    request: LoraProtectionPreviewRequest,
) -> LoraProtectionPreview:
    try:
        return preview_lora_protection(request)
    except ConfigurationConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except MikroTikError as error:
        raise _friendly_http_error(error) from error


@router.post("/lora/apply", response_model=LoraProtectionApplyResult)
def apply_lora_configuration(
    request: LoraProtectionApplyRequest,
) -> LoraProtectionApplyResult:
    try:
        return apply_lora_protection(request)
    except ConfigurationConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except MikroTikError as error:
        raise _friendly_http_error(error) from error


@router.post("/vlan/preview", response_model=VlanPreview)
def preview_vlan_configuration(request: VlanPreviewRequest) -> VlanPreview:
    try:
        return preview_vlan(request)
    except ConfigurationConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except MikroTikError as error:
        raise _friendly_http_error(error) from error


@router.post("/vlan/apply", response_model=VlanApplyResult)
def apply_vlan_configuration(request: VlanApplyRequest) -> VlanApplyResult:
    try:
        return apply_vlan(request)
    except ConfigurationConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except MikroTikError as error:
        raise _friendly_http_error(error) from error


@router.post("/bootstrap", response_model=BootstrapResult)
def generate_bootstrap(request: BootstrapRequest) -> BootstrapResult:
    """Generate the minimal script needed to continue through the IP API."""
    return build_bootstrap(request)


@router.get("/lan-devices", response_model=LanDiscoveryResult)
def discover_lan_devices() -> LanDiscoveryResult:
    """Return MikroTik devices announced through MNDP on the local network."""
    return mndp_collector.snapshot()


@router.post("/winbox/open", response_model=WinBoxLaunchResult)
def launch_winbox(request: WinBoxLaunchRequest) -> WinBoxLaunchResult:
    """Open the official WinBox client at a discovered MAC without a password."""
    try:
        open_winbox(request.mac_address, request.username)
    except WinBoxNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except OSError as error:
        raise HTTPException(
            status_code=502,
            detail="O Windows não conseguiu abrir o WinBox.",
        ) from error
    return WinBoxLaunchResult(
        status="opened",
        summary="WinBox aberto. Informe a senha diretamente na janela oficial.",
    )


def _friendly_http_error(error: MikroTikError) -> HTTPException:
    if isinstance(error, MikroTikAuthenticationError):
        return HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário ou senha não foram aceitos pelo MikroTik.",
        )
    if isinstance(error, MikroTikTimeoutError):
        return HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=(
                "O MikroTik demorou demais para responder. "
                "Verifique o IP, a porta e a rede."
            ),
        )
    if isinstance(error, MikroTikTLSVerificationError):
        return HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "Não foi possível validar o certificado TLS do MikroTik. "
                "Confira o certificado ou desative a validação somente em uma rede confiável."
            ),
        )
    if isinstance(error, MikroTikResponseError):
        return HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "O MikroTik respondeu, mas o ORION não conseguiu interpretar "
                "todos os dados recebidos."
            ),
        )

    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=(
            "Não foi possível conectar ao MikroTik. Confirme se a API está "
            "habilitada e se o IP e a porta estão corretos."
        ),
    )


@router.post("/discover", response_model=DeviceSummary)
def discover_mikrotik(connection: MikroTikConnection) -> DeviceSummary:
    """Connect to one MikroTik and return its basic identity."""
    try:
        return discover_device(connection)
    except MikroTikError as error:
        raise _friendly_http_error(error) from error


@router.post(
    "/ping",
    response_model=PingResult,
    response_model_exclude_none=True,
)
def ping_from_mikrotik(request: PingRequest) -> PingResult:
    """Run a short ICMP test from the connected MikroTik."""
    try:
        return ping_device(request)
    except MikroTikError as error:
        raise _friendly_http_error(error) from error


@router.post("/connectivity", response_model=ConnectivityValidation)
def connectivity_from_mikrotik(
    request: ConnectivityRequest,
) -> ConnectivityValidation:
    """Validate the active gateway, ARP resolution and external reachability."""
    try:
        return validate_connectivity(request)
    except MikroTikError as error:
        raise _friendly_http_error(error) from error


@router.post("/configuration/preview", response_model=ConfigurationPreview)
def preview_configuration(
    request: ConfigurationPreviewRequest,
) -> ConfigurationPreview:
    """Validate and preview a direct link configuration without changing it."""
    try:
        return preview_link_configuration(request)
    except ConfigurationConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except MikroTikError as error:
        raise _friendly_http_error(error) from error


@router.post("/configuration/apply", response_model=ConfigurationApplyResult)
def apply_configuration(
    request: ConfigurationApplyRequest,
) -> ConfigurationApplyResult:
    """Create a backup and apply a previously confirmed link configuration."""
    try:
        return apply_link_configuration(request)
    except ConfigurationConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except MikroTikError as error:
        raise _friendly_http_error(error) from error


@router.post("/network/preview", response_model=BasicNetworkPreview)
def preview_network_configuration(
    request: BasicNetworkPreviewRequest,
) -> BasicNetworkPreview:
    """Validate and preview a basic network profile without changing it."""
    try:
        return preview_basic_network(request)
    except ConfigurationConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except MikroTikError as error:
        raise _friendly_http_error(error) from error


@router.post("/network/apply", response_model=BasicNetworkApplyResult)
def apply_network_configuration(
    request: BasicNetworkApplyRequest,
) -> BasicNetworkApplyResult:
    """Create a backup and apply a confirmed basic network profile."""
    try:
        return apply_basic_network(request)
    except ConfigurationConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except MikroTikError as error:
        raise _friendly_http_error(error) from error
