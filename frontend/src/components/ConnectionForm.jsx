import { useState } from "react";

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

  return (
    <form className="connection-form" onSubmit={handleSubmit}>
      <div className="section-heading">
        <div>
          <p className="card-kicker">Conectar ao equipamento</p>
          <h2>Dados de acesso</h2>
        </div>
      </div>

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
