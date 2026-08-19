import { useMemo, useState } from "react";

import {
  applyBasicNetwork,
  previewBasicNetwork,
  validateConnectivity,
} from "../services/api.js";

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
    configure_lan: true,
    lan_bridge: "bridge-lan",
    lan_address: "192.168.50.1/24",
    lan_ports: lanPorts,
    dns_servers: "1.1.1.1, 8.8.8.8",
    enable_nat: true,
    enable_lan_dhcp: true,
    dhcp_pool_start: "",
    dhcp_pool_end: "",
    enable_ssh: true,
    enable_winbox: true,
    enable_webfig_https: false,
    enable_telnet: false,
    enable_ftp: false,
    enable_webfig_http: false,
  };
}

function BasicNetworkConfiguration({ connection, device, onApplied, onApplyStart }) {
  const defaults = useMemo(() => initialForm(device), [device]);
  const [form, setForm] = useState(defaults);
  const [preview, setPreview] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState(null);
  const [postApply, setPostApply] = useState(null);
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
      ...(name === "enable_lan_dhcp" && !checked
        ? { dhcp_pool_start: "", dhcp_pool_end: "" }
        : {}),
      ...(name === "configure_lan" && !checked
        ? {
            lan_ports: [],
            enable_nat: false,
            enable_lan_dhcp: false,
            dhcp_pool_start: "",
            dhcp_pool_end: "",
          }
        : {}),
    }));
    setPreview(null);
    setResult(null);
    setConfirmation("");
    setPostApply(null);
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
    setResult(null);
    setConfirmation("");
    setPostApply(null);
  }

  function payload() {
    return {
      ...form,
      wan_address: form.wan_mode === "static" ? form.wan_address : null,
      gateway: form.wan_mode === "static" ? form.gateway : null,
      lan_bridge: form.configure_lan ? form.lan_bridge : null,
      lan_address: form.configure_lan ? form.lan_address : null,
      lan_ports: form.configure_lan ? form.lan_ports : [],
      enable_nat: form.configure_lan && form.enable_nat,
      enable_lan_dhcp: form.configure_lan && form.enable_lan_dhcp,
      dns_servers: form.dns_servers
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      dhcp_pool_start: form.configure_lan ? form.dhcp_pool_start || null : null,
      dhcp_pool_end: form.configure_lan ? form.dhcp_pool_end || null : null,
    };
  }

  async function handlePreview(event) {
    event.preventDefault();
    setIsPreviewing(true);
    setErrorMessage("");
    setResult(null);
    setPostApply(null);
    try {
      setPreview(await previewBasicNetwork(connection, payload()));
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
      const applyResult = await applyBasicNetwork(connection, payload());
      setResult(applyResult);
      setPreview(null);
      setConfirmation("");
      setPostApply({ status: "reconnecting" });
      const reconnected = await onApplied(applyResult);
      if (!reconnected) {
        setPostApply({
          status: "recovery",
          previousIp: connection.host,
        });
        return;
      }

      try {
        const connectivity = await validateConnectivity(reconnected.connection);
        setPostApply({ status: "validated", connectivity });
      } catch (error) {
        setPostApply({
          status: "validation-error",
          message: error.message,
        });
      }
    } catch (error) {
      setErrorMessage(
        form.configure_lan
          ? `${error.message} Se a conexão caiu, conecte o computador a uma porta LAN e tente o novo IP.`
          : error.message,
      );
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <section className="configuration-card" aria-labelledby="network-configuration-title">
      <div className="section-heading">
        <div>
          <p className="card-kicker">Rede e serviços</p>
          <h2 id="network-configuration-title">Rede básica</h2>
        </div>
        <span className={device.demo_mode ? "preview-badge" : "write-badge"}>
          {device.demo_mode ? "Simulação" : "Altera o equipamento"}
        </span>
      </div>

      <form className="configuration-form" onSubmit={handlePreview}>
        <fieldset disabled={isPreviewing || isApplying}>
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

        <fieldset className="network-options network-toggle-section" disabled={isPreviewing || isApplying}>
          <legend>Rede LAN</legend>
          <label className="setting-toggle setting-toggle--wide">
            <span>
              <strong>Configurar rede LAN</strong>
              <small>Cria bridge, endereço IP e associa as portas selecionadas</small>
            </span>
            <input checked={form.configure_lan} name="configure_lan" onChange={updateField} type="checkbox" />
            <span aria-hidden="true" className="toggle-control"><i /></span>
          </label>
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
          {form.configure_lan && (
            <>
              <label className="field">
                <span>Nome da bridge LAN</span>
                <input name="lan_bridge" onChange={updateField} required value={form.lan_bridge} />
              </label>
              <label className="field">
                <span>IP da rede LAN</span>
                <input name="lan_address" onChange={updateField} required value={form.lan_address} />
              </label>
            </>
          )}
          <label className="field field--wide">
            <span>Servidores DNS</span>
            <input name="dns_servers" onChange={updateField} required value={form.dns_servers} />
          </label>
        </div>

        {form.configure_lan && (
          <>
            <fieldset className="network-options" disabled={isPreviewing || isApplying}>
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

            <fieldset className="network-options network-toggle-section" disabled={isPreviewing || isApplying}>
              <legend>Recursos da LAN</legend>
              <div className="setting-toggle-grid">
                <label className="setting-toggle">
                  <span><strong>Liberar internet na LAN</strong><small>Ativa o compartilhamento por NAT</small></span>
                  <input checked={form.enable_nat} name="enable_nat" onChange={updateField} type="checkbox" />
                  <span aria-hidden="true" className="toggle-control"><i /></span>
                </label>
                <label className="setting-toggle">
                  <span><strong>DHCP nas portas LAN</strong><small>Entrega endereços IP automaticamente</small></span>
                  <input checked={form.enable_lan_dhcp} name="enable_lan_dhcp" onChange={updateField} type="checkbox" />
                  <span aria-hidden="true" className="toggle-control"><i /></span>
                </label>
              </div>
              {form.enable_lan_dhcp && (
                <div className="dhcp-pool-grid">
                  <label className="field">
                    <span>Início do pool DHCP</span>
                    <input name="dhcp_pool_start" onChange={updateField} placeholder="Automático" required={Boolean(form.dhcp_pool_end)} value={form.dhcp_pool_start} />
                  </label>
                  <label className="field">
                    <span>Fim do pool DHCP</span>
                    <input name="dhcp_pool_end" onChange={updateField} placeholder="Automático" required={Boolean(form.dhcp_pool_start)} value={form.dhcp_pool_end} />
                  </label>
                </div>
              )}
            </fieldset>
          </>
        )}

        <fieldset className="network-options network-toggle-section" disabled={isPreviewing || isApplying}>
          <legend>Serviços de acesso</legend>
          <div className="service-toggle-grid">
            <label className="setting-toggle">
              <span><strong>SSH</strong><small>Terminal seguro</small></span>
              <input checked={form.enable_ssh} name="enable_ssh" onChange={updateField} type="checkbox" />
              <span aria-hidden="true" className="toggle-control"><i /></span>
            </label>
            <label className="setting-toggle">
              <span><strong>WinBox</strong><small>Gerenciamento pelo aplicativo</small></span>
              <input checked={form.enable_winbox} name="enable_winbox" onChange={updateField} type="checkbox" />
              <span aria-hidden="true" className="toggle-control"><i /></span>
            </label>
            <label className="setting-toggle">
              <span><strong>WebFig HTTPS</strong><small>Painel web criptografado</small></span>
              <input checked={form.enable_webfig_https} name="enable_webfig_https" onChange={updateField} type="checkbox" />
              <span aria-hidden="true" className="toggle-control"><i /></span>
            </label>
            <label className="setting-toggle setting-toggle--service">
              <span><strong>Telnet</strong><small>Acesso sem criptografia</small></span>
              <input checked={form.enable_telnet} name="enable_telnet" onChange={updateField} type="checkbox" />
              <span aria-hidden="true" className="toggle-control"><i /></span>
            </label>
            <label className="setting-toggle setting-toggle--service">
              <span><strong>FTP</strong><small>Transferência sem criptografia</small></span>
              <input checked={form.enable_ftp} name="enable_ftp" onChange={updateField} type="checkbox" />
              <span aria-hidden="true" className="toggle-control"><i /></span>
            </label>
            <label className="setting-toggle setting-toggle--service">
              <span><strong>WebFig HTTP</strong><small>Painel web sem HTTPS</small></span>
              <input checked={form.enable_webfig_http} name="enable_webfig_http" onChange={updateField} type="checkbox" />
              <span aria-hidden="true" className="toggle-control"><i /></span>
            </label>
          </div>
          <p className="configuration-note">API e API-SSL são preservadas para não interromper o acesso do ORION.</p>
        </fieldset>

        {form.configure_lan && form.lan_ports.length === 0 && (
          <div className="inline-error" role="alert">Selecione pelo menos uma porta LAN.</div>
        )}
        <button className="primary-button" disabled={isPreviewing || isApplying || (form.configure_lan && form.lan_ports.length === 0)} type="submit">
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
          <strong>Rede básica enviada</strong>
          <span>{result.summary}</span>
          <small>Backup: {result.backup_file} · {form.configure_lan ? "novo IP" : "acesso"}: {result.reconnect_ip}</small>
        </div>
      )}
      {postApply?.status === "reconnecting" && (
        <div className="network-post-check network-post-check--running" role="status">
          <strong>{form.configure_lan ? "Reconectando no novo IP…" : "Confirmando o acesso…"}</strong>
          <span>O ORION está aguardando o MikroTik responder novamente.</span>
        </div>
      )}
      {postApply?.status === "validated" && (
        <div className="network-post-check network-post-check--success" role="status">
          <strong>Acesso confirmado</strong>
          <div className="network-check-grid">
            <span>
              Gateway
              <b>{postApply.connectivity.gateway.status === "passed" ? "Acessível" : "Sem resposta"}</b>
            </span>
            <span>
              ARP
              <b>{postApply.connectivity.arp.status === "passed" ? "Resolvido" : "Não resolvido"}</b>
            </span>
            <span>
              Internet
              <b>{postApply.connectivity.internet.status === "passed" ? "Acessível" : "Sem resposta"}</b>
            </span>
          </div>
        </div>
      )}
      {postApply?.status === "validation-error" && (
        <div className="network-post-check network-post-check--attention" role="alert">
          <strong>Acesso confirmado, testes incompletos</strong>
          <span>{postApply.message}</span>
        </div>
      )}
      {postApply?.status === "recovery" && (
        <div className="network-recovery" role="alert">
          <strong>{form.configure_lan ? "O novo IP ainda não respondeu" : "O acesso ainda não respondeu"}</strong>
          {form.configure_lan ? (
            <ol>
              <li>Conecte o computador a uma das portas LAN selecionadas.</li>
              <li>
                {form.enable_lan_dhcp
                  ? "Deixe o adaptador de rede configurado para obter IP automaticamente."
                  : "Configure manualmente no computador um IP compatível com a nova rede LAN."}
              </li>
              <li>Tente acessar novamente o endereço {result.reconnect_ip}.</li>
              <li>Se necessário, tente o IP anterior {postApply.previousIp}.</li>
            </ol>
          ) : (
            <p>A configuração LAN foi preservada. Tente novamente o endereço {postApply.previousIp}.</p>
          )}
          <small>Backup criado: {result.backup_file}</small>
        </div>
      )}
    </section>
  );
}

export default BasicNetworkConfiguration;
