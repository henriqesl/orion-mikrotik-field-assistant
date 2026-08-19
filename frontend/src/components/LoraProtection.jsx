import { useMemo, useState } from "react";

import { applyLoraProtection, previewLoraProtection } from "../services/api.js";

function initialForm(device) {
  return {
    enable_lns_watchdog: true,
    enable_lora_guard: true,
    enable_device_reboot: true,
    ping_target: "1.1.1.1",
    failure_threshold: 3,
    lora_interval: "30m",
    connectivity_interval: "10m",
  };
}

function Toggle({ checked, description, label, name, onChange }) {
  return (
    <label className="setting-toggle">
      <span><strong>{label}</strong><small>{description}</small></span>
      <input checked={checked} name={name} onChange={onChange} type="checkbox" />
      <span className="toggle-control"><i /></span>
    </label>
  );
}

function LoraProtection({ connection, device, onApplyStart, onApplied }) {
  const defaults = useMemo(() => initialForm(device), [device]);
  const [form, setForm] = useState(defaults);
  const [preview, setPreview] = useState(null);
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function clearReview() {
    setPreview(null);
    setResult(null);
    setConfirmation("");
    setError("");
  }

  function update(event) {
    const { checked, name, type, value } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
    clearReview();
  }

  function payload() {
    return { ...form, failure_threshold: Number(form.failure_threshold) };
  }

  async function review(event) {
    event.preventDefault();
    setBusy(true);
    clearReview();
    try {
      setPreview(await previewLoraProtection(connection, payload()));
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setError("");
    onApplyStart();
    try {
      setResult(await applyLoraProtection(connection, payload()));
      setPreview(null);
      setConfirmation("");
      await onApplied();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="configuration-card">
      <div className="section-heading">
        <div><p className="card-kicker">Proteção operacional</p><h2>Configuração LoRa</h2></div>
        <span className={device.demo_mode ? "preview-badge" : "write-badge"}>{device.demo_mode ? "Simulação" : "Altera o equipamento"}</span>
      </div>
      <p className="section-description">Monitora a interface LoRa e a conexão WAN do gateway sem substituir a configuração do servidor LoRaWAN.</p>

      <form className="configuration-form" onSubmit={review}>
        <fieldset className="network-options">
          <legend>Proteções automáticas</legend>
          <div className="lora-toggle-grid">
            <Toggle checked={form.enable_lns_watchdog} description="Reinicia o LoRa após uma nova queda do LNS" label="Desconexão LNS" name="enable_lns_watchdog" onChange={update} />
            <Toggle checked={form.enable_lora_guard} description="Reativa a interface se ela estiver desabilitada" label="Interface LoRa" name="enable_lora_guard" onChange={update} />
            <Toggle checked={form.enable_device_reboot} description="Reinicia o MikroTik após falhas consecutivas de conectividade" label="Reiniciar dispositivo" name="enable_device_reboot" onChange={update} />
          </div>
        </fieldset>

        <div className="configuration-grid">
          <label className="field"><span>Verificar LoRa a cada</span><select name="lora_interval" onChange={update} value={form.lora_interval}><option value="5m">5 minutos</option><option value="10m">10 minutos</option><option value="30m">30 minutos</option><option value="1h">1 hora</option></select></label>
          {form.enable_device_reboot && <>
            <label className="field"><span>IP para testar conexão</span><input name="ping_target" onChange={update} required value={form.ping_target} /></label>
            <label className="field"><span>Falhas antes de reiniciar</span><input max="10" min="1" name="failure_threshold" onChange={update} required type="number" value={form.failure_threshold} /></label>
            <label className="field"><span>Verificar conexão a cada</span><select name="connectivity_interval" onChange={update} value={form.connectivity_interval}><option value="1m">1 minuto</option><option value="5m">5 minutos</option><option value="10m">10 minutos</option><option value="30m">30 minutos</option></select></label>
          </>}
        </div>

        <button className="primary-button" disabled={busy} type="submit">{busy ? "Analisando…" : "Verificar compatibilidade e revisar"}</button>
      </form>

      {error && <div className="inline-error">{error}</div>}
      {preview && <section className="configuration-preview">
        <div className="lora-detected"><span>Interface detectada</span><strong>{preview.lora_interface}</strong><b>{preview.lora_status}</b></div>
        <p className="card-kicker">Nenhuma alteração aplicada</p><h3>Prévia das proteções</h3>
        <div className="change-list">{preview.changes.map((change, index) => <article key={`${change.field}-${index}`}><span>{change.area}</span><strong>{change.field}</strong><div><small>{change.current_value || "Não configurado"}</small><b>→</b><small>{change.new_value}</small></div></article>)}</div>
        <ul className="configuration-warnings">{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        {!device.demo_mode && <><label className="confirmation-field"><span>Digite <strong>APLICAR</strong> para confirmar</span><input onChange={(event) => setConfirmation(event.target.value)} value={confirmation} /></label><button className="danger-button" disabled={confirmation !== "APLICAR" || busy} onClick={apply} type="button">Criar backup e aplicar</button></>}
      </section>}
      {result && <div className="configuration-success"><strong>LoRa configurado</strong><span>{result.summary}</span><small>Backup: {result.backup_file}</small></div>}
    </section>
  );
}

export default LoraProtection;
