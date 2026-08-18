import { useState } from "react";

import { runPing } from "../services/api.js";
import AssessmentBadge from "./AssessmentBadge.jsx";

function formatLatency(value) {
  return value === null ? "Sem resposta" : `${value} ms`;
}

function PingTest({ connection }) {
  const [target, setTarget] = useState("");
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage("");
    setResult(null);

    try {
      setResult(await runPing(connection, target));
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="diagnostic-card" aria-labelledby="ping-title">
      <div className="section-heading">
        <div>
          <p className="card-kicker">Diagnóstico básico</p>
          <h2 id="ping-title">Testar comunicação</h2>
        </div>
      </div>

      <form className="ping-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>IP do destino</span>
          <input
            inputMode="decimal"
            onChange={(event) => setTarget(event.target.value)}
            placeholder="Outro rádio, gateway ou internet"
            required
            value={target}
          />
        </label>
        <button className="primary-button" disabled={isLoading} type="submit">
          {isLoading ? "Testando…" : "Testar conexão"}
        </button>
      </form>

      {errorMessage && (
        <div className="inline-error" role="alert">
          {errorMessage}
        </div>
      )}

      {result && (
        <div className="ping-result" aria-live="polite">
          <header>
            <div>
              <span>Destino testado</span>
              <strong>{result.target}</strong>
            </div>
            <span
              className={
                result.received > 0
                  ? "ping-state ping-state--reachable"
                  : "ping-state"
              }
            >
              {result.received > 0 ? "Acessível" : "Sem resposta"}
            </span>
          </header>

          {result.link_health ? (
            <section className="health-panel" aria-labelledby="health-title">
              <div className="health-score">
                <strong>{result.link_health.score}</strong>
                <span>/100</span>
              </div>
              <div className="health-content">
                <p>Saúde do enlace</p>
                <h3 id="health-title">{result.link_health.status_label}</h3>
                <p>{result.link_health.summary}</p>
                <div className="health-recommendation">
                  <strong>Recomendação</strong>
                  <span>{result.link_health.recommendation}</span>
                </div>

                <details className="health-details">
                  <summary>Como a nota foi calculada</summary>
                  <div className="health-components">
                    {result.link_health.components.map((component) => (
                      <div key={component.metric}>
                        <div>
                          <strong>{component.label}</strong>
                          <span>Peso {component.weight}%</span>
                        </div>
                        <AssessmentBadge assessment={component.assessment} />
                        <span className="component-score">
                          {component.metric_score === null
                            ? "Sem dado"
                            : `${component.metric_score}/100`}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            </section>
          ) : result.link_health_unavailable_reason ? (
            <p className="health-unavailable">
              Nota geral indisponível: {result.link_health_unavailable_reason}
            </p>
          ) : null}

          <dl className="ping-metrics">
            <div>
              <dt>Perda</dt>
              <dd>{result.packet_loss_percent}%</dd>
              <div className="metric-assessment">
                <AssessmentBadge assessment={result.packet_loss_assessment} />
                <small>{result.packet_loss_assessment.explanation}</small>
              </div>
            </div>
            <div>
              <dt>Latência média</dt>
              <dd>{formatLatency(result.average_latency_ms)}</dd>
              <div className="metric-assessment">
                <AssessmentBadge
                  assessment={result.average_latency_assessment}
                />
                <small>{result.average_latency_assessment.explanation}</small>
              </div>
            </div>
            <div>
              <dt>Latência máxima</dt>
              <dd>{formatLatency(result.maximum_latency_ms)}</dd>
              <div className="metric-assessment">
                <AssessmentBadge
                  assessment={result.maximum_latency_assessment}
                />
                <small>{result.maximum_latency_assessment.explanation}</small>
              </div>
            </div>
            <div>
              <dt>Respostas</dt>
              <dd>
                {result.received}/{result.sent}
              </dd>
            </div>
            {result.advanced_metrics && (
              <>
                <div>
                  <dt>Jitter</dt>
                  <dd>{formatLatency(result.advanced_metrics.jitter_ms)}</dd>
                </div>
                <div>
                  <dt>p95</dt>
                  <dd>{formatLatency(result.advanced_metrics.p95_latency_ms)}</dd>
                </div>
                <div>
                  <dt>p99</dt>
                  <dd>{formatLatency(result.advanced_metrics.p99_latency_ms)}</dd>
                </div>
                <div>
                  <dt>Estabilidade</dt>
                  <dd>{result.advanced_metrics.stability_score}/100</dd>
                </div>
              </>
            )}
          </dl>

          <p className="measurement-source">
            {result.advanced_metrics
              ? "Ping executado pelo RouterOS; jitter, percentis e estabilidade calculados pelo ORION Network Engine."
              : result.measurement_source === "routeros_summary"
              ? "Métricas fornecidas pelo RouterOS."
              : "Métricas calculadas pelo ORION a partir das respostas."}
          </p>
        </div>
      )}
    </section>
  );
}

export default PingTest;
