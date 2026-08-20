import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";

import { createSupportBundle, downloadBlob } from "../services/api.js";
import { isDesktopRuntime } from "../services/runtime.js";
import AssessmentBadge from "./AssessmentBadge.jsx";
import TrafficMonitor from "./TrafficMonitor.jsx";

const DEVICE_FIELDS = [
  ["Identidade", "identity"],
  ["Modelo", "model"],
  ["RouterOS", "routeros_version"],
  ["Arquitetura", "architecture"],
];

const STACK_LABELS = {
  wifi: "WiFi moderno",
  wifiwave2: "WiFiWave2",
  wireless: "Wireless legado",
  not_detected: "Não detectado",
};

const DIAGNOSTIC_LABELS = {
  passed: "Tudo certo",
  warning: "Atenção",
  failed: "Verificar",
  unavailable: "Não avaliado",
};

const GENERIC_DIAGNOSTIC_LABELS = {
  passed: "Detectado",
  warning: "Não detectado",
  failed: "Não detectado",
  unavailable: "Não avaliado",
};

function interfaceStatus(wifiInterface, radioDevice) {
  if (wifiInterface.disabled === true) {
    return "Desativada";
  }

  if (wifiInterface.running === true) {
    return "Ativa";
  }

  if (wifiInterface.running === false) {
    return radioDevice ? "Sem enlace" : "Inativa";
  }

  return "Estado não informado";
}

function radioModeLabel(mode) {
  const labels = {
    ap: "AP",
    "ap-bridge": "AP",
    bridge: "AP em bridge",
    station: "Station",
    "station-bridge": "Station bridge",
    "station-pseudobridge": "Station pseudobridge",
    "station-wds": "Station WDS",
  };

  return labels[mode] || mode || "Não informado";
}

function formatFrequency(frequency) {
  if (!frequency) {
    return "Não informada";
  }

  return /^\d+$/.test(frequency) ? `${frequency} MHz` : frequency;
}

function formatChannelValue(value) {
  return value ? value.replaceAll("mhz", " MHz") : "Não informada";
}

function formatBitRate(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value || "Não informada";
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)} Gbps`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} Mbps`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)} Kbps`;
  return `${amount} bps`;
}

function peerName(peer) {
  return peer.radio_name || peer.ssid || peer.mac_address || "Peer sem identificação";
}

function formatUpdateTime(value) {
  if (!value) {
    return "Aguardando primeira leitura";
  }

  return `Atualizado às ${value.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}`;
}

function DeviceSummary({
  connection,
  device,
  isActive,
  isMonitoring,
  isRefreshing,
  lastUpdatedAt,
  monitoringError,
  onRefresh,
  onToggleMonitoring,
}) {
  const wifiAvailable = device.wifi_interfaces.length > 0;
  const radioDevice = Boolean(device.radio_device);
  const [supportStatus, setSupportStatus] = useState("");
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);

  async function handleSupportBundle() {
    setDiagnosticBusy(true);
    setSupportStatus("");
    try {
      const { blob, filename } = await createSupportBundle(device, monitoringError);
      if (!isDesktopRuntime()) {
        downloadBlob(blob, filename);
        setSupportStatus(`${filename} exportado com sucesso.`);
        setDiagnosticOpen(false);
        return;
      }

      const path = await saveDialog({
        defaultPath: filename,
        title: "Salvar diagnóstico do ORION",
        filters: [{ name: "Diagnóstico ORION", extensions: ["zip"] }],
      });
      if (!path) return;

      const contents = Array.from(new Uint8Array(await blob.arrayBuffer()));
      await invoke("save_diagnostic_file", { path, contents });
      setSupportStatus(`Diagnóstico salvo em ${path}`);
      setDiagnosticOpen(false);
    } catch (error) {
      setSupportStatus(error.message);
    } finally {
      setDiagnosticBusy(false);
    }
  }

  return (
    <section className="device-card" aria-labelledby="device-title">
      <div className="section-heading">
        <div>
          <p className="card-kicker">Dados reais do RouterOS</p>
          <h2 id="device-title">Equipamento identificado</h2>
        </div>
        <span className="success-badge">Conectado</span>
      </div>

      <div className="monitoring-bar" aria-live="polite">
        <div>
          <span
            className={
              isMonitoring
                ? "monitoring-dot monitoring-dot--active"
                : "monitoring-dot"
            }
            aria-hidden="true"
          />
          <div>
            <strong>
              {isMonitoring ? "Monitoramento automático" : "Monitoramento pausado"}
            </strong>
            <span>
              {isRefreshing ? "Atualizando agora…" : formatUpdateTime(lastUpdatedAt)}
            </span>
          </div>
        </div>
        <div className="monitoring-actions">
          <button disabled={isRefreshing} onClick={onRefresh} type="button">
            Atualizar agora
          </button>
          <button onClick={onToggleMonitoring} type="button">
            {isMonitoring ? "Pausar" : "Retomar"}
          </button>
          <button onClick={() => setDiagnosticOpen(true)} type="button">
            Exportar diagnóstico
          </button>
        </div>
      </div>

      {supportStatus && <p className="support-status" role="status">{supportStatus}</p>}

      {diagnosticOpen && (
        <div className="diagnostic-modal-backdrop" onMouseDown={() => !diagnosticBusy && setDiagnosticOpen(false)}>
          <section
            aria-labelledby="diagnostic-modal-title"
            aria-modal="true"
            className="diagnostic-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="diagnostic-modal__mark" aria-hidden="true">OR</div>
            <div>
              <p className="card-kicker">Diagnóstico técnico</p>
              <h3 id="diagnostic-modal-title">Exportar dados para análise</h3>
              <p>
                O ORION criará um arquivo protegido contra exposição de senha,
                endereços IP e MAC. Escolha onde deseja salvá-lo.
              </p>
            </div>
            <div className="diagnostic-modal__actions">
              <button disabled={diagnosticBusy} onClick={() => setDiagnosticOpen(false)} type="button">
                Cancelar
              </button>
              <button className="primary-button" disabled={diagnosticBusy} onClick={handleSupportBundle} type="button">
                {diagnosticBusy ? "Preparando…" : "Escolher local e salvar"}
              </button>
            </div>
          </section>
        </div>
      )}

      {monitoringError && (
        <div className="monitoring-warning" role="alert">
          <strong>A última atualização falhou.</strong>
          <span>{monitoringError} Os dados anteriores continuam visíveis.</span>
        </div>
      )}

      <dl className="device-grid">
        {DEVICE_FIELDS.map(([label, key]) => (
          <div className="device-field" key={key}>
            <dt>{label}</dt>
            <dd>{device[key] || "Não informado pelo equipamento"}</dd>
          </div>
        ))}
      </dl>

      {device.compatibility && (
        <section className="compatibility-card" aria-labelledby="compatibility-title">
          <div>
            <span>Catálogo local</span>
            <strong id="compatibility-title">{device.compatibility.profile_name}</strong>
            <small>
              {device.compatibility.support_level === "recognized"
                ? "Família reconhecida pelo ORION"
                : "Modo genérico baseado nas capacidades do RouterOS"}
            </small>
          </div>
          <ul>
            {device.compatibility.guidance.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      )}

      <TrafficMonitor connection={connection} device={device} enabled={isActive} />

      <div className={`wifi-heading${wifiAvailable ? "" : " capability-heading--unavailable"}`}>
        <div>
          <p className="card-kicker">{radioDevice ? "Rádio" : "Wi-Fi"}</p>
          <h3>Interfaces Wi-Fi</h3>
        </div>
        <div className="wifi-meta">
          {wifiAvailable ? (
            <>
              <span>{STACK_LABELS[device.wifi_stack]}</span>
              <span>{device.wifi_package || "Pacote não informado"}</span>
            </>
          ) : (
            <span>Indisponível neste equipamento</span>
          )}
        </div>
      </div>

      {device.wifi_interfaces.length > 0 ? (
        <div className="interface-list">
          {device.wifi_interfaces.map((wifiInterface, index) => (
            <article
              className="interface-card"
              key={wifiInterface.name || wifiInterface.mac_address || index}
            >
              <div>
                <strong>{wifiInterface.name || "Interface sem nome"}</strong>
                <span>{wifiInterface.mac_address || "MAC não informado"}</span>
              </div>
              <span
                className={
                  wifiInterface.running && !wifiInterface.disabled
                    ? "interface-state interface-state--active"
                    : "interface-state"
                }
              >
                {interfaceStatus(wifiInterface, radioDevice)}
              </span>
              <dl className="radio-configuration">
                <div>
                  <dt>Função</dt>
                  <dd title={wifiInterface.mode || undefined}>
                    {radioModeLabel(wifiInterface.mode)}
                  </dd>
                </div>
                <div>
                  <dt>SSID</dt>
                  <dd>{wifiInterface.ssid || "Não informado"}</dd>
                </div>
                <div>
                  <dt>Frequência configurada</dt>
                  <dd>{formatFrequency(wifiInterface.frequency)}</dd>
                </div>
                <div>
                  <dt>Largura configurada</dt>
                  <dd>{formatChannelValue(wifiInterface.channel_width)}</dd>
                </div>
                <div>
                  <dt>Banda</dt>
                  <dd>{wifiInterface.band || "Não informada"}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state">
          Nenhuma interface Wi-Fi foi informada pelo equipamento.
        </p>
      )}

      <div className={`wifi-heading peer-heading${wifiAvailable ? "" : " capability-heading--unavailable"}`}>
        <div>
          <p className="card-kicker">Registration table</p>
          <h3>Equipamentos associados</h3>
        </div>
        {device.registration_table_available && (
          <span className="live-badge">Leitura atual</span>
        )}
      </div>

      {!device.registration_table_available ? (
        <p className="empty-state">
          A registration table não está disponível neste equipamento ou para
          este usuário.
        </p>
      ) : device.wifi_peers.length === 0 ? (
        <p className="empty-state">Nenhum equipamento está associado agora.</p>
      ) : (
        <div className="peer-list">
          {device.wifi_peers.map((peer, index) => (
            <article
              className="peer-card"
              key={`${peer.mac_address || "peer"}-${index}`}
            >
              <header className="peer-header">
                <div>
                  <strong>{peerName(peer)}</strong>
                  <span>
                    {[peer.interface, peer.mac_address].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <AssessmentBadge assessment={peer.association_assessment} />
              </header>

              <dl className="peer-metrics">
                <div>
                  <dt>Sinal recebido</dt>
                  <dd>
                    {peer.signal_dbm !== null
                      ? `${peer.signal_dbm} dBm`
                      : "Não informado"}
                  </dd>
                  <div className="metric-assessment">
                    <AssessmentBadge assessment={peer.signal_assessment} />
                    <small>{peer.signal_assessment.explanation}</small>
                  </div>
                </div>
                <div>
                  <dt>Taxa negociada TX</dt>
                  <dd title="Velocidade negociada do enlace; não representa o tráfego atual.">
                    {formatBitRate(peer.tx_rate)}
                  </dd>
                </div>
                <div>
                  <dt>Taxa negociada RX</dt>
                  <dd title="Velocidade negociada do enlace; não representa o tráfego atual.">
                    {formatBitRate(peer.rx_rate)}
                  </dd>
                </div>
                <div>
                  <dt>Tempo conectado</dt>
                  <dd>{peer.uptime || "Não informado"}</dd>
                </div>
              </dl>

              {(peer.band || peer.last_activity) && (
                <footer className="peer-details">
                  {peer.band && <span>Banda: {peer.band}</span>}
                  {peer.last_activity && (
                    <span>Última atividade: {peer.last_activity}</span>
                  )}
                </footer>
              )}
            </article>
          ))}
        </div>
      )}

      <div className={`wifi-heading diagnostic-heading${wifiAvailable ? "" : " capability-heading--unavailable"}`}>
        <div>
          <p className="card-kicker">Diagnóstico estrutural</p>
          <h3>{radioDevice ? "Caminho do enlace" : "Estrutura detectada"}</h3>
        </div>
        {wifiAvailable && (
          <span className="diagnostic-count">
            {device.structural_diagnostic.checks.length} {radioDevice ? "verificações" : "observações"}
          </span>
        )}
      </div>

      {wifiAvailable ? (
        <div className="diagnostic-list">
          {device.structural_diagnostic.checks.map((check) => (
            <article
              className={`diagnostic-item diagnostic-item--${radioDevice ? check.status : "informational"}`}
              key={check.key}
            >
              <div className="diagnostic-item__header">
                <strong>{check.label}</strong>
                <span>{(radioDevice ? DIAGNOSTIC_LABELS : GENERIC_DIAGNOSTIC_LABELS)[check.status]}</span>
              </div>
              <p>{check.summary}</p>
              {radioDevice && check.possible_causes.length > 0 && (
                <small>{check.possible_causes.join(" ")}</small>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state capability-empty-state">
          Diagnóstico de enlace desativado porque nenhuma interface de rádio foi detectada.
        </p>
      )}
    </section>
  );
}

export default DeviceSummary;
