import { useEffect, useState } from "react";
import { getAPLockState, scanAccessPoints } from "../services/api.js";

export default function AccessPointSelector({ connection, wifiInterface, action, bssid, busy, onChange, onSelect, onScanning, refreshKey }) {
  const [status, setStatus] = useState(null);
  const [points, setPoints] = useState(null);
  const [error, setError] = useState("");
  const [scanConsent, setScanConsent] = useState(false);
  const [scanning, setScanning] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setStatus(null); setPoints(null); setError(""); setScanConsent(false);
    getAPLockState(connection, wifiInterface).then((data) => { if (!cancelled) setStatus(data); }).catch((caught) => { if (!cancelled) setError(caught.message); });
    return () => { cancelled = true; };
  }, [connection, wifiInterface, refreshKey]);

  async function scan() {
    if (!scanConsent || scanning) return;
    setScanning(true); onScanning(true); setError(""); setPoints(null);
    try { setPoints((await scanAccessPoints(connection, wifiInterface)).access_points); }
    catch (caught) { setError(caught.message); }
    finally { setScanning(false); onScanning(false); }
  }

  const canLock = status?.supported && !status.external_rules;
  return <section className="ap-selector" aria-labelledby="ap-selector-title">
    <header className="section-heading"><div><p className="card-kicker">AP de destino</p><h3 id="ap-selector-title">Encontre o outro lado do enlace</h3></div><span className="preview-badge">{status?.locked_bssid ? "Lock detectado" : "Busca no rádio"}</span></header>
    <p className="section-description">Selecione a rede do AP; os dados entram no formulário para revisão, sem aplicar ainda.</p>
    <div className="ap-scan-actions">
      <label className="check-field"><input checked={scanConsent} disabled={busy || scanning} onChange={(event) => setScanConsent(event.target.checked)} type="checkbox" /><span>Estou conectado por cabo. A busca pode interromper o Wi-Fi.</span></label>
      <button className="secondary-button" disabled={!scanConsent || busy || scanning} onClick={scan} type="button">{scanning ? "Buscando APs…" : "Buscar APs"}</button>
    </div>
    {points?.length === 0 && <p role="status">Nenhum AP encontrado nesta busca. Confira antena, alcance e frequência; tente novamente ou informe o SSID manualmente.</p>}
    {points?.length > 0 && <div className="ap-results" role="list" aria-label="APs encontrados">{points.map((point) => <article className={bssid === point.bssid ? "ap-result ap-result--selected" : "ap-result"} key={point.bssid} role="listitem">
      <div><strong>{point.ssid || "SSID oculto"}</strong><code>{point.bssid}</code></div>
      <div className="ap-signal"><strong>{point.signal_dbm == null ? "—" : `${point.signal_dbm} dBm`}</strong><span>{point.frequency_mhz ? `${point.frequency_mhz} MHz` : "Canal não informado"}</span></div>
      <button disabled={busy} onClick={() => onSelect(point, Boolean(canLock))} type="button">{canLock ? "Selecionar e fixar" : "Selecionar rede"}</button>
    </article>)}</div>}
    <div className="ap-lock-controls">
      <label className="field"><span>Lock no AP (BSSID)</span><select disabled={busy || !status?.supported} name="ap_lock_action" onChange={onChange} value={action}>
        <option value="preserve">Manter configuração atual</option>
        <option disabled={!canLock} value="lock">Fixar somente no AP escolhido</option>
        <option disabled={!status?.managed} value="unlock">Remover lock criado pelo ORION</option>
      </select></label>
      {action === "lock" && <label className="field"><span>MAC do AP de destino</span><input autoComplete="off" maxLength="17" name="ap_bssid" onChange={onChange} placeholder="02:11:22:33:44:55" required value={bssid} /></label>}
    </div>
    {status?.locked_bssid && <p className="configuration-note">Lock atual: <code>{status.locked_bssid}</code></p>}
    {status && !status.supported && <p className="configuration-note">{status.reason}</p>}
    {status?.external_rules && <p className="configuration-note">Há regras de conexão personalizadas. Elas serão preservadas; alterações de lock exigem revisão no WinBox.</p>}
    {error && <div className="inline-error" role="alert">{error}</div>}
  </section>;
}
