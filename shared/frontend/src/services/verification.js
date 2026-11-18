const text = (value) => String(value ?? "").trim();
const list = (values) => [...new Set(values || [])].sort().join(",");
const macs = (device) => [...(device?.ethernet_interfaces || []), ...(device?.wifi_interfaces || [])]
  .map((item) => item.mac_address?.toUpperCase()).filter(Boolean);

export function sameDevice(before, after) {
  const expected = new Set(macs(before));
  return macs(after).some((mac) => expected.has(mac));
}

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

export function verifyNetwork(request, current) {
  const differences = [];
  const check = (label, actual, wanted) => { if (text(actual) !== text(wanted)) differences.push(label); };
  check("Identidade", current.identity, request.identity);
  if (request.configure_wan) {
    check("Interface WAN", current.wan_interface, request.wan_interface);
    check("Modo WAN", current.wan_mode, request.wan_mode);
    if (request.wan_mode === "static") {
      check("IP WAN", current.wan_address, request.wan_address);
      if (request.gateway) check("Gateway", current.gateway, request.gateway);
    }
  }
  if (request.configure_dns) check("DNS", list(current.dns_servers), list(request.dns_servers));
  if (request.configure_lan) {
    for (const [key, label] of [["lan_bridge", "Bridge LAN"], ["lan_address", "IP LAN"], ["enable_nat", "NAT"], ["enable_lan_dhcp", "DHCP Server"]]) check(label, current[key], request[key]);
    check("Portas LAN", list(current.lan_ports), list(request.lan_ports));
    if (request.enable_lan_dhcp && request.dhcp_pool_start) {
      check("Início do pool", current.dhcp_pool_start, request.dhcp_pool_start);
      check("Fim do pool", current.dhcp_pool_end, request.dhcp_pool_end);
    }
  }
  for (const [key, label] of [["enable_ssh", "SSH"], ["enable_winbox", "WinBox"], ["enable_webfig_https", "WebFig HTTPS"], ["enable_webfig_http", "WebFig HTTP"], ["enable_telnet", "Telnet"], ["enable_ftp", "FTP"]]) check(label, current[key], request[key]);
  return differences;
}
