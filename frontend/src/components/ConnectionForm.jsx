import { useCallback, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import {
  applyMacBootstrap,
  discoverLanDevices,
  getMacBootstrapAdapters,
  openWinBox,
  previewMacBootstrap,
} from "../services/api.js";
import { isDesktopRuntime } from "../services/runtime.js";

const INITIAL_FORM = {
  host: "192.168.88.1",
  username: "admin",
  password: "",
  port: 8728,
  use_tls: false,
  verify_tls: true,
};

function isValidIpv4Cidr(value) {
  const match = value.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])$/);
  if (!match) return false;
  const octets = match[1].split(".").map(Number);
  if (octets.some((part) => part > 255) || octets[0] === 0 || octets[0] === 127 || octets[0] >= 224) {
    return false;
  }

  const prefix = Number(match[2]);
  const address = octets.reduce((result, octet) => ((result << 8) | octet) >>> 0, 0);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (address & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  return address !== network && address !== broadcast;
}

function isValidInterfaceName(value) {
  return value.trim().length > 0 && !/["\\;\r\n]/.test(value);
}

function suggestedManagementAddress(adapter) {
  const octets = String(adapter?.ipv4_address || "").split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return "";
  }
  const routerHost = octets[3] === 1 ? 254 : 1;
  return `${octets[0]}.${octets[1]}.${octets[2]}.${routerHost}/24`;
}

function ConnectionForm({ fieldSession, isLoading, onClearFieldSession, onConnect }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [lanDiscovery, setLanDiscovery] = useState({ status: "listening", devices: [] });
  const [discoveryError, setDiscoveryError] = useState("");
  const [openingMac, setOpeningMac] = useState("");
  const [winboxMessage, setWinboxMessage] = useState("");
  const [winboxMessageKind, setWinboxMessageKind] = useState("success");
  const [macPreparation, setMacPreparation] = useState("");
  const [needsWinboxPath, setNeedsWinboxPath] = useState(false);
  const [bootstrapAddress, setBootstrapAddress] = useState("");
  const [bootstrapInterface, setBootstrapInterface] = useState("ether1");
  const [networkAdapters, setNetworkAdapters] = useState([]);
  const [adapterIndex, setAdapterIndex] = useState("");
  const [bootstrapPreview, setBootstrapPreview] = useState(null);
  const [bootstrapStatus, setBootstrapStatus] = useState("");
  const [bootstrapBusy, setBootstrapBusy] = useState(false);
  const [endpointMessage, setEndpointMessage] = useState("");
  const [selectedDeviceMac, setSelectedDeviceMac] = useState("");

  const refreshLanDevices = useCallback(async () => {
    try {
      const result = await discoverLanDevices();
      setLanDiscovery(result);
      setDiscoveryError(result.message || "");
    } catch (error) {
      setDiscoveryError(error.message);
    }
  }, []);

  useEffect(() => {
    refreshLanDevices();
    const intervalId = window.setInterval(refreshLanDevices, 5_000);
    return () => window.clearInterval(intervalId);
  }, [refreshLanDevices]);

  useEffect(() => {
    if (!macPreparation) return;
    const preparedDevice = lanDiscovery.devices.find(
      (device) => device.mac_address === macPreparation,
    );
    if (
      preparedDevice?.ip_address
      && preparedDevice.ip_address !== "0.0.0.0"
    ) {
      setForm((current) => ({ ...current, host: preparedDevice.ip_address }));
      setWinboxMessageKind("success");
      setWinboxMessage(`Novo IP detectado: ${preparedDevice.ip_address}.`);
    }
  }, [macPreparation, lanDiscovery.devices]);

  function updateField(event) {
    const { checked, name, type, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
    if (name === "host" || name === "port") {
      setEndpointMessage("");
    }
  }

  function updateTls(event) {
    const useTls = event.target.checked;
    setForm((current) => ({
      ...current,
      use_tls: useTls,
      port: useTls ? 8729 : 8728,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (/^\s*\d{1,3}(?:\.\d{1,3}){3}:\d+\s*$/.test(form.host)) {
      setEndpointMessage(
        "Informe somente o IP nesse campo. A porta externa da API fica em Opções avançadas → Porta da API.",
      );
      return;
    }

    const connection = {
      ...form,
      port: Number(form.port),
    };
    const succeeded = await onConnect(connection);

    if (succeeded) {
      setEndpointMessage("");
      setForm((current) => ({ ...current, password: "" }));
    } else if (![8728, 8729].includes(connection.port)) {
      setEndpointMessage(
        `A porta ${connection.port} foi tentada como API. Se ela redireciona para o WinBox (8291), o ORION não consegue usá-la; crie outro encaminhamento para a API ou use VPN.`,
      );
    }
  }

  function useDeviceIp(device) {
    setForm((current) => ({ ...current, host: device.ip_address }));
    setSelectedDeviceMac(device.mac_address);
    setWinboxMessage("");
    window.requestAnimationFrame(() => {
      document.querySelector("#connection-credentials")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      document.querySelector('input[name="password"]')?.focus();
    });
  }

  async function selectMacDevice(device) {
    if (!device.ip_address || device.ip_address === "0.0.0.0") {
      setMacPreparation(device.mac_address);
      setBootstrapInterface(device.interface || "ether1");
      setBootstrapPreview(null);
      setBootstrapStatus("");
      try {
        const adapters = await getMacBootstrapAdapters();
        setNetworkAdapters(adapters);
        setAdapterIndex((current) => {
          const nextIndex = current || String(adapters[0]?.interface_index || "");
          const selectedAdapter = adapters.find(
            (adapter) => String(adapter.interface_index) === nextIndex,
          );
          if (!bootstrapAddress && selectedAdapter) {
            setBootstrapAddress(suggestedManagementAddress(selectedAdapter));
          }
          return nextIndex;
        });
      } catch (error) {
        setBootstrapStatus(error.message);
      }
      return;
    }
    await handleOpenWinBox(device);
  }

  async function handleOpenWinBox(device, executablePath = null) {
    setOpeningMac(device.mac_address);
    setWinboxMessage("");
    try {
      const result = await openWinBox(device.mac_address, form.username, {
        executablePath,
        tryBlankPassword: form.password === "",
      });
      setNeedsWinboxPath(false);
      setWinboxMessageKind("success");
      setWinboxMessage(result.summary);
    } catch (error) {
      if (error.message.includes("WinBox não encontrado")) {
        setNeedsWinboxPath(true);
      }
      setWinboxMessageKind("error");
      setWinboxMessage(error.message);
    } finally {
      setOpeningMac("");
    }
  }

  async function chooseWinBox(device) {
    if (!isDesktopRuntime()) {
      setWinboxMessageKind("error");
      setWinboxMessage(
        "A seleção do WinBox pela tela está disponível no aplicativo desktop.",
      );
      return;
    }

    const executablePath = await openDialog({
      directory: false,
      multiple: false,
      title: "Localizar o WinBox oficial",
      filters: [{ name: "WinBox", extensions: ["exe"] }],
    });
    if (executablePath) {
      await handleOpenWinBox(device, executablePath);
    }
  }

  function bootstrapPayload(device) {
    return {
      mac_address: device.mac_address,
      username: form.username,
      password: form.password,
      adapter_index: Number(adapterIndex),
      router_interface: bootstrapInterface.trim(),
      management_address: bootstrapAddress.trim(),
    };
  }

  async function inspectMacBootstrap(device) {
    const address = bootstrapAddress.trim();
    const interfaceName = bootstrapInterface.trim();
    if (!isValidIpv4Cidr(address) || !isValidInterfaceName(interfaceName) || !adapterIndex) {
      setBootstrapStatus("Informe o IP, a interface do MikroTik e a placa de rede conectada.");
      return;
    }
    setBootstrapBusy(true);
    setBootstrapStatus("");
    setBootstrapPreview(null);
    try {
      setBootstrapPreview(await previewMacBootstrap(bootstrapPayload(device)));
    } catch (error) {
      setBootstrapStatus(error.message);
    } finally {
      setBootstrapBusy(false);
    }
  }

  async function confirmMacBootstrap(device) {
    setBootstrapBusy(true);
    setBootstrapStatus("");
    try {
      const result = await applyMacBootstrap(bootstrapPayload(device));
      const connection = {
        ...form,
        host: result.host,
        port: result.api_port,
        use_tls: false,
        verify_tls: true,
      };
      setForm(connection);
      setBootstrapStatus("IP aplicado. Conectando pela API do RouterOS…");
      const connected = await onConnect(connection);
      if (connected) {
        setMacPreparation("");
        setForm((current) => ({ ...current, password: "" }));
      } else {
        setBootstrapStatus("O IP foi aplicado. Use Conectar e identificar para tentar novamente.");
      }
    } catch (error) {
      setBootstrapStatus(error.message);
    } finally {
      setBootstrapBusy(false);
    }
  }

  const preparedDevice = macPreparation
    ? lanDiscovery.devices.find(
      (device) => device.mac_address === macPreparation,
    ) || { mac_address: macPreparation }
    : null;
  const bootstrapReady = isValidIpv4Cidr(bootstrapAddress)
    && isValidInterfaceName(bootstrapInterface)
    && Boolean(adapterIndex);

  return (
    <form className="connection-form" onSubmit={handleSubmit}>
      <div className="section-heading">
        <div>
          <p className="card-kicker">Conectar ao equipamento</p>
          <h2>Dados de acesso</h2>
        </div>
      </div>

      {fieldSession && (
        <aside className="field-session-banner" role="status">
          <div>
            <span>Sessão temporária de enlace</span>
            <strong>
              {fieldSession.next_role === "station"
                ? "Conecte agora o equipamento que será a Station"
                : "Conecte o equipamento que será o AP"}
            </strong>
            <small>{fieldSession.ssid} · os dados serão descartados ao encerrar a sessão</small>
          </div>
          <button onClick={onClearFieldSession} type="button">Encerrar sessão</button>
        </aside>
      )}

      <section className="lan-discovery" aria-labelledby="lan-discovery-title">
        <header>
          <div>
            <strong id="lan-discovery-title">MikroTiks na rede</strong>
            <span>Equipamentos encontrados na rede local</span>
          </div>
          <button disabled={isLoading} onClick={refreshLanDevices} type="button">
            Atualizar
          </button>
        </header>

        {lanDiscovery.devices.length > 0 ? (
          <div className="lan-device-list">
            {lanDiscovery.devices.map((device) => {
              const hasUsableIp = device.ip_address && device.ip_address !== "0.0.0.0";
              return (
                <article
                  className={selectedDeviceMac === device.mac_address
                    ? "lan-device lan-device--selected"
                    : "lan-device"}
                  key={device.mac_address}
                >
                  <div className="lan-device__identity">
                    <strong>{device.identity || "MikroTik sem identidade"}</strong>
                    <span>{device.board || device.platform || "Modelo não informado"}</span>
                  </div>
                  <div className="lan-device__addresses">
                    <span>{hasUsableIp ? device.ip_address : "Sem IP"}</span>
                    <small>{device.mac_address}</small>
                  </div>
                  <div className="lan-device__actions">
                    {hasUsableIp && (
                      <button
                        className="lan-device__primary-action"
                        onClick={() => useDeviceIp(device)}
                        type="button"
                      >
                        {selectedDeviceMac === device.mac_address ? "Selecionado" : "Usar no ORION"}
                      </button>
                    )}
                    <button
                      className={!hasUsableIp ? "lan-device__primary-action" : "lan-device__secondary-action"}
                      disabled={openingMac === device.mac_address}
                      onClick={() => selectMacDevice(device)}
                      type="button"
                    >
                      {openingMac === device.mac_address
                        ? "Abrindo…"
                        : hasUsableIp ? "Abrir no WinBox" : "Preparar por MAC"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="lan-discovery__empty">Procurando equipamentos conectados à mesma rede local…</p>
        )}

        {preparedDevice && (
            <section className="mac-access-panel" aria-labelledby="mac-access-title">
              <header>
                <div>
                  <p className="card-kicker">Acesso inicial</p>
                  <strong id="mac-access-title">
                    {preparedDevice.identity || preparedDevice.mac_address}
                  </strong>
                </div>
                <button onClick={() => setMacPreparation("")} type="button">Fechar</button>
              </header>

              <div className="mac-access-panel__terminal">
                  <div>
                    <strong>Preparar acesso temporário</strong>
                    <span>O ORION usará o MAC apenas para atribuir o IP e habilitar a API.</span>
                  </div>
                  <div className="mac-access-panel__network-fields">
                    <label className="field">
                        <span>IP temporário do MikroTik</span>
                      <input
                        inputMode="decimal"
                        onChange={(event) => {
                          setBootstrapAddress(event.target.value);
                          setBootstrapPreview(null);
                          setBootstrapStatus("");
                        }}
                        placeholder="Selecione a placa de rede para sugerir"
                        value={bootstrapAddress}
                      />
                    </label>
                    <label className="field">
                      <span>Porta conectada no MikroTik</span>
                      <input
                        onChange={(event) => {
                          setBootstrapInterface(event.target.value);
                          setBootstrapPreview(null);
                          setBootstrapStatus("");
                        }}
                        placeholder="Ex.: ether1"
                        value={bootstrapInterface}
                      />
                    </label>
                    <label className="field field--wide">
                      <span>Placa de rede deste computador</span>
                      <select
                        onChange={(event) => {
                          setAdapterIndex(event.target.value);
                          setBootstrapPreview(null);
                          const adapter = networkAdapters.find(
                            (item) => String(item.interface_index) === event.target.value,
                          );
                          const suggestion = suggestedManagementAddress(adapter);
                          if (suggestion) setBootstrapAddress(suggestion);
                        }}
                        value={adapterIndex}
                      >
                        <option value="">Selecione a conexão por cabo</option>
                        {networkAdapters.map((adapter) => (
                          <option key={`${adapter.interface_index}-${adapter.ipv4_address}`} value={adapter.interface_index}>
                            {adapter.name} · {adapter.ipv4_address}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {bootstrapPreview && (
                    <div className="mac-bootstrap-preview">
                      <div>
                        <span>Configuração encontrada</span>
                        <strong>{bootstrapPreview.current.identity || "Sem identidade"}</strong>
                        <small>{bootstrapPreview.current.addresses.length
                          ? bootstrapPreview.current.addresses.join(" · ")
                          : "Nenhum IP configurado"}</small>
                        <small>API {bootstrapPreview.current.api_enabled ? "ativa" : "inativa"}
                          {bootstrapPreview.current.api_port ? ` · porta ${bootstrapPreview.current.api_port}` : ""}</small>
                      </div>
                      <ul>{bootstrapPreview.commands.map((command) => <li key={command}>{command}</li>)}</ul>
                    </div>
                  )}
                  {bootstrapPreview?.warnings?.length > 0 && (
                    <ul className="configuration-warnings">
                      {bootstrapPreview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  )}
                  <div className="mac-access-panel__command-actions">
                    {!bootstrapPreview ? (
                      <button disabled={!bootstrapReady || bootstrapBusy} onClick={() => inspectMacBootstrap(preparedDevice)} type="button">
                        {bootstrapBusy ? "Verificando…" : "Verificar configuração atual"}
                      </button>
                    ) : (
                      <button disabled={bootstrapBusy} onClick={() => confirmMacBootstrap(preparedDevice)} type="button">
                        {bootstrapBusy ? "Preparando…" : "Aplicar IP e conectar"}
                      </button>
                    )}
                    <span>Depois disso, todo o gerenciamento continua pela API normal do RouterOS.</span>
                  </div>
                  {bootstrapStatus && <small>{bootstrapStatus}</small>}
                </div>

              <details className="mac-access-panel__fallback">
                <summary>Plano B: abrir o WinBox</summary>
                {needsWinboxPath ? (
                  <div className="mac-access-panel__locator">
                    <div>
                      <strong>Localize o WinBox uma única vez</strong>
                      <span>Use este caminho se o MAC Server do RouterOS estiver desativado.</span>
                    </div>
                    <button onClick={() => chooseWinBox(preparedDevice)} type="button">
                      Selecionar winbox.exe
                    </button>
                  </div>
                ) : (
                  <button onClick={() => handleOpenWinBox(preparedDevice)} type="button">
                    Abrir WinBox
                  </button>
                )}
              </details>
            </section>
        )}

        {discoveryError && <p className="lan-discovery__warning">{discoveryError}</p>}
        {winboxMessage && (
          <p className={winboxMessageKind === "error" ? "lan-discovery__warning" : "lan-discovery__message"}>
            {winboxMessage}
          </p>
        )}
      </section>

      <div className="connection-selection-hint" role="status">
        <span>1</span>
        <strong>Escolha o MikroTik acima</strong>
        <b>2</b>
        <strong>Informe o acesso abaixo</strong>
        <b>3</b>
        <strong>Conecte e revise antes de alterar</strong>
      </div>

      <div className="form-grid" id="connection-credentials">
        <label className="field field--wide">
          <span>Endereço IP</span>
          <input
            autoFocus
            inputMode="decimal"
            name="host"
            onChange={updateField}
            placeholder="192.168.88.1"
            required
            value={form.host}
          />
        </label>

        <label className="field">
          <span>Usuário</span>
          <input
            autoComplete="off"
            name="username"
            onChange={updateField}
            required
            value={form.username}
          />
        </label>

        <label className="field">
          <span>Senha</span>
          <input
            autoComplete="off"
            name="password"
            onChange={updateField}
            type="password"
            value={form.password}
          />
        </label>

      </div>

      <details className="advanced-options">
        <summary>
          <span>Opções avançadas</span>
          <small>
            {form.use_tls ? `API-SSL · porta ${form.port}` : `API · porta ${form.port}`}
          </small>
        </summary>

        <div className="advanced-grid">
          <label className="field">
            <span>Porta da API</span>
            <input
              max="65535"
              min="1"
              name="port"
              onChange={updateField}
              required
              type="number"
              value={form.port}
            />
          </label>

          <div className="connection-options">
            <label className="check-field">
              <input
                checked={form.use_tls}
                name="use_tls"
                onChange={updateTls}
                type="checkbox"
              />
              <span>Usar conexão segura (TLS)</span>
            </label>

            {form.use_tls && (
              <label className="check-field">
                <input
                  checked={form.verify_tls}
                  name="verify_tls"
                  onChange={updateField}
                  type="checkbox"
                />
                <span>Validar certificado</span>
              </label>
            )}
          </div>
        </div>

        {!form.use_tls && (
          <p className="security-note">
            A API padrão deve ser usada somente na rede local da instalação.
            Para redes não confiáveis, habilite API-SSL no MikroTik.
          </p>
        )}
      </details>

      {endpointMessage && (
        <p className="security-note" role="alert">{endpointMessage}</p>
      )}

      <button className="primary-button" disabled={isLoading} type="submit">
        {isLoading ? "Conectando…" : "Conectar e identificar"}
      </button>
    </form>
  );
}

export default ConnectionForm;
