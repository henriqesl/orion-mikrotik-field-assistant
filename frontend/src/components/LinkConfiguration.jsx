import { useMemo, useState } from "react";

import {
  applyLinkConfiguration,
  previewLinkConfiguration,
} from "../services/api.js";

function initialConfiguration(device) {
  const wifi = device.wifi_interfaces.find((item) => !item.disabled) || device.wifi_interfaces[0];
  const ethernet =
    device.ethernet_interfaces.find((item) => !item.disabled) ||
    device.ethernet_interfaces[0];
  const wifiPort = device.bridge_ports.find(
    (port) => port.interface === wifi?.name && !port.disabled,
  );
  const managementAddress = device.ip_addresses.find(
    (address) => !address.disabled && !address.invalid,
  );
  const defaultRoute = device.default_routes.find((route) => !route.disabled);
  const frequency = Number.parseInt(wifi?.frequency?.match(/\d+/)?.[0] || "5500", 10);

  return {
    role: wifi?.mode?.startsWith("station") ? "station" : "ap",
    identity: device.identity,
    wifi_interface: wifi?.name || "wifi1",
    ethernet_interface: ethernet?.name || "ether1",
    bridge_name: wifiPort?.bridge || device.bridges[0]?.name || "bridge-field",
    ssid: wifi?.ssid || "ORION-Link",
    passphrase: "",
    frequency_mhz: frequency,
    channel_width: wifi?.channel_width?.startsWith("20/40")
      ? "20/40mhz"
      : "20mhz",
    management_ip: managementAddress?.address || "192.168.88.2/24",
    gateway: defaultRoute?.gateway || "",
  };
}

function LinkConfiguration({ connection, device, onApplied, onApplyStart }) {
  const defaults = useMemo(() => initialConfiguration(device), [device]);
  const [form, setForm] = useState(defaults);
  const [preview, setPreview] = useState(null);
  const [confirmation, setConfirmation] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setPreview(null);
    setResult(null);
    setConfirmation("");
  }

  function payload() {
    return {
      ...form,
      frequency_mhz: Number(form.frequency_mhz),
      gateway: form.gateway.trim() || null,
    };
  }

  async function handlePreview(event) {
    event.preventDefault();
    setIsPreviewing(true);
    setErrorMessage("");
    setResult(null);

    try {
      setPreview(await previewLinkConfiguration(connection, payload()));
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleApply() {
    setIsApplying(true);
    setErrorMessage("");
    onApplyStart();

    try {
      const applyResult = await applyLinkConfiguration(connection, payload());
      setResult(applyResult);
      setPreview(null);
      setConfirmation("");
      setForm((current) => ({ ...current, passphrase: "" }));
      await onApplied(applyResult);
    } catch (error) {
      setErrorMessage(
        `${error.message} Se a conexão caiu durante a aplicação, tente acessar o novo IP antes de repetir.`,
      );
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <section className="configuration-card" aria-labelledby="configuration-title">
      <div className="section-heading">
        <div>
          <p className="card-kicker">ORION Field V3</p>
          <h2 id="configuration-title">Configurar enlace</h2>
        </div>
        <span className="write-badge">Altera o equipamento</span>
      </div>

      <form className="configuration-form" onSubmit={handlePreview}>
        <fieldset disabled={isPreviewing || isApplying}>
          <legend>Função do rádio</legend>
          <div className="role-selector">
            <label className={form.role === "ap" ? "role-option role-option--selected" : "role-option"}>
              <input
                checked={form.role === "ap"}
                name="role"
                onChange={updateField}
                type="radio"
                value="ap"
              />
              <span className="role-option__mark" aria-hidden="true">AP</span>
              <span className="role-option__content">
                <strong>AP</strong>
                <small>Cria e transmite a rede do enlace</small>
              </span>
              <span className="role-option__check" aria-hidden="true">✓</span>
            </label>
            <label className={form.role === "station" ? "role-option role-option--selected" : "role-option"}>
              <input
                checked={form.role === "station"}
                name="role"
                onChange={updateField}
                type="radio"
                value="station"
              />
              <span className="role-option__mark" aria-hidden="true">ST</span>
              <span className="role-option__content">
                <strong>Station</strong>
                <small>Conecta-se ao AP do outro lado</small>
              </span>
              <span className="role-option__check" aria-hidden="true">✓</span>
            </label>
          </div>
        </fieldset>

        <div className="configuration-grid">
          <label className="field">
            <span>Nome do equipamento</span>
            <input name="identity" onChange={updateField} required value={form.identity} />
          </label>
          <label className="field">
            <span>SSID</span>
            <input maxLength="32" name="ssid" onChange={updateField} required value={form.ssid} />
          </label>
          <label className="field">
            <span>Senha WPA2</span>
            <input
              autoComplete="new-password"
              minLength="8"
              name="passphrase"
              onChange={updateField}
              required
              type="password"
              value={form.passphrase}
            />
          </label>
          <label className="field">
            <span>Frequência (MHz)</span>
            <input
              max="6100"
              min="4900"
              name="frequency_mhz"
              onChange={updateField}
              required
              type="number"
              value={form.frequency_mhz}
            />
          </label>
          <label className="field">
            <span>Largura do canal</span>
            <select name="channel_width" onChange={updateField} value={form.channel_width}>
              <option value="20mhz">20 MHz — mais estável</option>
              <option value="20/40mhz">20/40 MHz — mais capacidade</option>
            </select>
          </label>
          <label className="field">
            <span>IP de gerenciamento</span>
            <input
              name="management_ip"
              onChange={updateField}
              placeholder="192.168.88.2/24"
              required
              value={form.management_ip}
            />
          </label>
          <label className="field">
            <span>Gateway (opcional)</span>
            <input name="gateway" onChange={updateField} value={form.gateway} />
          </label>
          <label className="field">
            <span>Bridge</span>
            <input name="bridge_name" onChange={updateField} required value={form.bridge_name} />
          </label>
          <label className="field">
            <span>Interface Wi-Fi</span>
            <select name="wifi_interface" onChange={updateField} value={form.wifi_interface}>
              {device.wifi_interfaces.map((item) => (
                <option key={item.name} value={item.name}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Interface Ethernet</span>
            <select name="ethernet_interface" onChange={updateField} value={form.ethernet_interface}>
              {device.ethernet_interfaces.map((item) => (
                <option key={item.name} value={item.name}>{item.name}</option>
              ))}
            </select>
          </label>
        </div>

        <p className="configuration-note">
          Use um usuário com permissão de escrita. O ORION cria backup, mas não remove IPs, DHCP, NAT ou firewall existentes.
        </p>
        <button className="primary-button" disabled={isPreviewing || isApplying} type="submit">
          {isPreviewing ? "Analisando…" : "Revisar alterações"}
        </button>
      </form>

      {errorMessage && <div className="inline-error" role="alert">{errorMessage}</div>}

      {preview && (
        <section className="configuration-preview" aria-labelledby="preview-title">
          <div>
            <p className="card-kicker">Nenhuma alteração aplicada ainda</p>
            <h3 id="preview-title">Revise antes de confirmar</h3>
          </div>
          <div className="change-list">
            {preview.changes.map((change, index) => (
              <article key={`${change.area}-${change.field}-${index}`}>
                <span>{change.area}</span>
                <strong>{change.field}</strong>
                <div>
                  <small>{change.current_value || "Não configurado"}</small>
                  <b aria-hidden="true">→</b>
                  <small>{change.new_value}</small>
                </div>
              </article>
            ))}
          </div>
          <ul className="configuration-warnings">
            {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
          <label className="confirmation-field">
            <span>Digite <strong>APLICAR</strong> para confirmar</span>
            <input onChange={(event) => setConfirmation(event.target.value)} value={confirmation} />
          </label>
          <button
            className="danger-button"
            disabled={confirmation !== "APLICAR" || isApplying}
            onClick={handleApply}
            type="button"
          >
            {isApplying ? "Criando backup e aplicando…" : "Criar backup e aplicar"}
          </button>
        </section>
      )}

      {result && (
        <div className="configuration-success" role="status">
          <strong>Configuração enviada</strong>
          <span>{result.summary}</span>
          <small>Backup: {result.backup_file} · novo IP: {result.reconnect_ip}</small>
        </div>
      )}
    </section>
  );
}

export default LinkConfiguration;
