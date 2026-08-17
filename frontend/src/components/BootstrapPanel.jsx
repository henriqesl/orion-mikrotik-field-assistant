import { useState } from "react";

import { generateBootstrap } from "../services/api.js";

const INITIAL_BOOTSTRAP = {
  interface_name: "ether1",
  address: "192.168.88.1/24",
};

function downloadScript(result) {
  const blob = new Blob([result.script], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function BootstrapPanel({ device, onClose }) {
  const [form, setForm] = useState({
    ...INITIAL_BOOTSTRAP,
    interface_name: device.interface || INITIAL_BOOTSTRAP.interface_name,
  });
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setResult(null);
    setErrorMessage("");
    setCopyMessage("");
  }

  async function handleGenerate(event) {
    event.preventDefault();
    setIsGenerating(true);
    setErrorMessage("");
    try {
      const generated = await generateBootstrap(form.interface_name, form.address);
      setResult(generated);
      downloadScript(generated);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyImportCommand() {
    try {
      await navigator.clipboard.writeText(`/import file-name=${result.filename}`);
      setCopyMessage("Comando copiado.");
    } catch {
      setCopyMessage(`Use: /import file-name=${result.filename}`);
    }
  }

  return (
    <section className="bootstrap-panel" aria-labelledby="bootstrap-title">
      <header>
        <div>
          <p className="card-kicker">Acesso por MAC assistido</p>
          <strong id="bootstrap-title">Preparar {device.identity || device.mac_address}</strong>
        </div>
        <button onClick={onClose} type="button">Fechar</button>
      </header>

      <div className="bootstrap-steps">
        <span><b>1</b> Entre no equipamento pelo WinBox aberto no MAC.</span>
        <span><b>2</b> Gere o arquivo com a interface e o IP temporário.</span>
        <span><b>3</b> Envie o arquivo em <strong>Files</strong> e importe pelo terminal.</span>
      </div>

      <div className="bootstrap-fields">
        <label className="field">
          <span>Interface conectada ao computador</span>
          <input name="interface_name" onChange={updateField} required value={form.interface_name} />
        </label>
        <label className="field">
          <span>IP temporário do MikroTik</span>
          <input name="address" onChange={updateField} required value={form.address} />
        </label>
      </div>

      <button className="primary-button" disabled={isGenerating} onClick={handleGenerate} type="button">
        {isGenerating ? "Gerando…" : "Gerar e baixar bootstrap"}
      </button>

      {errorMessage && <p className="lan-discovery__warning">{errorMessage}</p>}
      {result && (
        <div className="bootstrap-result">
          <strong>{result.filename} baixado</strong>
          <span>IP sugerido para o computador: {result.computer_ip_suggestion}/{result.prefix_length}</span>
          <button onClick={copyImportCommand} type="button">Copiar comando de importação</button>
          {copyMessage && <small>{copyMessage}</small>}
        </div>
      )}
    </section>
  );
}

export default BootstrapPanel;
