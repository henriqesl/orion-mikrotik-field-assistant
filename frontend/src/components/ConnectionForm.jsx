import { useCallback, useEffect, useState } from "react";

import { discoverLanDevices, openWinBox } from "../services/api.js";

const INITIAL_FORM = {
  host: "192.168.88.1",
  username: "admin",
  password: "",
  port: 8728,
  use_tls: false,
  verify_tls: true,
};

function ConnectionForm({ isLoading, onConnect }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [lanDiscovery, setLanDiscovery] = useState({ status: "listening", devices: [] });
  const [discoveryError, setDiscoveryError] = useState("");
  const [openingMac, setOpeningMac] = useState("");
  const [winboxMessage, setWinboxMessage] = useState("");

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

  async function handleOpenWinBox(device) {
    setOpeningMac(device.mac_address);
    setWinboxMessage("");
    try {
      const result = await openWinBox(device.mac_address, form.username);
      setWinboxMessage(result.summary);
    } catch (error) {
      setWinboxMessage(error.message);
    } finally {
      setOpeningMac("");
    }
  }

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
            <span>Descoberta local por MNDP</span>
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
                      {openingMac === device.mac_address ? "Abrindo…" : "Abrir no WinBox"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="lan-discovery__empty">Procurando equipamentos conectados à mesma rede local…</p>
        )}

        {discoveryError && <p className="lan-discovery__warning">{discoveryError}</p>}
        {winboxMessage && <p className="lan-discovery__message">{winboxMessage}</p>}
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
