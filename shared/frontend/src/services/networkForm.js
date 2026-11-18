export function networkFormFromCurrent(current, fallback) {
  const existingLan = current.configure_lan;
  const existingWan = current.wan_configured ?? Boolean(current.wan_address || current.gateway || existingLan);
  return {
    ...fallback,
    ...current,
    configure_wan: !existingWan,
    configure_dns: !existingWan && !existingLan,
    configure_lan: !existingLan,
    existing_lan_configured: existingLan,
    wan_address: current.wan_address || "",
    gateway: current.gateway || "",
    lan_bridge: current.lan_bridge || fallback.lan_bridge,
    lan_address: current.lan_address || fallback.lan_address,
    lan_ports: existingLan ? current.lan_ports : fallback.lan_ports.filter((port) => port !== current.wan_interface),
    dns_servers: existingWan || existingLan ? current.dns_servers.join(", ") : fallback.dns_servers,
    enable_nat: existingLan ? current.enable_nat : fallback.enable_nat,
    enable_lan_dhcp: existingLan ? current.enable_lan_dhcp : fallback.enable_lan_dhcp,
    dhcp_pool_start: current.dhcp_pool_start || "",
    dhcp_pool_end: current.dhcp_pool_end || "",
  };
}

export function networkPayload(form) {
  // Explicit wire schema: never send presentation-only state to the strict API.
  const result = Object.fromEntries([
    "identity", "configure_wan", "configure_dns", "wan_interface", "wan_mode",
    "configure_lan", "enable_ssh", "enable_winbox", "enable_webfig_https",
    "enable_telnet", "enable_ftp", "enable_webfig_http",
  ].map((key) => [key, form[key]]));
  return {
    ...result,
    wan_address: form.wan_mode === "static" ? form.wan_address || null : null,
    gateway: form.wan_mode === "static" ? form.gateway || null : null,
    lan_bridge: form.configure_lan ? form.lan_bridge : null,
    lan_address: form.configure_lan ? form.lan_address : null,
    lan_ports: form.configure_lan ? form.lan_ports : [],
    enable_nat: form.configure_lan && form.enable_nat,
    enable_lan_dhcp: form.configure_lan && form.enable_lan_dhcp,
    dns_servers: form.dns_servers.split(",").map((item) => item.trim()).filter(Boolean),
    dhcp_pool_start: form.configure_lan && form.enable_lan_dhcp ? form.dhcp_pool_start || null : null,
    dhcp_pool_end: form.configure_lan && form.enable_lan_dhcp ? form.dhcp_pool_end || null : null,
  };
}
