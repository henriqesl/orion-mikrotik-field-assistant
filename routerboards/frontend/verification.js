const text = (value) => String(value ?? "").trim();
const list = (values) => [...new Set(values || [])].sort().join(",");

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
