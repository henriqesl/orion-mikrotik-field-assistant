import {
  demoBasicNetworkPreview,
  demoConfigurationPreview,
  demoDevice,
  demoPing,
  isDemoConnection,
} from "./demo.js";

async function postJson(path, body) {
  let response;

  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "O backend do ORION não está disponível. Inicie o FastAPI e tente novamente.",
    );
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.detail ||
        "Não foi possível concluir a comunicação com o backend do ORION.",
    );
  }

  return data;
}

async function getJson(path) {
  let response;
  try {
    response = await fetch(path);
  } catch {
    throw new Error("A descoberta local ainda não está disponível.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.detail || "Não foi possível consultar a rede local.");
  }
  return data;
}

export function discoverLanDevices() {
  return getJson("/api/mikrotik/lan-devices");
}

export function openWinBox(macAddress, username) {
  return postJson("/api/mikrotik/winbox/open", {
    mac_address: macAddress,
    username,
  });
}

export function generateBootstrap(interfaceName, address) {
  return postJson("/api/mikrotik/bootstrap", {
    interface_name: interfaceName,
    address,
  });
}

export function discoverDevice(connection) {
  if (isDemoConnection(connection)) return Promise.resolve(demoDevice());
  return postJson("/api/mikrotik/discover", connection);
}

export function runPing(connection, target) {
  if (isDemoConnection(connection)) return Promise.resolve(demoPing(target));
  return postJson("/api/mikrotik/ping", {
    connection,
    target,
    count: 5,
  });
}

export function previewLinkConfiguration(connection, configuration) {
  if (isDemoConnection(connection)) return Promise.resolve(demoConfigurationPreview(configuration));
  return postJson("/api/mikrotik/configuration/preview", {
    connection,
    configuration,
  });
}

export function applyLinkConfiguration(connection, configuration) {
  if (isDemoConnection(connection)) {
    return Promise.reject(new Error("O modo demonstração não aplica configurações."));
  }
  return postJson("/api/mikrotik/configuration/apply", {
    connection,
    configuration,
    confirmation: "APLICAR",
  });
}

export function validateConnectivity(connection) {
  return postJson("/api/mikrotik/connectivity", {
    connection,
    remote_target: null,
  });
}

export function previewBasicNetwork(connection, configuration) {
  if (isDemoConnection(connection)) {
    return Promise.resolve(demoBasicNetworkPreview(configuration));
  }
  return postJson("/api/mikrotik/network/preview", {
    connection,
    configuration,
  });
}

export function applyBasicNetwork(connection, configuration) {
  if (isDemoConnection(connection)) {
    return Promise.reject(new Error("O modo demonstração não aplica configurações."));
  }
  return postJson("/api/mikrotik/network/apply", {
    connection,
    configuration,
    confirmation: "APLICAR",
  });
}

export function previewVlan(connection, configuration) {
  if (isDemoConnection(connection)) {
    return Promise.resolve({
      device_identity: "ORION-DEMO-STATION",
      changes: [
        { area: "VLAN", field: "ID", current_value: null, new_value: String(configuration.vlan_id) },
        { area: "VLAN", field: "Endereço", current_value: null, new_value: configuration.address },
        { area: "Portas", field: "Tagged", current_value: null, new_value: [configuration.bridge, ...configuration.tagged_ports].join(", ") },
        { area: "Portas", field: "Untagged", current_value: null, new_value: configuration.untagged_ports.join(", ") || "Nenhuma" },
      ],
      warnings: ["Demonstração: nenhuma alteração será aplicada."],
    });
  }
  return postJson("/api/mikrotik/vlan/preview", { connection, configuration });
}

export function applyVlan(connection, configuration) {
  if (isDemoConnection(connection)) return Promise.reject(new Error("O modo demonstração não aplica configurações."));
  return postJson("/api/mikrotik/vlan/apply", { connection, configuration, confirmation: "APLICAR" });
}

export function previewLoraProtection(connection, configuration) {
  if (isDemoConnection(connection)) {
    const loraEnabled = configuration.enable_lns_watchdog || configuration.enable_lora_guard;
    return Promise.resolve({
      device_identity: "ORION-DEMO-LORA",
      lora_interface: "lora1",
      lora_status: "connected",
      changes: [
        { area: "LoRa", field: "Proteção da interface", current_value: "Não configurado", new_value: loraEnabled ? "Ativo" : "Inativo" },
        { area: "WAN", field: "Watchdog de conectividade", current_value: "Não configurado", new_value: configuration.enable_wan_watchdog ? "Ativo" : "Inativo" },
      ],
      warnings: ["Demonstração: nenhuma alteração será aplicada."],
    });
  }
  return postJson("/api/mikrotik/lora/preview", { connection, configuration });
}

export function applyLoraProtection(connection, configuration) {
  if (isDemoConnection(connection)) return Promise.reject(new Error("O modo demonstração não aplica configurações."));
  return postJson("/api/mikrotik/lora/apply", { connection, configuration, confirmation: "APLICAR" });
}
