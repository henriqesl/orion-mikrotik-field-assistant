import { useEffect, useRef, useState } from "react";

import AssessmentBadge from "./AssessmentBadge.jsx";

const MAX_HISTORY_POINTS = 120;
const CHART_MIN_SIGNAL = -95;
const CHART_MAX_SIGNAL = -45;

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
  return Math.min(100, Math.max(0, ((signalDbm - CHART_MIN_SIGNAL) / 50) * 100));
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function calculateStats(samples) {
  if (samples.length === 0) {
    return { best: null, worst: null, average: null };
  }

  const values = samples.map((sample) => sample.signal);
  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    best: Math.max(...values),
    worst: Math.min(...values),
    average: Math.round((total / values.length) * 10) / 10,
  };
}

function SignalHistoryChart({ samples }) {
  if (samples.length < 2) {
    return (
      <div className="signal-chart signal-chart--empty">
        Inicie o alinhamento e aguarde novas leituras.
      </div>
    );
  }

  const points = samples
    .map((sample, index) => {
      const x = (index / (samples.length - 1)) * 100;
      const boundedSignal = Math.min(CHART_MAX_SIGNAL, Math.max(CHART_MIN_SIGNAL, sample.signal));
      const y = 100 - ((boundedSignal - CHART_MIN_SIGNAL) / (CHART_MAX_SIGNAL - CHART_MIN_SIGNAL)) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className="signal-chart">
      <div className="signal-chart__labels" aria-hidden="true">
        <span>-45</span>
        <span>-70</span>
        <span>-95 dBm</span>
      </div>
      <svg
        aria-label={`Histórico com ${samples.length} leituras de sinal`}
        preserveAspectRatio="none"
        role="img"
        viewBox="0 0 100 100"
      >
        <defs>
          <linearGradient id="signal-line" x1="0" x2="1">
            <stop offset="0" stopColor="#2f7df6" />
            <stop offset="1" stopColor="#35d0e2" />
          </linearGradient>
        </defs>
        <line className="signal-chart__grid" x1="0" x2="100" y1="0" y2="0" />
        <line className="signal-chart__grid" x1="0" x2="100" y1="50" y2="50" />
        <line className="signal-chart__grid" x1="0" x2="100" y1="100" y2="100" />
        <polyline className="signal-chart__line" points={points} />
      </svg>
    </div>
  );
}

function AlignmentMonitor({
  isAlignmentMode,
  isMonitoring,
  lastUpdatedAt,
  onToggleAlignment,
  onSessionUpdate,
  peers,
  registrationTableAvailable,
}) {
  const [histories, setHistories] = useState({});
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioContextRef = useRef(null);
  const startedAtRef = useRef(null);
  const wasAlignmentModeRef = useRef(false);

  useEffect(() => {
    const justStarted = isAlignmentMode && !wasAlignmentModeRef.current;
    wasAlignmentModeRef.current = isAlignmentMode;

    if (justStarted) {
      setHistories({});
      setElapsedSeconds(0);
      startedAtRef.current = Date.now();
    }

    if (!isAlignmentMode) {
      startedAtRef.current = null;
      setAudioEnabled(false);
    }
  }, [isAlignmentMode]);

  useEffect(() => () => {
    audioContextRef.current?.close();
  }, []);

  useEffect(() => {
    if (!isAlignmentMode || !startedAtRef.current) {
      return undefined;
    }

    const updateElapsed = () => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1_000));
    };
    const timerId = window.setInterval(updateElapsed, 1_000);
    updateElapsed();

    return () => window.clearInterval(timerId);
  }, [isAlignmentMode]);

  useEffect(() => {
    if (!isAlignmentMode || !lastUpdatedAt) {
      return;
    }

    setHistories((current) => {
      const updated = { ...current };

      peers.forEach((peer, index) => {
        if (peer.signal_dbm === null) {
          return;
        }

        const key = peerKey(peer, index);
        const samples = updated[key] || [];
        const timestamp = lastUpdatedAt.getTime();

        if (samples.at(-1)?.timestamp === timestamp) {
          return;
        }

        updated[key] = [
          ...samples,
          { signal: peer.signal_dbm, timestamp },
        ].slice(-MAX_HISTORY_POINTS);
      });

      return updated;
    });
  }, [isAlignmentMode, lastUpdatedAt, peers]);

  useEffect(() => {
    const primaryPeer = peers.find((peer) => peer.signal_dbm !== null);

    if (!primaryPeer) {
      return;
    }

    const index = peers.indexOf(primaryPeer);
    const samples = histories[peerKey(primaryPeer, index)] || [];

    onSessionUpdate({
      duration_seconds: elapsedSeconds,
      finished: !isAlignmentMode && samples.length > 0,
      peer: peerName(primaryPeer),
      samples: samples.length,
      ...calculateStats(samples),
    });
  }, [elapsedSeconds, histories, isAlignmentMode, onSessionUpdate, peers]);

  useEffect(() => {
    if (!audioEnabled || !isAlignmentMode || !lastUpdatedAt) {
      return;
    }

    const signal = peers.find((peer) => peer.signal_dbm !== null)?.signal_dbm;
    const audioContext = audioContextRef.current;

    if (signal === undefined || !audioContext) {
      return;
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const normalized = signalPosition(signal) / 100;
    const now = audioContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.value = 420 + normalized * 880;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.15);
  }, [audioEnabled, isAlignmentMode, lastUpdatedAt, peers]);

  async function handleAudioToggle() {
    if (!audioEnabled) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;

      if (!AudioContext) {
        return;
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      await audioContextRef.current.resume();
    }

    setAudioEnabled((current) => !current);
  }

  return (
    <section className="alignment-card" aria-labelledby="alignment-title">
      <div className="section-heading alignment-heading">
        <div>
          <p className="card-kicker">Acompanhamento de campo</p>
          <h2 id="alignment-title">Alinhamento do rádio</h2>
          <p className="section-description">
            Histórico e estatísticas registrados durante esta sessão.
          </p>
        </div>
        <div className="alignment-controls">
          <button
            aria-pressed={audioEnabled}
            className={audioEnabled ? "audio-toggle audio-toggle--active" : "audio-toggle"}
            disabled={!isAlignmentMode}
            onClick={handleAudioToggle}
            type="button"
          >
            {audioEnabled ? "Som ligado" : "Ativar som"}
          </button>
          <button
            className={isAlignmentMode ? "alignment-toggle alignment-toggle--active" : "alignment-toggle"}
            onClick={onToggleAlignment}
            type="button"
          >
            {isAlignmentMode ? "Encerrar alinhamento" : "Iniciar alinhamento"}
          </button>
        </div>
      </div>

      <div className="alignment-status" aria-live="polite">
        <span
          aria-hidden="true"
          className={isMonitoring ? "monitoring-dot monitoring-dot--active" : "monitoring-dot"}
        />
        <span>
          {isAlignmentMode
            ? `Sessão ativa · ${formatDuration(elapsedSeconds)}`
            : isMonitoring
              ? "Pronto para iniciar"
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
            const samples = histories[key] || [];
            const stats = calculateStats(samples);

            return (
              <article className="alignment-peer" key={key}>
                <header>
                  <div>
                    <strong>{peerName(peer)}</strong>
                    <span>{peer.mac_address || peer.interface || "Identificação não informada"}</span>
                  </div>
                  <AssessmentBadge assessment={peer.signal_assessment} />
                </header>

                <div className="alignment-values alignment-values--session">
                  <div>
                    <span>Atual</span>
                    <strong>{peer.signal_dbm === null ? "Sem leitura" : `${peer.signal_dbm} dBm`}</strong>
                  </div>
                  <div>
                    <span>Melhor</span>
                    <strong>{stats.best === null ? "—" : `${stats.best} dBm`}</strong>
                  </div>
                  <div>
                    <span>Média</span>
                    <strong>{stats.average === null ? "—" : `${stats.average} dBm`}</strong>
                  </div>
                  <div>
                    <span>Pior</span>
                    <strong>{stats.worst === null ? "—" : `${stats.worst} dBm`}</strong>
                  </div>
                </div>

                <SignalHistoryChart samples={samples} />

                {peer.signal_dbm !== null && (
                  <div className="signal-scale" aria-hidden="true">
                    <div style={{ width: `${signalPosition(peer.signal_dbm)}%` }} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default AlignmentMonitor;
