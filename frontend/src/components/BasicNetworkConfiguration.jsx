import { useMemo, useState } from "react";

import { previewBasicNetwork } from "../services/api.js";

function initialForm(device) {
  const interfaces = device.ethernet_interfaces.filter((item) => !item.disabled);
  const wan = interfaces[0]?.name || "";
  const lanPorts = interfaces.slice(1).map((item) => item.name);

  return {
    identity: device.identity,
    wan_interface: wan,
    wan_mode: "dhcp",
    wan_address: "",
    gateway: "",
    lan_bridge: "bridge-lan",
    lan_address: "192.168.50.1/24",
    lan_ports: lanPorts,
    dns_servers: "1.1.1.1, 8.8.8.8",
    enable_nat: true,
  };
}

function BasicNetworkConfiguration({ connection, device }) {
  const defaults = useMemo(() => initialForm(device), [device]);
  const [form, setForm] = useState(defaults);
  const [preview, setPreview] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const availableLanPorts = device.ethernet_interfaces.filter(
    (item) => !item.disabled && item.name !== form.wan_interface,
  );

  function updateField(event) {
    const { checked, name, type, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
      ...(name === "wan_interface"
        ? { lan_ports: current.lan_ports.filter((item) => item !== value) }
        : {}),
      ...(name === "wan_mode" && value === "dhcp"
        ? { wan_address: "", gateway: "" }
        : {}),
    }));
    setPreview(null);
  }

  function toggleLanPort(event) {
    const { checked, value } = event.target;
    setForm((current) => ({
      ...current,
      lan_ports: checked
        ? [...current.lan_ports, value]
        : current.lan_ports.filter((item) => item !== value),
    }));
    setPreview(null);
  }

  function payload() {
    return {
      ...form,
      wan_address: form.wan_mode === "static" ? form.wan_address : null,
      gateway: form.wan_mode === "static" ? form.gateway : null,
      dns_servers: form.dns_servers
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    };
  }

  async function handlePreview(event) {
    event.preventDefault();
    setIsPreviewing(true);
    setErrorMessage("");
    try {
      setPreview(await previewBasicNetwork(connection, payload()));
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsPreviewing(false);
    }
  }

  return (
    <section className="configuration-card" aria-labelledby="network-configuration-title">
      <div className="section-heading">
        <div>
          <p className="card-kicker">ORION Field V4</p>
          <h2 id="network-configuration-title">Rede básica</h2>
        </div>
        <span className="preview-badge">Somente prévia</span>
      </div>

      <form className="configuration-form" onSubmit={handlePreview}>
        <fieldset disabled={isPreviewing}>
          <legend>Como a internet chega ao MikroTik?</legend>
          <div className="role-selector">
            <label className={form.wan_mode === "dhcp" ? "role-option role-option--selected" : "role-option"}>
              <input checked={form.wan_mode === "dhcp"} name="wan_mode" onChange={updateField} type="radio" value="dhcp" />
              <span className="role-option__mark">DH</span>
              <span className="role-option__content"><strong>DHCP</strong><small>Recebe IP automaticamente</small></span>
              <span className="role-option__check">✓</span>
            </label>
            <label className={form.wan_mode === "static" ? "role-option role-option--selected" : "role-option"}>
              <input checked={form.wan_mode === "static"} name="wan_mode" onChange={updateField} type="radio" value="static" />
              <span className="role-option__mark">IP</span>
              <span className="role-option__content"><strong>IP fixo</strong><small>Usa endereço e gateway definidos</small></span>
              <span className="role-option__check">✓</span>
            </label>
          </div>
        </fieldset>

        <div className="configuration-grid">
          <label className="field">
            <span>Nome do equipamento</span>
            <input name="identity" onChange={updateField} required value={form.identity} />
          </label>
          <label className="field">
            <span>Interface WAN</span>
            <select name="wan_interface" onChange={updateField} required value={form.wan_interface}>
              {device.ethernet_interfaces.filter((item) => !item.disabled).map((item) => (
                <option key={item.name} value={item.name}>{item.name}</option>
              ))}
            </select>
          </label>
          {form.wan_mode === "static" && (
            <>
              <label className="field">
                <span>IP da WAN</span>
                <input name="wan_address" onChange={updateField} placeholder="10.0.0.2/24" required value={form.wan_address} />
              </label>
              <label className="field">
                <span>Gateway da WAN</span>
                <input name="gateway" onChange={updateField} placeholder="10.0.0.1" required value={form.gateway} />
              </label>
            </>
          )}
          <label className="field">
            <span>Nome da bridge LAN</span>
            <input name="lan_bridge" onChange={updateField} required value={form.lan_bridge} />
          </label>
          <label className="field">
            <span>IP da rede LAN</span>
            <input name="lan_address" onChange={updateField} required value={form.lan_address} />
          </label>
          <label className="field field--wide">
            <span>Servidores DNS</span>
            <input name="dns_servers" onChange={updateField} required value={form.dns_servers} />
          </label>
        </div>

        <fieldset className="network-options" disabled={isPreviewing}>
          <legend>Portas da rede LAN</legend>
          <div className="port-selector">
            {availableLanPorts.map((item) => (
              <label className="check-field" key={item.name}>
                <input checked={form.lan_ports.includes(item.name)} onChange={toggleLanPort} type="checkbox" value={item.name} />
                <span>{item.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="check-field network-nat-option">
          <input checked={form.enable_nat} name="enable_nat" onChange={updateField} type="checkbox" />
          <span>Compartilhar a internet com a LAN (NAT)</span>
        </label>

        {form.lan_ports.length === 0 && (
          <div className="inline-error" role="alert">Selecione pelo menos uma porta LAN.</div>
        )}
        <button className="primary-button" disabled={isPreviewing || form.lan_ports.length === 0} type="submit">
          {isPreviewing ? "Analisando…" : "Revisar configuração"}
        </button>
      </form>

      {errorMessage && <div className="inline-error" role="alert">{errorMessage}</div>}
      {preview && (
        <section className="configuration-preview">
          <p className="card-kicker">Nenhuma alteração aplicada</p>
          <h3>Prévia da rede</h3>
          <div className="change-list">
            {preview.changes.map((change, index) => (
              <article key={`${change.area}-${change.field}-${index}`}>
                <span>{change.area}</span>
                <strong>{change.field}</strong>
                <div><small>{change.current_value || "Não configurado"}</small><b>→</b><small>{change.new_value}</small></div>
              </article>
            ))}
          </div>
          <ul className="configuration-warnings">
            {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </section>
      )}
    </section>
  );
}

export default BasicNetworkConfiguration;
