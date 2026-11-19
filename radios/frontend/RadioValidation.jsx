import { linkStatus } from "./linkStatus.js";
import "./radio.css";

export default function RadioValidation({ device, monitoringError, disabled, onRefresh, onConfigure }) {
  const status = linkStatus(device, monitoringError);
  return (
    <section className="radio-validation" aria-label="Conferência do enlace">
      <header><p className="card-kicker">Conferência do enlace</p><h2>Do rádio ao outro lado</h2></header>
      <div className="radio-validation__steps">
        <div><h3>1. Associação</h3><strong data-state={status.state}>{status.label}</strong><p>{status.hint}</p></div>
        <div><h3>2. Comunicação</h3><p>No teste abaixo, informe o IP real do outro rádio. O teste parte do MikroTik conectado, não do computador.</p><p>Uma resposta confirma acesso ao destino; não identifica por qual caminho os pacotes passaram.</p></div>
        <div><h3>3. Uso do enlace</h3><p>Teste o acesso a um equipamento do outro lado. Em um AP com várias Stations, confira cada uma separadamente.</p><p>Configuração salva e sinal presente não substituem essa conferência.</p></div>
      </div>
      <footer>
        <button type="button" disabled={disabled} onClick={onRefresh}>Atualizar associação</button>
        <button type="button" disabled={disabled || !device.wifi_interfaces?.length || Boolean(monitoringError)} onClick={onConfigure}>Revisar enlace</button>
      </footer>
    </section>
  );
}
