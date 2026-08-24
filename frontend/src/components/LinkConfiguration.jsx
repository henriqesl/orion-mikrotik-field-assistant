import { useMemo, useState } from "react";

import {
  applyLinkConfiguration,
  previewLinkConfiguration,
} from "../services/api.js";
import CurrentConfiguration from "./CurrentConfiguration.jsx";
import fieldProfiles from "../data/field-profiles.json";

function nextManagementAddress(value) {
  const match = value?.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d|[12]\d|3[0-2])$/);
  if (!match) return value;

  const octets = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  const address = octets.reduce((result, octet) => ((result << 8) | octet) >>> 0, 0);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const broadcast = ((address & mask) | (~mask >>> 0)) >>> 0;
  const candidate = address + 1 < broadcast ? address + 1 : address - 1;
  const parts = [24, 16, 8, 0].map((shift) => (candidate >>> shift) & 255);
  return `${parts.join(".")}/${prefix}`;
}

function initialConfiguration(device, fieldSession) {
  const wifi = device.wifi_interfaces.find((item) => !item.disabled) || device.wifi_interfaces[0];
  const wifiPort = device.bridge_ports.find(
    (port) => port.interface === wifi?.name && !port.disabled,
  );
  const bridgedEthernetInterfaces = device.bridge_ports.filter(
    (port) => port.bridge === wifiPort?.bridge
      && device.ethernet_interfaces.some((item) => item.name === port.interface && !item.disabled)
      && !port.disabled,
  ).map((port) => port.interface);
  const fallbackEthernet = device.ethernet_interfaces.find((item) => !item.disabled)
    || device.ethernet_interfaces[0];
  const managementAddress = device.ip_addresses.find(
    (address) => !address.disabled && !address.invalid,
  );
  const defaultRoute = device.default_routes.find((route) => !route.disabled);
  const frequency = Number.parseInt(wifi?.frequency?.match(/\d+/)?.[0] || "5500", 10);

  const detectedRole = wifi?.mode?.startsWith("station") ? "station" : "ap";

  return {
    role: fieldSession?.next_role || detectedRole,
    device_kind: device.radio_device ? "radio" : "generic",
    manage_topology: Boolean(device.radio_device),
    identity: device.identity,
    wifi_interface: wifi?.name || "wifi1",
    bridge_interfaces: bridgedEthernetInterfaces.length > 0
      ? bridgedEthernetInterfaces
      : device.radio_device && fallbackEthernet
        ? [fallbackEthernet.name]
        : [],
    ssid: fieldSession?.ssid || wifi?.ssid || "ORION-Link",
    passphrase: fieldSession?.passphrase || "",
    frequency_mhz: fieldSession?.frequency_mhz || frequency,
    channel_width: fieldSession?.channel_width || (wifi?.channel_width?.startsWith("20/40")
      ? "20/40mhz"
      : "20mhz"),
    management_ip: fieldSession?.next_role === "station"
      ? fieldSession.station_management_ip
      : managementAddress?.address || "192.168.88.2/24",
    gateway: defaultRoute?.gateway || "",
    bridge_name: fieldSession?.bridge_name || wifiPort?.bridge || device.bridges[0]?.name || "bridge-field",
  };
}

function LinkConfiguration({
  connection,
  device,
  fieldSession,
  onApplied,
  onApplyStart,
  onFieldSessionChange,
  onFinishFieldSession,
  onPrepareNextDevice,
}) {
  const isRadioDevice = Boolean(device.radio_device);
  const defaults = useMemo(
    () => initialConfiguration(device, fieldSession),
    [device, fieldSession],
  );
  const [form, setForm] = useState(defaults);
  const [selectedProfile, setSelectedProfile] = useState(fieldSession?.profile_id || "");
  const [preview, setPreview] = useState(null);
  const [confirmation, setConfirmation] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  function updateField(event) {
    const { checked, name, type, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
    setPreview(null);
    setResult(null);
    setConfirmation("");
  }

  function toggleBridgeInterface(event) {
    const { checked, value } = event.target;
    setForm((current) => ({
      ...current,
      bridge_interfaces: checked
        ? [...current.bridge_interfaces, value]
        : current.bridge_interfaces.filter((item) => item !== value),
    }));
    setPreview(null);
    setResult(null);
    setConfirmation("");
  }

  function adjustFrequency(delta) {
    setForm((current) => ({
      ...current,
      frequency_mhz: Math.min(7100, Math.max(2000, Number(current.frequency_mhz) + delta)),
    }));
    setPreview(null);
    setResult(null);
    setConfirmation("");
  }

  function applyProfile(profile) {
    setSelectedProfile(profile.id);
    setForm((current) => ({
      ...current,
      bridge_name: profile.bridge_name,
      channel_width: profile.channel_width,
      ssid: profile.ap_ssid,
    }));
    setPreview(null);
    setResult(null);
    setConfirmation("");
    setErrorMessage("");
  }

  function startPairConfiguration() {
    if (form.passphrase.length < 8) {
      setErrorMessage("Defina uma senha WPA2 com pelo menos oito caracteres antes de iniciar o par.");
      return;
    }

    const session = {
      profile_id: selectedProfile || "custom",
      ssid: form.ssid,
      passphrase: form.passphrase,
      frequency_mhz: Number(form.frequency_mhz),
      channel_width: form.channel_width,
      bridge_name: form.bridge_name,
      station_management_ip: nextManagementAddress(form.management_ip),
      completed_roles: [],
      next_role: "ap",
    };
    onFieldSessionChange(session);
    setForm((current) => ({ ...current, role: "ap" }));
    setErrorMessage("");
  }

  function clearPairConfiguration() {
    onFieldSessionChange(null);
  }

  function payload() {
    return {
      ...form,
      device_kind: isRadioDevice ? "radio" : "generic",
      manage_topology: isRadioDevice || form.manage_topology,
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
      if (fieldSession) {
        const completedRoles = Array.from(new Set([
          ...fieldSession.completed_roles,
          form.role,
        ]));
        onFieldSessionChange({
          ...fieldSession,
          completed_roles: completedRoles,
          next_role: form.role === "ap" ? "station" : "complete",
        });
      }
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
          <p className="card-kicker">Configuração assistida</p>
          <h2 id="configuration-title">
            {isRadioDevice ? "Configurar enlace" : "Configurar Wi-Fi"}
          </h2>
        </div>
        <span className="write-badge">{device.demo_mode ? "Simulação" : "Altera o equipamento"}</span>
      </div>

      {isRadioDevice && (
        <section className="field-profiles" aria-labelledby="field-profiles-title">
          <header>
            <div>
              <span>Cenário do enlace</span>
              <strong id="field-profiles-title">Escolha o ponto de partida</strong>
            </div>
          </header>
          <div className="field-profile-grid">
            {fieldProfiles
              .filter((profile) => profile.id !== "local-wifi")
              .map((profile) => (
              <button
                className={selectedProfile === profile.id ? "field-profile field-profile--selected" : "field-profile"}
                key={profile.id}
                onClick={() => applyProfile(profile)}
                type="button"
              >
                <strong>{profile.name}</strong>
                <span>{profile.description}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {isRadioDevice && (
        <section className={fieldSession ? "pair-session pair-session--active" : "pair-session"}>
          <div>
            <span>AP + Station</span>
            <strong>
              {fieldSession
                ? `Etapa atual: ${fieldSession.next_role === "station" ? "Station" : fieldSession.next_role === "complete" ? "validação" : "AP"}`
                : "Configure os dois lados sem redigitar os parâmetros"}
            </strong>
            <small>
              {fieldSession
                ? `${fieldSession.ssid} · sessão mantida somente enquanto o ORION estiver aberto`
                : "Configure o AP primeiro; ao conectar a Station, o ORION reaproveitará os mesmos dados do enlace."}
            </small>
          </div>
          {fieldSession ? (
            <button onClick={clearPairConfiguration} type="button">Encerrar sessão</button>
          ) : (
            <button onClick={startPairConfiguration} type="button">Iniciar configuração do par</button>
          )}
        </section>
      )}

      <div className="network-proposal-banner network-proposal-banner--loaded configuration-current-banner">
        <div>
          <span>Configuração atual carregada</span>
          <strong>Função, SSID, frequência, interfaces e endereçamento</strong>
        </div>
        <b>Editável</b>
      </div>

      <form className="configuration-form" onSubmit={handlePreview}>
        <fieldset disabled={isPreviewing || isApplying}>
          <legend>{isRadioDevice ? "Função do rádio" : "Modo de operação"}</legend>
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
                <small>
                  {isRadioDevice
                    ? "Cria e transmite a rede do enlace"
                    : "Cria e transmite a rede Wi-Fi"}
                </small>
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
                <small>
                  {isRadioDevice
                    ? "Conecta-se ao AP do outro lado"
                    : "Conecta-se a uma rede Wi-Fi existente"}
                </small>
              </span>
              <span className="role-option__check" aria-hidden="true">✓</span>
            </label>
          </div>
        </fieldset>

        {!isRadioDevice && (
          <fieldset className="network-options network-toggle-section" disabled={isPreviewing || isApplying}>
            <legend>Topologia do router</legend>
            <label className="setting-toggle setting-toggle--wide">
              <span>
                <strong>Alterar bridge e IP de gerenciamento</strong>
                <small>Desativado: o ORION muda somente o Wi-Fi e preserva toda a rede atual</small>
              </span>
              <input
                checked={form.manage_topology}
                name="manage_topology"
                onChange={updateField}
                type="checkbox"
              />
              <span aria-hidden="true" className="toggle-control"><i /></span>
            </label>
          </fieldset>
        )}

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
            <span>Senha WPA2 — informe para aplicar</span>
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
          <div className="field">
            <span>Frequência (MHz)</span>
            <div className="number-stepper">
              <button aria-label="Diminuir frequência em 5 MHz" onClick={() => adjustFrequency(-5)} type="button">−</button>
              <input
                aria-label="Frequência em MHz"
                max="7100"
                min="2000"
                name="frequency_mhz"
                onChange={updateField}
                required
                type="number"
                value={form.frequency_mhz}
              />
              <button aria-label="Aumentar frequência em 5 MHz" onClick={() => adjustFrequency(5)} type="button">+</button>
            </div>
          </div>
          <label className="field">
            <span>Largura do canal</span>
            <select name="channel_width" onChange={updateField} value={form.channel_width}>
              <option value="20mhz">20 MHz — mais estável</option>
              <option value="20/40mhz">20/40 MHz — mais capacidade</option>
            </select>
          </label>
          {(isRadioDevice || form.manage_topology) && (
            <>
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
            </>
          )}
          <label className="field">
            <span>Interface Wi-Fi</span>
            <select name="wifi_interface" onChange={updateField} value={form.wifi_interface}>
              {device.wifi_interfaces.map((item) => (
                <option key={item.name} value={item.name}>{item.name}</option>
              ))}
            </select>
          </label>
        </div>

        {(isRadioDevice || form.manage_topology) && (
          <fieldset className="network-options" disabled={isPreviewing || isApplying}>
            <legend>{isRadioDevice ? "Portas cabeadas do enlace" : "Interfaces Ethernet na bridge"}</legend>
            <div className="port-selector">
              {device.ethernet_interfaces.filter((item) => !item.disabled).map((item) => (
                <label className="check-field" key={item.name}>
                  <input
                    checked={form.bridge_interfaces.includes(item.name)}
                    onChange={toggleBridgeInterface}
                    type="checkbox"
                    value={item.name}
                  />
                  <span>{item.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <p className="configuration-note">
          {isRadioDevice || form.manage_topology
            ? "O ORION cria backup e preserva IPs, DHCP, NAT e firewall existentes."
            : "Somente identidade e Wi-Fi serão alterados; a rede atual permanecerá intacta."}
        </p>
        <button
          className="primary-button"
          disabled={isPreviewing || isApplying || (isRadioDevice && form.bridge_interfaces.length === 0)}
          type="submit"
        >
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
          <CurrentConfiguration items={preview.existing} />
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
          {device.demo_mode ? (
            <p className="demo-preview-note">Esta é apenas uma prévia. O modo demonstração não grava configurações.</p>
          ) : (
            <>
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
            </>
          )}
        </section>
      )}

      {result && (
        <div className="configuration-success" role="status">
          <strong>Configuração enviada</strong>
          <span>{result.summary}</span>
          <small>
            Backup: {result.backup_file} · {isRadioDevice || form.manage_topology ? "IP de acesso" : "rede preservada"}: {result.reconnect_ip}
          </small>
          {fieldSession && form.role === "ap" && (
            <button onClick={onPrepareNextDevice} type="button">
              Desconectar AP e configurar Station
            </button>
          )}
          {fieldSession && form.role === "station" && (
            <button onClick={onFinishFieldSession} type="button">
              Concluir sessão e abrir os testes
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default LinkConfiguration;
