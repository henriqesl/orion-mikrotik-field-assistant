from __future__ import annotations

import ctypes
import socket
from ctypes import wintypes
from ipaddress import IPv4Interface

from app.models.discovery import (
    LocalNetworkAdapter,
    MacBootstrapApplyRequest,
    MacBootstrapCurrentState,
    MacBootstrapPreview,
    MacBootstrapRequest,
    MacBootstrapResult,
)
from app.services.mac_telnet import MacTelnetClient


class NetworkAdapterError(Exception):
    pass


class _SocketAddress(ctypes.Structure):
    _fields_ = [("address", ctypes.c_void_p), ("length", ctypes.c_int)]


class _UnicastAddress(ctypes.Structure):
    pass


_UnicastAddress._fields_ = [
    ("alignment", ctypes.c_ulonglong),
    ("next", ctypes.POINTER(_UnicastAddress)),
    ("socket_address", _SocketAddress),
]


class _AdapterAddress(ctypes.Structure):
    pass


_AdapterAddress._fields_ = [
    ("length", wintypes.ULONG),
    ("interface_index", wintypes.DWORD),
    ("next", ctypes.POINTER(_AdapterAddress)),
    ("adapter_name", ctypes.c_char_p),
    ("first_unicast", ctypes.POINTER(_UnicastAddress)),
    ("first_anycast", ctypes.c_void_p),
    ("first_multicast", ctypes.c_void_p),
    ("first_dns_server", ctypes.c_void_p),
    ("dns_suffix", ctypes.c_wchar_p),
    ("description", ctypes.c_wchar_p),
    ("friendly_name", ctypes.c_wchar_p),
    ("physical_address", ctypes.c_ubyte * 8),
    ("physical_address_length", wintypes.DWORD),
    ("flags", wintypes.DWORD),
    ("mtu", wintypes.DWORD),
    ("interface_type", wintypes.DWORD),
    ("oper_status", ctypes.c_int),
]


class _SockaddrIn(ctypes.Structure):
    _fields_ = [
        ("family", ctypes.c_ushort),
        ("port", ctypes.c_ushort),
        ("address", ctypes.c_ubyte * 4),
        ("zero", ctypes.c_ubyte * 8),
    ]


def _windows_adapters() -> list[dict]:
    if not hasattr(ctypes, "windll"):
        raise NetworkAdapterError("O acesso MAC temporário está disponível somente no Windows.")
    size = wintypes.ULONG(15_000)
    flags = 0x0002 | 0x0004 | 0x0008
    while True:
        buffer = ctypes.create_string_buffer(size.value)
        first = ctypes.cast(buffer, ctypes.POINTER(_AdapterAddress))
        result = ctypes.windll.iphlpapi.GetAdaptersAddresses(
            socket.AF_INET, flags, None, first, ctypes.byref(size)
        )
        if result == 111:  # ERROR_BUFFER_OVERFLOW
            continue
        if result != 0:
            raise NetworkAdapterError("O Windows não retornou as interfaces de rede disponíveis.")
        break

    found: list[dict] = []
    current = first
    while current:
        item = current.contents
        if item.oper_status == 1 and item.physical_address_length == 6:
            mac = ":".join(f"{byte:02X}" for byte in item.physical_address[:6])
            unicast = item.first_unicast
            while unicast:
                sockaddr = unicast.contents.socket_address
                if sockaddr.address and sockaddr.length >= ctypes.sizeof(_SockaddrIn):
                    ipv4 = ctypes.cast(sockaddr.address, ctypes.POINTER(_SockaddrIn)).contents
                    if ipv4.family == socket.AF_INET:
                        address = socket.inet_ntoa(bytes(ipv4.address))
                        found.append({
                            "interface_index": item.interface_index,
                            "name": item.friendly_name or item.adapter_name.decode(errors="replace"),
                            "description": item.description or None,
                            "mac_address": mac,
                            "ipv4_address": address,
                        })
                unicast = unicast.contents.next
        current = item.next
    return found


def list_network_adapters() -> list[LocalNetworkAdapter]:
    try:
        raw = _windows_adapters()
    except (OSError, ValueError) as error:
        raise NetworkAdapterError("O ORION não conseguiu listar as interfaces de rede do Windows.") from error
    return [LocalNetworkAdapter.model_validate(item) for item in raw if item.get("mac_address")]


def _adapter(index: int) -> LocalNetworkAdapter:
    match = next((item for item in list_network_adapters() if item.interface_index == index), None)
    if match is None:
        raise NetworkAdapterError("A interface de rede selecionada não está mais disponível.")
    return match


def _read_command() -> tuple[str, str]:
    sentinel = "ORION_MAC_READ_OK"
    command = (
        ':put ("ORION_IDENTITY=" . [/system identity get name]); '
        ':foreach i in=[/ip address find] do={:put ("ORION_IP=" . [/ip address get $i address] . "|" . [/ip address get $i interface])}; '
        ':local a [/ip service find where name="api"]; '
        ':put ("ORION_API=" . [/ip service get $a disabled] . "|" . [/ip service get $a port] . "|" . [:tostr [/ip service get $a address]]); '
        f':put "{sentinel}"'
    )
    return command, sentinel


def _parse_state(output: str) -> MacBootstrapCurrentState:
    state = MacBootstrapCurrentState()
    for raw_line in output.replace("\r", "\n").splitlines():
        line = raw_line.strip()
        if "ORION_IDENTITY=" in line:
            state.identity = line.split("ORION_IDENTITY=", 1)[1].strip()
        elif "ORION_IP=" in line:
            value = line.split("ORION_IP=", 1)[1].strip()
            if value and value not in state.addresses:
                state.addresses.append(value)
        elif "ORION_API=" in line:
            parts = line.split("ORION_API=", 1)[1].strip().split("|", 2)
            if len(parts) >= 2:
                state.api_enabled = parts[0].lower() in {"false", "no"}
                try:
                    state.api_port = int(parts[1])
                except ValueError:
                    state.api_port = None
                state.api_allowed_addresses = parts[2] if len(parts) == 3 else None
    return state


def _client(request: MacBootstrapRequest, adapter: LocalNetworkAdapter) -> MacTelnetClient:
    return MacTelnetClient(
        target_mac=request.mac_address,
        source_mac=adapter.mac_address,
        local_ip=str(adapter.ipv4_address),
        username=request.username,
        password=request.password.get_secret_value(),
    )


def preview_mac_bootstrap(request: MacBootstrapRequest) -> MacBootstrapPreview:
    adapter = _adapter(request.adapter_index)
    command, sentinel = _read_command()
    state = _parse_state(_client(request, adapter).execute(command, sentinel))
    address = str(request.management_address)
    network = str(request.management_address.network)
    commands = []
    if not any(item.split("|", 1)[0] == address for item in state.addresses):
        commands.append(f'Adicionar {address} em {request.router_interface}')
    if not state.api_enabled or state.api_port != 8728:
        commands.append("Habilitar a API RouterOS na porta 8728")
    allowed = state.api_allowed_addresses or ""
    if allowed and network not in allowed:
        commands.append(f"Acrescentar {network} aos endereços permitidos da API")
    if not commands:
        commands.append("Nenhuma alteração: IP e API já estão prontos")
    warnings = ["O acesso MAC será encerrado imediatamente após preparar a API por IP."]
    if adapter.ipv4_address not in request.management_address.network:
        warnings.append(
            f"A placa {adapter.name} usa {adapter.ipv4_address}, fora de {network}. "
            "Ajuste o IPv4 do computador para essa rede antes da reconexão pela API."
        )
    return MacBootstrapPreview(
        target_mac=request.mac_address,
        adapter=adapter,
        current=state,
        commands=commands,
        warnings=warnings,
        reconnect_ip=request.management_address.ip,
    )


def _apply_command(request: MacBootstrapApplyRequest) -> tuple[str, str]:
    address = str(request.management_address)
    network = str(request.management_address.network)
    interface = request.router_interface.replace('"', "")
    sentinel = "ORION_MAC_BOOTSTRAP_OK"
    command = (
        f':if ([:len [/ip address find where address="{address}"]] = 0) do={{/ip address add address="{address}" interface="{interface}" comment="ORION Field - acesso inicial"}}; '
        ':local a [/ip service find where name="api"]; :local old [:tostr [/ip service get $a address]]; '
        f':if (([:len $old] > 0) and ([:find $old "{network}"] = nil)) do={{/ip service set $a address=($old . "," . "{network}")}}; '
        f':if ([:len $old] = 0) do={{/ip service set $a address="{network}"}}; '
        f'/ip service set $a disabled=no port=8728; :put "{sentinel}"'
    )
    return command, sentinel


def apply_mac_bootstrap(request: MacBootstrapApplyRequest) -> MacBootstrapResult:
    adapter = _adapter(request.adapter_index)
    command, sentinel = _apply_command(request)
    _client(request, adapter).execute(command, sentinel)
    return MacBootstrapResult(
        status="applied",
        host=request.management_address.ip,
        summary="IP preparado por MAC. A sessão temporária foi encerrada; prossiga pela API RouterOS.",
    )
