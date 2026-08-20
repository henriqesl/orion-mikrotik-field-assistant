import { useEffect, useMemo, useState } from "react";

import { getInterfaceTraffic } from "../services/api.js";

const SAMPLE_INTERVAL_MS = 2_000;
const SAMPLE_WINDOW = 10;

function formatBits(value) {
  const amount = Number(value) || 0;
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)} Gbps`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} Mbps`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)} Kbps`;
  return `${amount} bps`;
}

function summarize(samples, key) {
  if (!samples.length) return { average: 0, peak: 0 };
  const values = samples.map((sample) => sample[key]);
  return {
    average: values.reduce((total, value) => total + value, 0) / values.length,
    peak: Math.max(...values),
  };
}

export default function TrafficMonitor({ connection, device, enabled }) {
  const interfaces = useMemo(() => [
    ...device.ethernet_interfaces,
    ...device.wifi_interfaces,
  ].filter((item, index, list) => (
    item.name && list.findIndex((candidate) => candidate.name === item.name) === index
  )), [device]);
  const preferred = interfaces.find((item) => item.running && !item.disabled) || interfaces[0];
  const [interfaceName, setInterfaceName] = useState(preferred?.name || "");
  const [samples, setSamples] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!interfaces.some((item) => item.name === interfaceName)) {
      setInterfaceName(preferred?.name || "");
    }
  }, [interfaceName, interfaces, preferred?.name]);

  useEffect(() => {
    if (!enabled || !interfaceName) return undefined;
    let cancelled = false;
    let timer;

    async function sample() {
      try {
        const result = await getInterfaceTraffic(connection, interfaceName);
        if (cancelled) return;
        setSamples((current) => [...current, result].slice(-SAMPLE_WINDOW));
        setError("");
      } catch (caught) {
        if (!cancelled) setError(caught.message);
      }
      if (!cancelled) timer = window.setTimeout(sample, SAMPLE_INTERVAL_MS);
    }

    setSamples([]);
    sample();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [connection, enabled, interfaceName]);

  const current = samples.at(-1);
  const rx = summarize(samples, "rx_bits_per_second");
  const tx = summarize(samples, "tx_bits_per_second");

  if (!interfaces.length) return null;

  return (
    <section className="traffic-monitor" aria-labelledby="traffic-title">
      <header>
        <div>
          <p className="card-kicker">Tráfego real</p>
          <h3 id="traffic-title">Uso atual da interface</h3>
        </div>
        <label className="field traffic-interface-select">
          <span>Interface</span>
          <select onChange={(event) => setInterfaceName(event.target.value)} value={interfaceName}>
            {interfaces.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select>
        </label>
      </header>
      <div className="traffic-values">
        <article>
          <span>Recebendo agora</span>
          <strong>{current ? formatBits(current.rx_bits_per_second) : "Lendo…"}</strong>
          <small>Média {formatBits(rx.average)} · pico {formatBits(rx.peak)}</small>
        </article>
        <article>
          <span>Enviando agora</span>
          <strong>{current ? formatBits(current.tx_bits_per_second) : "Lendo…"}</strong>
          <small>Média {formatBits(tx.average)} · pico {formatBits(tx.peak)}</small>
        </article>
      </div>
      <p className="traffic-caption">Mede o tráfego que está passando agora.</p>
      {error && <p className="traffic-error" role="status">Tráfego indisponível: {error}</p>}
    </section>
  );
}
