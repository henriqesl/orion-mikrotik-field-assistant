import { useCallback, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { discoverLanDevices, openWinBox } from "../services/api.js";
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

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("A cópia automática não está disponível.");
}

function ConnectionForm({ isLoading, onConnect }) {
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
  const [commandCopyStatus, setCommandCopyStatus] = useState("");

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

    const succeeded = await onConnect({
      ...form,
      port: Number(form.port),
    });

    if (succeeded) {
      setForm((current) => ({ ...current, password: "" }));
    }
  }

  function useDeviceIp(device) {
    setForm((current) => ({ ...current, host: device.ip_address }));
    setWinboxMessage("");
  }

  async function handleOpenWinBox(device, executablePath = null) {
    if (!device.ip_address || device.ip_address === "0.0.0.0") {
      setMacPreparation(device.mac_address);
      setBootstrapInterface(device.interface || "ether1");
      setCommandCopyStatus("");
    }
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

  async function copyBootstrapCommands() {
    const address = bootstrapAddress.trim();
    const interfaceName = bootstrapInterface.trim();

    if (!isValidIpv4Cidr(address) || !isValidInterfaceName(interfaceName)) {
      setCommandCopyStatus("Informe um IP com prefixo e uma interface válida.");
      return;
    }

    const commands = [
      `/ip address add address=${address} interface="${interfaceName}" comment="ORION Field - acesso inicial"`,
      "/ip service set api disabled=no port=8728",
    ].join("\n");

    try {
      await copyText(commands);
      setForm((current) => ({ ...current, host: address.split("/")[0] }));
      setCommandCopyStatus("Comandos copiados. Cole no terminal do WinBox e pressione Enter.");
    } catch (error) {
      setCommandCopyStatus(error.message);
    }
  }

  const preparedDevice = macPreparation
    ? lanDiscovery.devices.find(
      (device) => device.mac_address === macPreparation,
    ) || { mac_address: macPreparation }
    : null;
  const bootstrapCommandsReady =
    isValidIpv4Cidr(bootstrapAddress) && isValidInterfaceName(bootstrapInterface);
  const bootstrapCommands = bootstrapCommandsReady
    ? [
        `/ip address add address=${bootstrapAddress.trim()} interface="${bootstrapInterface.trim()}" comment="ORION Field - acesso inicial"`,
        "/ip service set api disabled=no port=8728",
      ].join("\n")
    : "Preencha o IP com prefixo e confirme a interface para gerar os comandos.";

  return (
    <form className="connection-form" onSubmit={handleSubmit}>
      <div className="section-heading">
        <div>
          <p className="card-kicker">Conectar ao equipamento</p>
          <h2>Dados de acesso</h2>
        </div>
      </div>

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
                <article className="lan-device" key={device.mac_address}>
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
                      <button onClick={() => useDeviceIp(device)} type="button">Usar IP</button>
                    )}
                    <button
                      className={!hasUsableIp ? "lan-device__primary-action" : ""}
                      disabled={openingMac === device.mac_address}
                      onClick={() => handleOpenWinBox(device)}
                      type="button"
                    >
                      {openingMac === device.mac_address
                        ? "Abrindo…"
                        : hasUsableIp ? "Abrir no WinBox" : "Abrir via MAC"}
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

              {needsWinboxPath ? (
                <div className="mac-access-panel__locator">
                  <div>
                    <strong>Localize o WinBox uma única vez</strong>
                    <span>Selecione o executável oficial. O ORION memorizará esse caminho.</span>
                  </div>
                  <button onClick={() => chooseWinBox(preparedDevice)} type="button">
                    Selecionar winbox.exe
                  </button>
                </div>
              ) : (
                <div className="mac-access-panel__terminal">
                  <div>
                    <strong>Preparar pelo terminal</strong>
                    <span>Escolha o endereço deste equipamento e confirme a porta conectada.</span>
                  </div>
                  <div className="mac-access-panel__network-fields">
                    <label className="field">
                      <span>IP com prefixo</span>
                      <input
                        inputMode="decimal"
                        onChange={(event) => {
                          setBootstrapAddress(event.target.value);
                          setCommandCopyStatus("");
                        }}
                        placeholder="Ex.: 192.168.10.1/24"
                        value={bootstrapAddress}
                      />
                    </label>
                    <label className="field">
                      <span>Interface Ethernet</span>
                      <input
                        onChange={(event) => {
                          setBootstrapInterface(event.target.value);
                          setCommandCopyStatus("");
                        }}
                        placeholder="Ex.: ether1"
                        value={bootstrapInterface}
                      />
                    </label>
                  </div>
                  <pre className={bootstrapCommandsReady ? "routeros-command" : "routeros-command routeros-command--pending"}>
                    <code>{bootstrapCommands}</code>
                  </pre>
                  <div className="mac-access-panel__command-actions">
                    <button disabled={!bootstrapCommandsReady} onClick={copyBootstrapCommands} type="button">
                      Copiar comandos
                    </button>
                    <span>Abra <strong>New Terminal</strong> no WinBox, cole e execute uma vez.</span>
                  </div>
                  {commandCopyStatus && <small>{commandCopyStatus}</small>}
                </div>
              )}

              <div className="mac-access-panel__actions">
                <button
                  disabled={openingMac === preparedDevice.mac_address}
                  onClick={() => handleOpenWinBox(preparedDevice)}
                  type="button"
                >
                  {openingMac === preparedDevice.mac_address ? "Abrindo…" : "Abrir WinBox novamente"}
                </button>
                {!needsWinboxPath && (
                  <button onClick={() => chooseWinBox(preparedDevice)} type="button">
                    Trocar executável
                  </button>
                )}
              </div>
            </section>
        )}

        {discoveryError && <p className="lan-discovery__warning">{discoveryError}</p>}
        {winboxMessage && (
          <p className={winboxMessageKind === "error" ? "lan-discovery__warning" : "lan-discovery__message"}>
            {winboxMessage}
          </p>
        )}
      </section>

      <div className="form-grid">
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

      <button className="primary-button" disabled={isLoading} type="submit">
        {isLoading ? "Conectando…" : "Conectar e identificar"}
      </button>
    </form>
  );
}

export default ConnectionForm;
