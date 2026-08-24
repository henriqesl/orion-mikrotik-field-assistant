const demoAssessment = (status, label, explanation) => ({ status, label, explanation });

let demoTick = 0;

export function isDemoConnection(connection) {
  return ["teste", "test", "demo", "demo-router", "demo-novo", "192.0.2.1"].includes(
    connection.host.trim().toLowerCase(),
  );
}

function demoProfile(connection) {
  const host = connection?.host?.trim().toLowerCase();
  if (host === "demo-router") return "router";
  if (host === "demo-novo") return "factory";
  return "radio";
}

export function demoDevice(connection) {
  demoTick += 1;
  const signal = [-64, -63, -62, -61, -60, -61, -59, -60][demoTick % 8];

  const radio = {
    identity: "ORION-DEMO-STATION",
    model: "LHG 5 ax (demonstração)",
    routeros_version: "7.20.8",
    architecture: "arm64",
    wifi_package: "wifi-qcom",
    wifi_stack: "wifi",
    radio_device: true,
    lora_available: true,
    compatibility: {
      profile_id: "mikrotik-lhg",
      profile_name: "Família LHG",
      category: "radio",
      support_level: "recognized",
      guidance: ["Equipamento de demonstração reconhecido pelo catálogo local."],
    },
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

  const profile = demoProfile(connection);
  if (profile === "radio") return radio;

  const ethernetInterfaces = Array.from({ length: 5 }, (_, index) => ({
    name: `ether${index + 1}`,
    default_name: `ether${index + 1}`,
    mac_address: `02:00:00:00:04:0${index + 1}`,
    disabled: false,
    running: true,
  }));
  const factory = profile === "factory";
  return {
    ...radio,
    identity: factory ? "MikroTik" : "ORION-DEMO-ROUTER",
    model: "hAP ax³ (demonstração)",
    radio_device: false,
    lora_available: false,
    compatibility: {
      profile_id: "mikrotik-hap",
      profile_name: "Família hAP",
      category: "router",
      support_level: "recognized",
      guidance: [factory
        ? "Cenário de router sem rede configurada."
        : "Cenário de router com configuração existente."],
    },
    wifi_interfaces: [{
      ...radio.wifi_interfaces[0],
      mode: "ap",
      ssid: factory ? "MikroTik" : "CLIENTES",
      frequency: "2437",
      band: "2ghz-ax",
    }],
    registration_table_available: true,
    wifi_peers: [],
    ethernet_interfaces: ethernetInterfaces,
    bridges: factory ? [] : [{ name: "bridge-lan", disabled: false, running: true }],
    bridge_ports: factory ? [] : ["ether2", "ether3", "ether4", "wifi1"].map((interfaceName) => ({
      interface: interfaceName,
      bridge: "bridge-lan",
      disabled: false,
      inactive: false,
      hw_offload: interfaceName !== "wifi1",
    })),
    ip_addresses: factory ? [] : [
      {
        address: "100.64.20.10/24",
        network: "100.64.20.0",
        interface: "ether1",
        actual_interface: "ether1",
        disabled: false,
        dynamic: true,
        invalid: false,
      },
      {
        address: "192.168.50.1/24",
        network: "192.168.50.0",
        interface: "bridge-lan",
        actual_interface: "bridge-lan",
        disabled: false,
        dynamic: false,
        invalid: false,
      },
    ],
    default_routes: factory ? [] : [{
      gateway: "100.64.20.1",
      immediate_gateway: "100.64.20.1%ether1",
      routing_table: "main",
      active: true,
      disabled: false,
      dynamic: true,
      distance: 1,
    }],
    structural_diagnostic: {
      checks: factory ? [] : [
        { key: "wifi", label: "Wi-Fi", status: "informational", summary: "Interface Wi-Fi disponível.", possible_causes: [] },
        { key: "bridge", label: "Bridge", status: "informational", summary: "Bridge existente detectada.", possible_causes: [] },
        { key: "management", label: "Gerenciamento", status: "informational", summary: "Endereços atuais carregados.", possible_causes: [] },
      ],
    },
  };
}

export function demoPing(target, count = 10) {
  return {
    target,
    sent: count,
    received: count,
    packet_loss_percent: 0,
    minimum_latency_ms: 1.7,
    average_latency_ms: 2.4,
    maximum_latency_ms: 3.1,
    samples_ms: [2.1, 2.5, 1.7, 2.6, 3.1],
    measurement_source: "orion_calculation",
    advanced_metrics: {
      source: "orion_network_engine",
      sent_packets: count,
      received_packets: count,
      packet_loss_percent: 0,
      availability_percent: 100,
      minimum_latency_ms: 1.7,
      average_latency_ms: 2.4,
      maximum_latency_ms: 3.1,
      jitter_ms: 0.75,
      p95_latency_ms: 3,
      p99_latency_ms: 3.08,
      latency_range_ms: 1.4,
      standard_deviation_ms: 0.46,
      tail_spread_ms: 0.68,
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

export function demoConfigurationPreview(configuration, connection) {
  const profile = demoProfile(connection);
  const currentIdentity = profile === "radio"
    ? "ORION-DEMO-STATION"
    : profile === "factory" ? "MikroTik" : "ORION-DEMO-ROUTER";
  const currentSsid = profile === "radio"
    ? "ORION-DEMO-LINK"
    : profile === "factory" ? "MikroTik" : "CLIENTES";
  const ordinaryChanges = [
    { area: "Equipamento", field: "Identidade", current_value: currentIdentity, new_value: configuration.identity, sensitive: false },
    { area: profile === "radio" ? "Rádio" : "Wi-Fi", field: "SSID", current_value: currentSsid, new_value: configuration.ssid, sensitive: false },
  ].filter((change) => change.current_value !== change.new_value);
  return {
    device_identity: currentIdentity,
    wifi_stack: "wifi",
    reconnect_ip: configuration.management_ip?.split("/")[0] || "192.168.50.1",
    changes: [
      ...ordinaryChanges,
      { area: "Segurança", field: "Senha WPA2", current_value: "Protegida", new_value: "Será atualizada", sensitive: true },
    ],
    warnings: ["Demonstração: nenhuma alteração será enviada a um equipamento."],
  };
}

export function demoBasicNetworkPreview(configuration, connection) {
  const factory = demoProfile(connection) === "factory";
  const configuringLan = configuration.configure_lan;
  const changes = [
    { area: "Equipamento", field: "Identidade", current_value: factory ? "MikroTik" : "ORION-DEMO-ROUTER", new_value: configuration.identity },
    { area: "WAN", field: "Endereçamento", current_value: factory ? "Não configurado" : "DHCP Client", new_value: configuration.wan_mode === "dhcp" ? "DHCP Client" : configuration.wan_address },
    ...(configuringLan ? [
      { area: "LAN", field: "Bridge", current_value: factory ? null : "bridge-lan", new_value: configuration.lan_bridge },
      { area: "LAN", field: "Endereço", current_value: factory ? null : "192.168.50.1/24", new_value: configuration.lan_address },
      { area: "LAN", field: "Portas", current_value: factory ? null : "ether2, ether3, ether4", new_value: configuration.lan_ports.join(", ") },
    ] : []),
    { area: "DNS", field: "Servidores", current_value: factory ? "Não configurado" : "1.1.1.1, 8.8.8.8", new_value: configuration.dns_servers.join(", ") },
    ...(configuringLan ? [
      { area: "Internet", field: "NAT", current_value: factory ? "Não configurado" : "Ativo", new_value: configuration.enable_nat ? "Ativar masquerade" : "Não configurar" },
      { area: "LAN", field: "DHCP Server", current_value: factory ? "Inativo" : "Ativo", new_value: configuration.enable_lan_dhcp ? "Ativar automaticamente" : "Não configurar" },
      ...(configuration.enable_lan_dhcp ? [{ area: "LAN", field: "Pool DHCP", current_value: factory ? null : "192.168.50.20-192.168.50.250", new_value: configuration.dhcp_pool_start && configuration.dhcp_pool_end ? `${configuration.dhcp_pool_start}-${configuration.dhcp_pool_end}` : "Calculado automaticamente" }] : []),
    ] : []),
    { area: "Serviços", field: "SSH", current_value: "Ativo", new_value: configuration.enable_ssh ? "Ativo" : "Desativado" },
    { area: "Serviços", field: "WinBox", current_value: "Ativo", new_value: configuration.enable_winbox ? "Ativo" : "Desativado" },
    { area: "Serviços", field: "WebFig HTTPS", current_value: "Desativado", new_value: configuration.enable_webfig_https ? "Ativo" : "Desativado" },
    { area: "Serviços", field: "Telnet", current_value: "Desativado", new_value: configuration.enable_telnet ? "Ativo" : "Desativado" },
    { area: "Serviços", field: "FTP", current_value: "Desativado", new_value: configuration.enable_ftp ? "Ativo" : "Desativado" },
    { area: "Serviços", field: "WebFig HTTP", current_value: "Desativado", new_value: configuration.enable_webfig_http ? "Ativo" : "Desativado" },
  ];
  return {
    device_identity: factory ? "MikroTik" : "ORION-DEMO-ROUTER",
    reconnect_ip: configuration.lan_address?.split("/")[0] || "192.168.50.1",
    changes: changes.filter((change) => change.current_value !== change.new_value),
    warnings: ["Demonstração: esta prévia não altera nenhum equipamento."],
  };
}

export function demoBasicNetworkCurrent(connection) {
  const factory = demoProfile(connection) === "factory";
  return {
    identity: factory ? "MikroTik" : "ORION-DEMO-ROUTER",
    wan_interface: "ether1",
    wan_mode: "dhcp",
    wan_address: null,
    gateway: null,
    configure_lan: !factory,
    lan_bridge: factory ? null : "bridge-lan",
    lan_address: factory ? null : "192.168.50.1/24",
    lan_ports: factory ? [] : ["ether2", "ether3", "ether4"],
    dns_servers: factory ? [] : ["1.1.1.1", "8.8.8.8"],
    enable_nat: !factory,
    enable_lan_dhcp: !factory,
    dhcp_pool_start: factory ? null : "192.168.50.20",
    dhcp_pool_end: factory ? null : "192.168.50.250",
    enable_ssh: true,
    enable_winbox: true,
    enable_webfig_https: false,
    enable_telnet: false,
    enable_ftp: false,
    enable_webfig_http: false,
  };
}
