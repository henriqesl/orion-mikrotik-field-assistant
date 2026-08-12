import { useState } from "react";

import { validateConnectivity } from "../services/api.js";

const RESULT_LABELS = {
  approved: "Aprovado",
  attention: "Atenção",
  rejected: "Reprovado",
};

function evaluateInstallation(device, connectivity, requireInternet) {
  const failures = [];
  const warnings = [];
  const peer = device.wifi_peers.find((item) => item.authorized !== false);
  const failedStructural = device.structural_diagnostic.checks.filter(
    (check) => check.status === "failed",
  );
  const warningStructural = device.structural_diagnostic.checks.filter(
    (check) => check.status === "warning",
  );

  if (!peer) {
    failures.push("Nenhum peer autorizado foi encontrado no enlace.");
  }

  if (!connectivity.remote || connectivity.remote.status !== "passed") {
    failures.push("O outro rádio não respondeu ao teste de comunicação.");
  } else if ((connectivity.remote.packet_loss_percent ?? 0) > 5) {
    failures.push(
      `A comunicação com o outro rádio apresentou ${connectivity.remote.packet_loss_percent}% de perda.`,
    );
  } else if ((connectivity.remote.packet_loss_percent ?? 0) > 0) {
    warnings.push(
      `Foi observada perda de ${connectivity.remote.packet_loss_percent}% para o outro rádio.`,
    );
  }

  failedStructural.forEach((check) => failures.push(check.summary));
  warningStructural.forEach((check) => warnings.push(check.summary));

  if (peer?.signal_assessment?.status === "critical") {
    warnings.push("O sinal está crítico e oferece pouca margem operacional.");
  } else if (["weak", "attention"].includes(peer?.signal_assessment?.status)) {
    warnings.push("O sinal merece atenção, embora a comunicação esteja funcionando.");
  }

  if (requireInternet) {
    if (connectivity.gateway.status !== "passed") {
      failures.push("O gateway obrigatório não respondeu.");
    }
    if (connectivity.internet.status !== "passed") {
      failures.push("O acesso externo obrigatório não respondeu ao teste.");
    }
  }

  const status = failures.length > 0
    ? "rejected"
    : warnings.length > 0
      ? "attention"
      : "approved";

  return { failures, status, warnings };
}

function probeValue(probe) {
  if (!probe || probe.status === "unavailable") {
    return "Não avaliado";
  }

  if (probe.status === "failed") {
    return "Sem resposta";
  }

  const latency = probe.average_latency_ms === null
    ? "latência indisponível"
    : `${probe.average_latency_ms} ms`;
  return `${probe.packet_loss_percent}% perda · ${latency}`;
}

const DELIVERY_CHECKS = [
  ["cabling", "Cabos e conectores conferidos"],
  ["mounting", "Fixação e alinhamento concluídos"],
  ["sealing", "Vedação e aterramento conferidos"],
  ["identification", "Equipamentos identificados como AP e Station"],
];

function formatSessionDuration(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined) return "Não registrado";
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function InstallationValidation({ alignmentSession, connection, device }) {
  const [form, setForm] = useState({
    customer: "",
    location: "",
    remoteTarget: "",
    requireInternet: false,
    technician: "",
  });
  const [validation, setValidation] = useState(null);
  const [deliveryChecks, setDeliveryChecks] = useState(
    Object.fromEntries(DELIVERY_CHECKS.map(([key]) => [key, false])),
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  function updateField(event) {
    const { checked, name, type, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
    setValidation(null);
  }

  function updateDeliveryCheck(event) {
    const { checked, name } = event.target;
    setDeliveryChecks((current) => ({ ...current, [name]: checked }));
    setValidation(null);
  }

  async function handleValidation(event) {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    try {
      const connectivity = await validateConnectivity(connection, form.remoteTarget);
      const evaluation = evaluateInstallation(device, connectivity, form.requireInternet);
      const pendingChecks = DELIVERY_CHECKS.filter(([key]) => !deliveryChecks[key]);

      if (pendingChecks.length > 0) {
        evaluation.warnings.push(
          `${pendingChecks.length} item(ns) do checklist físico ainda não foram confirmados.`,
        );
        if (evaluation.status === "approved") evaluation.status = "attention";
      }
      setValidation({
        alignmentSession: alignmentSession ? { ...alignmentSession } : null,
        connectivity,
        evaluatedAt: new Date(),
        evaluation,
      });
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  const peer = device.wifi_peers.find((item) => item.authorized !== false);

  return (
    <section className="diagnostic-card installation-validation" aria-labelledby="installation-title">
      <div className="section-heading">
        <div>
          <p className="card-kicker">Encerramento da instalação</p>
          <h2 id="installation-title">Validação guiada</h2>
          <p className="section-description">
            Confirma associação, estrutura e comunicação antes da entrega.
          </p>
        </div>
      </div>

      <form className="installation-form" onSubmit={handleValidation}>
        <div className="installation-form__metadata">
          <label className="field">
            <span>Cliente (opcional)</span>
            <input name="customer" onChange={updateField} value={form.customer} />
          </label>
          <label className="field">
            <span>Local (opcional)</span>
            <input name="location" onChange={updateField} value={form.location} />
          </label>
          <label className="field">
            <span>Técnico (opcional)</span>
            <input name="technician" onChange={updateField} value={form.technician} />
          </label>
          <label className="field">
            <span>IP do outro rádio</span>
            <input
              inputMode="decimal"
              name="remoteTarget"
              onChange={updateField}
              placeholder="IP definido no projeto"
              required
              value={form.remoteTarget}
            />
          </label>
        </div>

        <label className="internet-requirement">
          <input
            checked={form.requireInternet}
            name="requireInternet"
            onChange={updateField}
            type="checkbox"
          />
          <span>
            <strong>Esta instalação exige gateway e internet</strong>
            <small>Deixe desmarcado para um enlace isolado.</small>
          </span>
        </label>

        <fieldset className="delivery-checklist">
          <legend>Checklist físico</legend>
          {DELIVERY_CHECKS.map(([key, label]) => (
            <label key={key}>
              <input
                checked={deliveryChecks[key]}
                name={key}
                onChange={updateDeliveryCheck}
                type="checkbox"
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>

        <button className="primary-button" disabled={isLoading} type="submit">
          {isLoading ? "Executando validação…" : "Validar instalação"}
        </button>
      </form>

      {errorMessage && <div className="inline-error" role="alert">{errorMessage}</div>}

      {validation && (
        <article className={`installation-report installation-report--${validation.evaluation.status}`}>
          <header className="installation-report__header">
            <div>
              <p>Resultado da instalação</p>
              <h3>{RESULT_LABELS[validation.evaluation.status]}</h3>
            </div>
            <span>{validation.evaluatedAt.toLocaleString("pt-BR")}</span>
          </header>

          <div className="report-identification">
            <div><span>Equipamento</span><strong>{device.identity}</strong></div>
            <div><span>Modelo</span><strong>{device.model || "Não informado"}</strong></div>
            <div><span>Cliente</span><strong>{form.customer || "Não informado"}</strong></div>
            <div><span>Local</span><strong>{form.location || "Não informado"}</strong></div>
            <div><span>Técnico</span><strong>{form.technician || "Não informado"}</strong></div>
            <div><span>Outro rádio</span><strong>{form.remoteTarget}</strong></div>
          </div>

          <div className="report-checks">
            <div>
              <span>Associação</span>
              <strong>{peer ? "Peer autorizado" : "Sem peer autorizado"}</strong>
            </div>
            <div>
              <span>Sinal</span>
              <strong>{peer?.signal_dbm === null || peer?.signal_dbm === undefined ? "Sem leitura" : `${peer.signal_dbm} dBm`}</strong>
            </div>
            <div>
              <span>Outro rádio</span>
              <strong>{probeValue(validation.connectivity.remote)}</strong>
            </div>
            <div>
              <span>Gateway</span>
              <strong>{probeValue(validation.connectivity.gateway)}</strong>
            </div>
            <div>
              <span>Internet</span>
              <strong>{probeValue(validation.connectivity.internet)}</strong>
            </div>
            <div>
              <span>Sessão de alinhamento</span>
              <strong>
                {validation.alignmentSession
                  ? `${formatSessionDuration(validation.alignmentSession.duration_seconds)} · ${validation.alignmentSession.samples} leituras`
                  : "Não registrada"}
              </strong>
            </div>
            <div>
              <span>Sinal da sessão</span>
              <strong>
                {validation.alignmentSession?.samples
                  ? `${validation.alignmentSession.best} / ${validation.alignmentSession.average} / ${validation.alignmentSession.worst} dBm`
                  : "Não registrado"}
              </strong>
            </div>
          </div>

          <div className="report-delivery-checklist">
            {DELIVERY_CHECKS.map(([key, label]) => (
              <div key={key}>
                <span>{deliveryChecks[key] ? "✓" : "—"}</span>
                <strong>{label}</strong>
              </div>
            ))}
          </div>

          {(validation.evaluation.failures.length > 0 || validation.evaluation.warnings.length > 0) && (
            <div className="report-findings">
              {validation.evaluation.failures.map((finding) => (
                <p className="report-finding report-finding--failed" key={finding}>{finding}</p>
              ))}
              {validation.evaluation.warnings.map((finding) => (
                <p className="report-finding report-finding--warning" key={finding}>{finding}</p>
              ))}
            </div>
          )}

          {validation.evaluation.status === "approved" && (
            <p className="report-approved-message">
              Associação, estrutura e comunicação aprovadas para o perfil selecionado.
            </p>
          )}

          <button className="report-print-button" onClick={() => window.print()} type="button">
            Imprimir ou salvar em PDF
          </button>
        </article>
      )}
    </section>
  );
}

export default InstallationValidation;
