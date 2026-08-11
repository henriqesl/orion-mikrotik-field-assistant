import { useEffect, useState } from "react";

import AssessmentBadge from "./AssessmentBadge.jsx";

function peerKey(peer, index) {
  return (
    peer.mac_address ||
    [peer.interface, peer.radio_name, peer.ssid].filter(Boolean).join(":") ||
    `peer-${index}`
  );
}

function peerName(peer) {
  return peer.radio_name || peer.ssid || peer.mac_address || "Peer sem identificação";
}

function signalPosition(signalDbm) {
  return Math.min(100, Math.max(0, ((signalDbm + 95) / 50) * 100));
}

function AlignmentMonitor({
  isAlignmentMode,
  isMonitoring,
  lastUpdatedAt,
  onToggleAlignment,
  peers,
  registrationTableAvailable,
}) {
  const [bestSignals, setBestSignals] = useState({});

  useEffect(() => {
    setBestSignals((current) => {
      const updated = { ...current };
      let changed = false;

      peers.forEach((peer, index) => {
        if (peer.signal_dbm === null) {
          return;
        }

        const key = peerKey(peer, index);

        if (updated[key] === undefined || peer.signal_dbm > updated[key]) {
          updated[key] = peer.signal_dbm;
          changed = true;
        }
      });

      return changed ? updated : current;
    });
  }, [peers]);

  return (
    <section className="alignment-card" aria-labelledby="alignment-title">
      <div className="section-heading alignment-heading">
        <div>
          <p className="card-kicker">Acompanhamento de campo</p>
          <h2 id="alignment-title">Alinhamento do rádio</h2>
          <p className="section-description">
            Compare o sinal atual com o melhor valor observado nesta sessão.
          </p>
        </div>
        <button
          className={isAlignmentMode ? "alignment-toggle alignment-toggle--active" : "alignment-toggle"}
          onClick={onToggleAlignment}
          type="button"
        >
          {isAlignmentMode ? "Encerrar alinhamento" : "Iniciar alinhamento"}
        </button>
      </div>

      <div className="alignment-status" aria-live="polite">
        <span
          aria-hidden="true"
          className={isMonitoring ? "monitoring-dot monitoring-dot--active" : "monitoring-dot"}
        />
        <span>
          {isAlignmentMode
            ? "Leitura rápida a cada 3 segundos"
            : isMonitoring
              ? "Leitura normal a cada 15 segundos"
              : "Atualizações pausadas"}
        </span>
        {lastUpdatedAt && (
          <small>
            Última leitura às {lastUpdatedAt.toLocaleTimeString("pt-BR")}
          </small>
        )}
      </div>

      {!registrationTableAvailable ? (
        <p className="empty-state">
          A tabela de associações não está disponível para acompanhar o sinal.
        </p>
      ) : peers.length === 0 ? (
        <p className="empty-state">
          Aguarde o rádio associar para iniciar o alinhamento.
        </p>
      ) : (
        <div className="alignment-list">
          {peers.map((peer, index) => {
            const key = peerKey(peer, index);
            const bestSignal = bestSignals[key] ?? peer.signal_dbm;
            const difference =
              peer.signal_dbm !== null && bestSignal !== null
                ? peer.signal_dbm - bestSignal
                : null;

            return (
              <article className="alignment-peer" key={key}>
                <header>
                  <div>
                    <strong>{peerName(peer)}</strong>
                    <span>{peer.mac_address || peer.interface || "Identificação não informada"}</span>
                  </div>
                  <AssessmentBadge assessment={peer.signal_assessment} />
                </header>

                <div className="alignment-values">
                  <div>
                    <span>Sinal atual</span>
                    <strong>
                      {peer.signal_dbm === null ? "Sem leitura" : `${peer.signal_dbm} dBm`}
                    </strong>
                  </div>
                  <div>
                    <span>Melhor da sessão</span>
                    <strong>{bestSignal === null ? "Sem leitura" : `${bestSignal} dBm`}</strong>
                  </div>
                  <div>
                    <span>Distância do melhor</span>
                    <strong>
                      {difference === null
                        ? "Sem leitura"
                        : difference === 0
                          ? "No melhor valor"
                          : `${difference} dB`}
                    </strong>
                  </div>
                </div>

                {peer.signal_dbm !== null && (
                  <div className="signal-scale" aria-hidden="true">
                    <div style={{ width: `${signalPosition(peer.signal_dbm)}%` }} />
                  </div>
                )}

                <p>{peer.signal_assessment.explanation}</p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default AlignmentMonitor;
