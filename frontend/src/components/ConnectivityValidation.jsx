import { useState } from "react";

import { validateConnectivity } from "../services/api.js";

const STATUS_LABELS = {
  passed: "Acessível",
  failed: "Sem resposta",
  unavailable: "Não avaliado",
};

function probeDetails(probe) {
  if (probe.sent === null) {
    return probe.target || "Destino não identificado";
  }

  const latency =
    probe.average_latency_ms === null
      ? "sem latência medida"
      : `média ${probe.average_latency_ms} ms`;
  return `${probe.received}/${probe.sent} respostas · perda ${probe.packet_loss_percent}% · ${latency}`;
}

function ConnectivityValidation({ connection }) {
  const [result, setResult] = useState(null);
  const [remoteTarget, setRemoteTarget] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleValidation(event) {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    try {
      setResult(await validateConnectivity(connection, remoteTarget));
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  const checks = result
    ? [
        {
          key: "gateway",
          label: "Gateway",
          status: result.gateway.status,
          summary: result.gateway.summary,
          details: probeDetails(result.gateway),
        },
        ...(result.remote
          ? [
              {
                key: "remote",
                label: "Outro rádio",
                status: result.remote.status,
                summary: result.remote.summary,
                details: probeDetails(result.remote),
              },
            ]
          : []),
        {
          key: "arp",
          label: "Resolução ARP",
          status: result.arp.status,
          summary: result.arp.summary,
          details: result.arp.mac_address
            ? `${result.arp.mac_address} · ${result.arp.interface || "interface não informada"}`
            : result.arp.ip_address || "Gateway não identificado",
        },
        {
          key: "internet",
          label: "Internet (teste ICMP)",
          status: result.internet.status,
          summary: result.internet.summary,
          details: probeDetails(result.internet),
        },
      ]
    : [];

  return (
    <section className="diagnostic-card" aria-labelledby="connectivity-title">
      <div className="section-heading">
        <div>
          <p className="card-kicker">Validação final</p>
          <h2 id="connectivity-title">Gateway e internet</h2>
          <p className="section-description">
            Executa três pings para o gateway detectado e para 1.1.1.1.
          </p>
        </div>
      </div>

      <form className="connectivity-form" onSubmit={handleValidation}>
        <label className="field">
          <span>IP do outro rádio (opcional)</span>
          <input
            inputMode="decimal"
            onChange={(event) => setRemoteTarget(event.target.value)}
            placeholder="Ex.: 192.168.88.2"
            value={remoteTarget}
          />
        </label>
        <button className="validation-button" disabled={isLoading} type="submit">
          {isLoading
            ? "Validando…"
            : result
              ? "Executar novamente"
              : "Validar conectividade"}
        </button>
      </form>

      {errorMessage && (
        <div className="inline-error" role="alert">
          {errorMessage}
        </div>
      )}

      {result && (
        <div className="connectivity-results" aria-live="polite">
          {checks.map((check) => (
            <article
              className={`connectivity-check connectivity-check--${check.status}`}
              key={check.key}
            >
              <header>
                <strong>{check.label}</strong>
                <span>{STATUS_LABELS[check.status]}</span>
              </header>
              <p>{check.summary}</p>
              <small>{check.details}</small>
            </article>
          ))}
        </div>
      )}

    </section>
  );
}

export default ConnectivityValidation;
