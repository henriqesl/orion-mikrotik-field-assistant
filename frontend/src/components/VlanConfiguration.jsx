import { useMemo, useState } from "react";

import { applyVlan, previewVlan } from "../services/api.js";

function initialForm(device) {
  const bridge = device.bridges.find((item) => !item.disabled)?.name || "";
  return {
    name: "vlan-120", vlan_id: 120, bridge, address: "10.120.0.1/24",
    tagged_ports: [], untagged_ports: [], enable_dhcp: true,
    dhcp_pool_start: "", dhcp_pool_end: "", dns_servers: "1.1.1.1, 8.8.8.8",
    enable_filtering: false,
  };
}

function VlanConfiguration({ connection, device, onApplyStart, onApplied }) {
  const defaults = useMemo(() => initialForm(device), [device]);
  const [form, setForm] = useState(defaults);
  const [preview, setPreview] = useState(null);
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ports = device.bridge_ports.filter((item) => item.bridge === form.bridge && !item.disabled);

  function resetReview() { setPreview(null); setResult(null); setConfirmation(""); setError(""); }
  function update(event) {
    const { checked, name, type, value } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
    resetReview();
  }
  function togglePort(port, mode, checked) {
    const other = mode === "tagged_ports" ? "untagged_ports" : "tagged_ports";
    setForm((current) => ({
      ...current,
      [mode]: checked ? [...current[mode], port] : current[mode].filter((item) => item !== port),
      [other]: current[other].filter((item) => item !== port),
    }));
    resetReview();
  }
  function payload() {
    return {
      ...form, vlan_id: Number(form.vlan_id),
      dhcp_pool_start: form.dhcp_pool_start || null,
      dhcp_pool_end: form.dhcp_pool_end || null,
      dns_servers: form.dns_servers.split(",").map((item) => item.trim()).filter(Boolean),
    };
  }
  async function review(event) {
    event.preventDefault(); setBusy(true); resetReview();
    try { setPreview(await previewVlan(connection, payload())); } catch (caught) { setError(caught.message); } finally { setBusy(false); }
  }
  async function apply() {
    setBusy(true); setError(""); onApplyStart();
    try { setResult(await applyVlan(connection, payload())); setPreview(null); setConfirmation(""); await onApplied(); } catch (caught) { setError(caught.message); } finally { setBusy(false); }
  }

  return (
    <section className="configuration-card">
      <div className="section-heading"><div><p className="card-kicker">ORION Field V5</p><h2>Configurar VLAN</h2></div><span className={device.demo_mode ? "preview-badge" : "write-badge"}>{device.demo_mode ? "Simulação" : "Altera o equipamento"}</span></div>
      <form className="configuration-form" onSubmit={review}>
        <div className="configuration-grid">
          <label className="field"><span>Nome da VLAN</span><input name="name" onChange={update} required value={form.name} /></label>
          <label className="field"><span>VLAN ID</span><input max="4094" min="1" name="vlan_id" onChange={update} required type="number" value={form.vlan_id} /></label>
          <label className="field"><span>Bridge principal</span><select name="bridge" onChange={update} required value={form.bridge}>{device.bridges.filter((item) => !item.disabled).map((item) => <option key={item.name}>{item.name}</option>)}</select></label>
          <label className="field"><span>IP da VLAN</span><input name="address" onChange={update} required value={form.address} /></label>
        </div>
        <fieldset className="network-options"><legend>Portas da bridge</legend><div className="vlan-port-list">{ports.map((port) => <article key={port.interface}><strong>{port.interface}</strong><label><input checked={form.tagged_ports.includes(port.interface)} onChange={(event) => togglePort(port.interface, "tagged_ports", event.target.checked)} type="checkbox" />Tagged</label><label><input checked={form.untagged_ports.includes(port.interface)} onChange={(event) => togglePort(port.interface, "untagged_ports", event.target.checked)} type="checkbox" />Untagged</label></article>)}</div></fieldset>
        <fieldset className="network-options"><legend>Rede da VLAN</legend><div className="setting-toggle-grid"><label className="setting-toggle"><span><strong>DHCP na VLAN</strong><small>Entrega IP aos dispositivos</small></span><input checked={form.enable_dhcp} name="enable_dhcp" onChange={update} type="checkbox" /><span className="toggle-control"><i /></span></label><label className="setting-toggle setting-toggle--service"><span><strong>Ativar VLAN filtering</strong><small>Aplicada por último</small></span><input checked={form.enable_filtering} name="enable_filtering" onChange={update} type="checkbox" /><span className="toggle-control"><i /></span></label></div>
          {form.enable_dhcp && <div className="dhcp-pool-grid"><label className="field"><span>Início do pool</span><input name="dhcp_pool_start" onChange={update} placeholder="Automático" value={form.dhcp_pool_start} /></label><label className="field"><span>Fim do pool</span><input name="dhcp_pool_end" onChange={update} placeholder="Automático" value={form.dhcp_pool_end} /></label><label className="field field--wide"><span>DNS</span><input name="dns_servers" onChange={update} value={form.dns_servers} /></label></div>}
        </fieldset>
        {form.tagged_ports.length + form.untagged_ports.length === 0 && <div className="inline-error">Selecione ao menos uma porta.</div>}
        <button className="primary-button" disabled={busy || form.tagged_ports.length + form.untagged_ports.length === 0} type="submit">{busy ? "Analisando…" : "Revisar configuração"}</button>
      </form>
      {error && <div className="inline-error">{error}</div>}
      {preview && <section className="configuration-preview"><p className="card-kicker">Nenhuma alteração aplicada</p><h3>Prévia da VLAN</h3><div className="change-list">{preview.changes.map((change, index) => <article key={`${change.field}-${index}`}><span>{change.area}</span><strong>{change.field}</strong><div><small>{change.current_value || "Não configurado"}</small><b>→</b><small>{change.new_value}</small></div></article>)}</div><ul className="configuration-warnings">{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>{!device.demo_mode && <><label className="confirmation-field"><span>Digite <strong>APLICAR</strong> para confirmar</span><input onChange={(event) => setConfirmation(event.target.value)} value={confirmation} /></label><button className="danger-button" disabled={confirmation !== "APLICAR" || busy} onClick={apply} type="button">Criar backup e aplicar</button></>}</section>}
      {result && <div className="configuration-success"><strong>VLAN configurada</strong><span>{result.summary}</span><small>Backup: {result.backup_file}</small></div>}
    </section>
  );
}

export default VlanConfiguration;
