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
  return postJson("/api/mikrotik/discover", connection);
}

export function runPing(connection, target) {
  return postJson("/api/mikrotik/ping", {
    connection,
    target,
    count: 5,
  });
}

export function validateConnectivity(connection, remoteTarget) {
  return postJson("/api/mikrotik/connectivity", {
    connection,
    remote_target: remoteTarget || null,
  });
}

export function previewLinkConfiguration(connection, configuration) {
  return postJson("/api/mikrotik/configuration/preview", {
    connection,
    configuration,
  });
}

export function applyLinkConfiguration(connection, configuration) {
  return postJson("/api/mikrotik/configuration/apply", {
    connection,
    configuration,
    confirmation: "APLICAR",
  });
}
