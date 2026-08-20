import {
  demoBasicNetworkPreview,
  demoBasicNetworkCurrent,
  demoConfigurationPreview,
  demoDevice,
  demoPing,
  isDemoConnection,
} from "./demo.js";
import { apiUrl, isDesktopRuntime } from "./runtime.js";

async function postJson(path, body) {
  let response;

  try {
    response = await fetch(apiUrl(path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      isDesktopRuntime()
        ? "Os serviços do ORION não responderam. Feche o aplicativo, abra novamente e tente outra vez."
        : "O backend do ORION não está disponível. Inicie o FastAPI e tente novamente.",
    );
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = typeof data?.detail === "string"
      ? data.detail.replace(/&#x20;|&nbsp;/gi, " ").trim()
      : data?.detail;
    throw new Error(
      message ||
        "Não foi possível concluir a comunicação com o backend do ORION.",
    );
  }

  return data;
}

async function getJson(path) {
  let response;
  try {
    response = await fetch(apiUrl(path));
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

export function openWinBox(macAddress, username, options = {}) {
  return postJson("/api/mikrotik/winbox/open", {
    mac_address: macAddress,
    username,
    executable_path: options.executablePath || null,
    try_blank_password: options.tryBlankPassword || false,
  });
}

export function discoverDevice(connection) {
  if (isDemoConnection(connection)) return Promise.resolve(demoDevice(connection));
  return postJson("/api/mikrotik/discover", connection);
}

export function runPing(connection, target, count = 10) {
  if (isDemoConnection(connection)) return Promise.resolve(demoPing(target, count));
  return postJson("/api/mikrotik/ping", {
    connection,
    target,
    count,
  });
}

export function previewLinkConfiguration(connection, configuration) {
  if (isDemoConnection(connection)) return Promise.resolve(demoConfigurationPreview(configuration, connection));
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
    return Promise.resolve(demoBasicNetworkPreview(configuration, connection));
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

export function previewLoraProtection(connection, configuration) {
  if (isDemoConnection(connection)) {
    const loraEnabled = configuration.enable_lns_watchdog || configuration.enable_lora_guard;
    return Promise.resolve({
      device_identity: "ORION-DEMO-LORA",
      lora_interface: "lora1",
      lora_status: "connected",
      changes: [
        { area: "LoRa", field: "Proteção da interface", current_value: "Não configurado", new_value: loraEnabled ? "Ativo" : "Inativo" },
        { area: "Dispositivo", field: "Reinício por falha de conectividade", current_value: "Não configurado", new_value: configuration.enable_device_reboot ? "Ativo" : "Inativo" },
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

export function getBasicNetworkCurrent(connection) {
  if (isDemoConnection(connection)) {
    return Promise.resolve(demoBasicNetworkCurrent(connection));
  }
  return postJson("/api/mikrotik/network/current", connection);
}

export function getInterfaceTraffic(connection, interfaceName) {
  if (isDemoConnection(connection)) {
    return Promise.resolve({
      interface: interfaceName,
      rx_bits_per_second: 18_400_000,
      tx_bits_per_second: 7_200_000,
      rx_packets_per_second: 2_140,
      tx_packets_per_second: 1_080,
      tx_queue_drops_per_second: 0,
    });
  }
  return postJson("/api/mikrotik/traffic", {
    connection,
    interface: interfaceName,
  });
}

export function getMacBootstrapAdapters() {
  return getJson("/api/mikrotik/mac-bootstrap/adapters");
}

export function previewMacBootstrap(payload) {
  return postJson("/api/mikrotik/mac-bootstrap/preview", payload);
}

export function applyMacBootstrap(payload) {
  return postJson("/api/mikrotik/mac-bootstrap/apply", {
    ...payload,
    confirmation: "APLICAR",
  });
}

export async function createSupportBundle(device, recentError) {
  const response = await fetch(apiUrl("/api/support/bundle"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device: device ? {
        identity: device.identity,
        model: device.model,
        routeros_version: device.routeros_version,
        architecture: device.architecture,
        wifi_stack: device.wifi_stack,
        compatibility_profile: device.compatibility?.profile_name || null,
        compatibility_level: device.compatibility?.support_level || null,
        radio_device: Boolean(device.radio_device),
        lora_available: Boolean(device.lora_available),
        wifi_interface_count: device.wifi_interfaces.length,
        ethernet_interface_count: device.ethernet_interfaces.length,
      } : null,
      recent_error: recentError || null,
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail || "Não foi possível gerar o pacote de suporte.");
  }

  const disposition = response.headers.get("Content-Disposition") || "";
  const filename = decodeURIComponent(
    disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1] || "orion-support.zip",
  );
  const blob = await response.blob();
  return { blob, filename };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
