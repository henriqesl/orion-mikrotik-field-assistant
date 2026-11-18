const macs = (device) => [...(device?.ethernet_interfaces || []), ...(device?.wifi_interfaces || [])]
  .map((item) => item.mac_address?.toUpperCase()).filter(Boolean);

export function sameDevice(before, after) {
  const expected = new Set(macs(before));
  return macs(after).some((mac) => expected.has(mac));
}
