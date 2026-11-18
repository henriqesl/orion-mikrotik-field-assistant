const text = (value) => String(value ?? "").trim();

// These checks confirm readable settings, not password contents or RF performance.
export function verifyRadio(request, device) {
  const differences = [];
  const check = (label, current, wanted) => { if (text(current) !== text(wanted)) differences.push(label); };
  check("Identidade", device.identity, request.identity);
  const wifi = device.wifi_interfaces?.find((item) => item.name === request.wifi_interface);
  if (!wifi) return [...differences, "Interface Wi-Fi"];
  const mode = request.role === "ap"
    ? device.wifi_stack === "wireless" ? request.device_kind === "radio" && request.link_scenario !== "multipoint" ? "bridge" : "ap-bridge" : "ap"
    : request.device_kind === "radio" ? "station-bridge" : "station";
  check("Função", wifi.mode, mode);
  check("SSID", wifi.ssid, request.ssid);
  if (wifi.disabled !== false) differences.push("Wi-Fi habilitado");
  if (request.frequency_mhz != null) check("Frequência", wifi.frequency, request.frequency_mhz);
  if (request.channel_width) {
    const width = device.wifi_stack === "wireless" && request.channel_width === "20/40mhz" ? /^20\/40mhz-(XX|Ce|eC)$/.test(wifi.channel_width || "") : wifi.channel_width === request.channel_width;
    if (!width) differences.push("Largura do canal");
  }
  if (request.manage_topology) {
    if (!device.ip_addresses?.some((row) => row.address === request.management_ip && !row.disabled && !row.invalid)) differences.push("IP de gerenciamento");
    for (const name of [request.wifi_interface, ...request.bridge_interfaces]) {
      if (!device.bridge_ports?.some((row) => row.interface === name && row.bridge === request.bridge_name && !row.disabled)) differences.push(`Bridge: ${name}`);
    }
  }
  return differences;
}
