"""Wireless connect-list lock, not a roaming preference or an AP access-list."""

import re
from typing import Any

from routeros.errors import DeviceError

from app.models.radio import APLockStatus, AccessPoint, RadioInterfaceRequest, RadioScanRequest, RadioScanResult, normalize_bssid
from app.services.routeros import WIFI_MENUS, _optional_bool, _read_wifi, _rows, _with_connection

MENU = "/interface/wireless/connect-list"
PREFIX = "ORION Field - AP lock:"


def conflict(message):
    # Configuration uses this module too; import only after module initialization.
    from app.services.configuration import ConfigurationConflictError
    raise ConfigurationConflictError(message)


def _id(row):
    if not row.get(".id"):
        conflict("O RouterOS não retornou o identificador da regra de lock.")
    return row[".id"]


def _owned(row, interface):
    return row.get("interface") == interface and row.get("comment", "").startswith(f"{PREFIX}{interface};default=")


def lock_context(client, stack, interface, wifi_row):
    if stack != "wireless":
        return APLockStatus(supported=False, reason="Este driver WiFi não oferece o lock por BSSID usado pelo ORION. Use SSID e senha exclusivos para o enlace."), []
    try:
        rows = _rows(client.run(f"{MENU}/print"))
    except DeviceError:
        return APLockStatus(supported=False, reason="Não foi possível ler a connect-list; confira as permissões no RouterOS."), []
    own = [row for row in rows if _owned(row, interface)]
    external = any(row.get("interface") == interface and not _owned(row, interface) and not _optional_bool(row.get("disabled")) for row in rows)
    active = [row for row in own if not _optional_bool(row.get("disabled"))]
    locked = active[0].get("mac-address") if len(active) == 1 and _optional_bool(wifi_row.get("default-authentication")) is False and _optional_bool(active[0].get("connect", "yes")) and not external else None
    return APLockStatus(supported=True, managed=bool(active), locked_bssid=locked, external_rules=external), rows


def validate_lock(client, context, configuration):
    state, rows = lock_context(client, context["stack"], configuration.wifi_interface, context["wifi_row"])
    context["ap_lock_rows"] = rows
    context["ap_lock_state"] = state
    action = configuration.ap_lock_action
    if action == "preserve":
        if state.managed and configuration.role != "station":
            conflict("Remova o lock da Station antes de mudar este equipamento para AP.")
        return state
    if not state.supported:
        conflict(state.reason)
    own = [row for row in rows if _owned(row, configuration.wifi_interface)]
    if own and own[0]["comment"].rsplit("=", 1)[-1] not in {"yes", "no"}:
        conflict("A regra de lock foi modificada fora do ORION. Confira a connect-list no WinBox antes de alterá-la.")
    if len(own) > 1 or (action == "lock" and state.external_rules):
        conflict("Esta interface já usa regras de conexão personalizadas. Preserve o lock atual e peça ao responsável pela rede para revisar a connect-list no WinBox.")
    if action == "unlock" and not own:
        conflict("Não há lock criado pelo ORION nesta interface. Regras externas são preservadas.")
    return state


def apply_lock(client: Any, context, configuration, *, writer=None):
    action = configuration.ap_lock_action
    if action == "preserve":
        return
    interface = configuration.wifi_interface
    row = next((row for row in context["ap_lock_rows"] if _owned(row, interface)), None)
    if action == "unlock":
        original = row["comment"].rsplit("=", 1)[-1]
        if original not in {"yes", "no"}:
            conflict("Não foi possível confirmar o estado anterior do lock; revise a connect-list no WinBox.")
        client.run(f"{MENU}/set", f"=.id={_id(row)}", "=disabled=yes")
        client.run("/interface/wireless/set", f"=.id={_id(context['wifi_row'])}", f"=default-authentication={original}")
    else:
        original = row["comment"].rsplit("=", 1)[-1] if row else ("no" if _optional_bool(context["wifi_row"].get("default-authentication")) is False else "yes")
        words = (f"=interface={interface}", f"=mac-address={configuration.ap_bssid}", "=connect=yes", "=disabled=no", f"=comment={PREFIX}{interface};default={original}")
        if row:
            client.run(f"{MENU}/set", f"=.id={_id(row)}", *words)
        else:
            client.run(f"{MENU}/add", *words)
        client.run("/interface/wireless/set", f"=.id={_id(context['wifi_row'])}", "=default-authentication=no")
    wifi_rows = _rows(client.run("/interface/wireless/print"))
    current = next((item for item in wifi_rows if item.get("name") == interface), {})
    state, _ = lock_context(client, "wireless", interface, current)
    if (action == "lock" and state.locked_bssid != configuration.ap_bssid) or (action == "unlock" and (state.managed or _optional_bool(current.get("default-authentication")) != (original == "yes"))):
        if writer is not None:
            writer.fail("a confirmação do lock")
        from app.services.mutations import ConfigurationApplyError
        raise ConfigurationApplyError("O lock foi enviado, mas não pôde ser confirmado. Pode haver alterações parciais; confira a connect-list e o backup antes de repetir.")


def _interface(client, name):
    _package, stack, interfaces = _read_wifi(client)
    interface = next((item for item in interfaces if item.name == name), None)
    if interface is None:
        conflict("A interface Wi-Fi selecionada não foi encontrada. Reconecte e selecione novamente.")
    rows = _rows(client.run(WIFI_MENUS[stack]))
    row = next((item for item in rows if (item.get("name") or item.get("default-name")) == name), {})
    return stack, interface, row


def read_ap_lock(request: RadioInterfaceRequest):
    def operation(client):
        stack, _wifi, row = _interface(client, request.wifi_interface)
        return lock_context(client, stack, request.wifi_interface, row)[0]
    return _with_connection(request.connection, operation)


def scan_access_points(request: RadioScanRequest):
    def operation(client):
        stack, wifi, row = _interface(client, request.wifi_interface)
        if wifi.disabled:
            conflict("A interface está desativada. Ative-a no WinBox antes de buscar APs.")
        if row.get("master-interface") not in (None, "", "none"):
            conflict("Selecione a interface Wi-Fi física para buscar os APs.")
        argument = "interface" if stack == "wireless" else "number"
        try:
            limit = "=rounds=1" if stack == "wireless" else "=duration=5s"
            rows = _rows(client.run(f"/interface/{stack}/scan", f"={argument}={request.wifi_interface}", limit))
        except DeviceError:
            conflict("A busca não foi aceita pelo RouterOS. Confira permissões, driver e interface; o ORION não alterou a configuração.")
        points = {}
        for row in rows:
            try:
                mac = normalize_bssid(row.get("address") or row.get("mac-address") or row.get("bssid") or "")
            except ValueError:
                continue
            channel = row.get("channel") or row.get("frequency")
            signal = re.match(r"^-?\d+", str(row.get("signal") or row.get("signal-strength") or row.get("sig") or ""))
            frequency = re.match(r"^\d{4}", str(channel or ""))
            point = AccessPoint(bssid=mac, ssid=row.get("ssid") or "", signal_dbm=int(signal[0]) if signal else None, frequency_mhz=int(frequency[0]) if frequency else None, channel=channel, security=row.get("security") or row.get("privacy"))
            previous = points.get(mac)
            if previous is None or (point.signal_dbm if point.signal_dbm is not None else -999) > (previous.signal_dbm if previous.signal_dbm is not None else -999):
                points[mac] = point
        return RadioScanResult(wifi_interface=request.wifi_interface, wifi_stack=stack, access_points=sorted(points.values(), key=lambda item: (-(item.signal_dbm if item.signal_dbm is not None else -999), item.bssid)))
    return _with_connection(request.connection, operation, timeout=15.0)
