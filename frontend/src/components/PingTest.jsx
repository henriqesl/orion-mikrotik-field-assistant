import { useState } from "react";

import { runPing } from "../services/api.js";
import AssessmentBadge from "./AssessmentBadge.jsx";

function formatLatency(value) {
  return value === null ? "Sem resposta" : `${value} ms`;
}

function formatDelta(value, suffix = "") {
  if (value === null) return "Sem dado";
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${rounded}${suffix}`;
}

function PingTest({ connection }) {
  const [target, setTarget] = useState("");
  const [sampleCount, setSampleCount] = useState(10);
  const [baseline, setBaseline] = useState(null);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage("");
    setResult(null);

    try {
      setResult(await runPing(connection, target, sampleCount));
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  const comparableBaseline = baseline?.target === result?.target ? baseline : null;
  const comparison = comparableBaseline && result ? [
    {
      label: "Latência média",
      value: result.average_latency_ms === null || comparableBaseline.average_latency_ms === null
        ? null
        : result.average_latency_ms - comparableBaseline.average_latency_ms,
      suffix: " ms",
      lowerIsBetter: true,
    },
    {
      label: "Perda",
      value: result.packet_loss_percent - comparableBaseline.packet_loss_percent,
      suffix: " p.p.",
      lowerIsBetter: true,
    },
    {
      label: "Jitter",
      value: result.advanced_metrics?.jitter_ms == null || comparableBaseline.advanced_metrics?.jitter_ms == null
        ? null
        : result.advanced_metrics.jitter_ms - comparableBaseline.advanced_metrics.jitter_ms,
      suffix: " ms",
      lowerIsBetter: true,
    },
    {
      label: "Estabilidade",
      value: result.advanced_metrics?.stability_score == null || comparableBaseline.advanced_metrics?.stability_score == null
        ? null
        : result.advanced_metrics.stability_score - comparableBaseline.advanced_metrics.stability_score,
      suffix: " pts",
      lowerIsBetter: false,
    },
  ] : null;

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
        <fieldset className="test-duration" disabled={isLoading}>
          <legend>Duração</legend>
          {[
            [10, "Rápido"],
            [30, "Estável"],
            [60, "Prolongado"],
          ].map(([count, label]) => (
            <label key={count}>
              <input
                checked={sampleCount === count}
                name="sample-count"
                onChange={() => setSampleCount(count)}
                type="radio"
              />
              <span>{label}<small>{count} amostras</small></span>
            </label>
          ))}
        </fieldset>
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
                  <dt>Variação</dt>
                  <dd>{formatLatency(result.advanced_metrics.standard_deviation_ms)}</dd>
                </div>
                <div>
                  <dt>Amplitude</dt>
                  <dd>{formatLatency(result.advanced_metrics.latency_range_ms)}</dd>
                </div>
                <div>
                  <dt>Cauda p99</dt>
                  <dd>{formatLatency(result.advanced_metrics.tail_spread_ms)}</dd>
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
              ? "Ping executado pelo MikroTik; métricas avançadas calculadas localmente."
              : result.measurement_source === "routeros_summary"
              ? "Métricas fornecidas pelo RouterOS."
              : "Métricas calculadas pelo ORION a partir das respostas."}
          </p>

          {comparison ? (
            <section className="test-comparison" aria-labelledby="comparison-title">
              <header>
                <div>
                  <span>Comparação da sessão</span>
                  <strong id="comparison-title">Resultado versus referência</strong>
                </div>
                <button className="text-button" onClick={() => setBaseline(result)} type="button">
                  Atualizar referência
                </button>
              </header>
              <div>
                {comparison.map((metric) => {
                  const improved = metric.value !== null && metric.value !== 0 &&
                    (metric.lowerIsBetter ? metric.value < 0 : metric.value > 0);
                  const worsened = metric.value !== null && metric.value !== 0 && !improved;
                  return (
                    <article className={improved ? "comparison-good" : worsened ? "comparison-bad" : ""} key={metric.label}>
                      <span>{metric.label}</span>
                      <strong>{formatDelta(metric.value, metric.suffix)}</strong>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : (
            <button className="baseline-button" onClick={() => setBaseline(result)} type="button">
              Salvar como referência para comparar
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default PingTest;
