import AssessmentBadge from "./AssessmentBadge.jsx";

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

function interfaceStatus(wifiInterface) {
  if (wifiInterface.disabled === true) {
    return "Desativada";
  }

  if (wifiInterface.running === true) {
    return "Ativa";
  }

  if (wifiInterface.running === false) {
    return "Sem enlace";
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
  device,
  isMonitoring,
  isRefreshing,
  lastUpdatedAt,
  monitoringError,
  onDisconnect,
  onRefresh,
  onToggleMonitoring,
}) {
  const radioAvailable = device.wifi_interfaces.length > 0;

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
          <button className="disconnect-button" onClick={onDisconnect} type="button">
            Desconectar
          </button>
        </div>
      </div>

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

      <div className={`wifi-heading${radioAvailable ? "" : " capability-heading--unavailable"}`}>
        <div>
          <p className="card-kicker">Rádio</p>
          <h3>Interfaces Wi-Fi</h3>
        </div>
        <div className="wifi-meta">
          {radioAvailable ? (
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
                {interfaceStatus(wifiInterface)}
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

      <div className={`wifi-heading peer-heading${radioAvailable ? "" : " capability-heading--unavailable"}`}>
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
                  <dt>Taxa TX</dt>
                  <dd>{peer.tx_rate || "Não informada"}</dd>
                </div>
                <div>
                  <dt>Taxa RX</dt>
                  <dd>{peer.rx_rate || "Não informada"}</dd>
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

      <div className={`wifi-heading diagnostic-heading${radioAvailable ? "" : " capability-heading--unavailable"}`}>
        <div>
          <p className="card-kicker">Diagnóstico estrutural</p>
          <h3>Caminho do enlace</h3>
        </div>
        {radioAvailable && (
          <span className="diagnostic-count">
            {device.structural_diagnostic.checks.length} verificações
          </span>
        )}
      </div>

      {radioAvailable ? (
        <div className="diagnostic-list">
          {device.structural_diagnostic.checks.map((check) => (
            <article
              className={`diagnostic-item diagnostic-item--${check.status}`}
              key={check.key}
            >
              <div className="diagnostic-item__header">
                <strong>{check.label}</strong>
                <span>{DIAGNOSTIC_LABELS[check.status]}</span>
              </div>
              <p>{check.summary}</p>
              {check.possible_causes.length > 0 && (
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
