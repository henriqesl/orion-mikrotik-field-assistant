const demoAssessment = (status, label, explanation) => ({ status, label, explanation });

let demoTick = 0;

export function isDemoConnection(connection) {
  return ["teste", "test", "demo", "192.0.2.1"].includes(
    connection.host.trim().toLowerCase(),
  );
}

export function demoDevice() {
  demoTick += 1;
  const signal = [-64, -63, -62, -61, -60, -61, -59, -60][demoTick % 8];

  return {
    identity: "ORION-DEMO-STATION",
    model: "LHG 5 ax (demonstração)",
    routeros_version: "7.20.8",
    architecture: "arm64",
    wifi_package: "wifi-qcom",
    wifi_stack: "wifi",
    lora_available: true,
    wifi_interfaces: [{
      name: "wifi1",
      default_name: "wifi1",
      mac_address: "02:00:00:00:03:01",
      disabled: false,
      running: true,
      mode: "station-bridge",
      ssid: "ORION-DEMO-LINK",
      frequency: "5805",
      channel_width: "20mhz",
      band: "5ghz-ax",
    }],
    registration_table_available: true,
    wifi_peers: [{
      interface: "wifi1",
      mac_address: "02:00:00:00:03:02",
      radio_name: "ORION-DEMO-AP",
      ssid: "ORION-DEMO-LINK",
      authorized: true,
      signal: `${signal}`,
      signal_dbm: signal,
      tx_rate: "648.5Mbps",
      rx_rate: "576.4Mbps",
      tx_bits_per_second: 84200000,
      rx_bits_per_second: 71600000,
      uptime: "2h18m42s",
      last_activity: "4ms",
      band: "5ghz-ax",
      signal_assessment: demoAssessment("excellent", "Excelente", "Sinal com boa margem para a demonstração."),
      association_assessment: demoAssessment("good", "Autorizado", "Peer associado e autorizado."),
    }],
    ethernet_interfaces: [
      { name: "ether1", default_name: "ether1", mac_address: "02:00:00:00:03:03", disabled: false, running: true },
      { name: "ether2", default_name: "ether2", mac_address: "02:00:00:00:03:04", disabled: false, running: true },
      { name: "ether3", default_name: "ether3", mac_address: "02:00:00:00:03:05", disabled: false, running: true },
    ],
    bridges: [{ name: "bridge-field", disabled: false, running: true }],
    bridge_ports: [
      { interface: "ether1", bridge: "bridge-field", disabled: false, inactive: false, hw_offload: true },
      { interface: "wifi1", bridge: "bridge-field", disabled: false, inactive: false, hw_offload: false },
    ],
    ip_addresses: [{
      address: "192.0.2.1/24",
      network: "192.0.2.0",
      interface: "bridge-field",
      actual_interface: "bridge-field",
      disabled: false,
      dynamic: false,
      invalid: false,
    }],
    default_routes: [{
      gateway: "192.0.2.254",
      immediate_gateway: "192.0.2.254%bridge-field",
      routing_table: "main",
      active: true,
      disabled: false,
      dynamic: false,
      distance: 1,
    }],
    structural_diagnostic: {
      checks: [
        { key: "wifi", label: "Wi-Fi", status: "passed", summary: "Interface Wi-Fi ativa.", possible_causes: [] },
        { key: "peer", label: "Associação", status: "passed", summary: "Peer autorizado.", possible_causes: [] },
        { key: "bridge", label: "Bridge", status: "passed", summary: "Bridge e portas configuradas.", possible_causes: [] },
        { key: "management", label: "Gerenciamento", status: "passed", summary: "IP de gerenciamento válido.", possible_causes: [] },
      ],
    },
    demo_mode: true,
  };
}

export function demoPing(target) {
  return {
    target,
    sent: 5,
    received: 5,
    packet_loss_percent: 0,
    minimum_latency_ms: 1.7,
    average_latency_ms: 2.4,
    maximum_latency_ms: 3.1,
    samples_ms: [2.1, 2.5, 1.7, 2.6, 3.1],
    measurement_source: "orion_calculation",
    advanced_metrics: {
      source: "orion_network_engine",
      sent_packets: 5,
      received_packets: 5,
      packet_loss_percent: 0,
      availability_percent: 100,
      minimum_latency_ms: 1.7,
      average_latency_ms: 2.4,
      maximum_latency_ms: 3.1,
      jitter_ms: 0.75,
      p95_latency_ms: 3,
      p99_latency_ms: 3.08,
      spike_count: 0,
      stability_score: 98,
    },
    packet_loss_assessment: demoAssessment("excellent", "Excelente", "Nenhuma perda observada."),
    average_latency_assessment: demoAssessment("excellent", "Excelente", "Latência média muito baixa."),
    maximum_latency_assessment: demoAssessment("excellent", "Excelente", "Sem picos relevantes."),
    link_health: {
      score: 96,
      status: "operational",
      status_label: "Enlace operacional",
      summary: "Comunicação estável no modo demonstração.",
      recommendation: "Use estes dados somente para conhecer a interface.",
      components: [],
    },
    link_health_unavailable_reason: null,
  };
}

export function demoConfigurationPreview(configuration) {
  return {
    device_identity: "ORION-DEMO-STATION",
    wifi_stack: "wifi",
    reconnect_ip: configuration.management_ip.split("/")[0],
    changes: [
      { area: "Equipamento", field: "Identidade", current_value: "ORION-DEMO-STATION", new_value: configuration.identity, sensitive: false },
      { area: "Rádio", field: "SSID", current_value: "ORION-DEMO-LINK", new_value: configuration.ssid, sensitive: false },
      { area: "Segurança", field: "Senha WPA2", current_value: "Protegida", new_value: "Será atualizada", sensitive: true },
    ],
    warnings: ["Demonstração: nenhuma alteração será enviada a um equipamento."],
  };
}

export function demoBasicNetworkPreview(configuration) {
  return {
    device_identity: "ORION-DEMO-STATION",
    reconnect_ip: configuration.lan_address.split("/")[0],
    changes: [
      { area: "Equipamento", field: "Identidade", current_value: "ORION-DEMO-STATION", new_value: configuration.identity },
      { area: "WAN", field: "Endereçamento", current_value: "Não configurado", new_value: configuration.wan_mode === "dhcp" ? "DHCP Client" : configuration.wan_address },
      { area: "LAN", field: "Bridge", current_value: "bridge-field", new_value: configuration.lan_bridge },
      { area: "LAN", field: "Endereço", current_value: "192.0.2.1/24", new_value: configuration.lan_address },
      { area: "LAN", field: "Portas", current_value: "ether1", new_value: configuration.lan_ports.join(", ") },
      { area: "DNS", field: "Servidores", current_value: "Não configurado", new_value: configuration.dns_servers.join(", ") },
      { area: "Internet", field: "NAT", current_value: "Não gerenciado", new_value: configuration.enable_nat ? "Ativar masquerade" : "Não configurar" },
      { area: "LAN", field: "DHCP Server", current_value: "Inativo", new_value: configuration.enable_lan_dhcp ? "Ativar automaticamente" : "Não configurar" },
      ...(configuration.enable_lan_dhcp ? [{ area: "LAN", field: "Pool DHCP", current_value: null, new_value: configuration.dhcp_pool_start && configuration.dhcp_pool_end ? `${configuration.dhcp_pool_start}-${configuration.dhcp_pool_end}` : "Calculado automaticamente" }] : []),
      { area: "Serviços", field: "SSH", current_value: "Ativo", new_value: configuration.enable_ssh ? "Ativo" : "Desativado" },
      { area: "Serviços", field: "WinBox", current_value: "Ativo", new_value: configuration.enable_winbox ? "Ativo" : "Desativado" },
      { area: "Serviços", field: "WebFig HTTPS", current_value: "Desativado", new_value: configuration.enable_webfig_https ? "Ativo" : "Desativado" },
      { area: "Serviços", field: "Telnet", current_value: "Ativo", new_value: configuration.enable_telnet ? "Ativo" : "Desativado" },
      { area: "Serviços", field: "FTP", current_value: "Desativado", new_value: configuration.enable_ftp ? "Ativo" : "Desativado" },
      { area: "Serviços", field: "WebFig HTTP", current_value: "Ativo", new_value: configuration.enable_webfig_http ? "Ativo" : "Desativado" },
    ],
    warnings: ["Demonstração: esta prévia não altera nenhum equipamento."],
  };
}
