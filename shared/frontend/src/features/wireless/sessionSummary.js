// Keep only the fields needed for read-only checks after the setup session ends.
export function sessionSummary(session) {
  if (!session) return null;
  return {
    ssid: session.ssid,
    ap: { identity: session.ap_identity || "AP", mac: session.ap_bssid, address: session.ap_management_ip },
    stations: Object.entries(session.station_addresses || {}).map(([mac, address]) => ({
      mac, address, identity: session.station_details?.[mac]?.identity || "Station",
      wifi_interface: session.station_details?.[mac]?.wifi_interface,
    })),
  };
}
