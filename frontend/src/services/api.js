import {
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
