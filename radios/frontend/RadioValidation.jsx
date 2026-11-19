import { linkStatus } from "./linkStatus.js";
import "./radio.css";
import Icon from "../../shared/frontend/src/components/Icon.jsx";

export default function RadioValidation({ device, monitoringError, disabled, onRefresh, onConfigure, summary, onSelectTarget }) {
  const status = linkStatus(device, monitoringError);
  const macs = new Set((device.wifi_interfaces || []).map((wifi) => wifi.mac_address?.toUpperCase()).filter(Boolean));
  const currentStation = summary?.stations.find((station) => macs.has(station.mac?.toUpperCase()));
  const currentAP = summary?.ap.mac && macs.has(summary.ap.mac.toUpperCase());
  const targets = currentAP ? summary.stations : currentStation ? [summary.ap] : [];
  const peers = (device.wifi_peers || []).filter((peer) => !currentStation?.wifi_interface || peer.interface === currentStation.wifi_interface);
  const expectedPeer = currentStation && peers.find((peer) => peer.mac_address?.toUpperCase() === summary.ap.mac?.toUpperCase());
  return (
    <section className="radio-validation" aria-label="Conferência do enlace">
      <header><p className="card-kicker">Conferência do enlace</p><h2>Conexão e sinal</h2></header>
      {summary && (currentAP || currentStation) && <section className="radio-validation__session" aria-label="Equipamentos configurados nesta sessão">
        <h3>{summary.ssid} · configuração conferida</h3>
        {currentStation && <p>AP esperado: {summary.ap.identity} · {summary.ap.mac || "MAC não disponível"}.
          {monitoringError || !device.registration_table_available ? " Atualize a leitura para conferir a associação."
            : expectedPeer ? expectedPeer.authorized === false ? " Encontrado, mas ainda sem autorização." : " MAC encontrado na associação atual."
              : peers.length ? " O rádio está associado a outro MAC. Confira o AP antes de continuar." : " Associação com esse AP ainda não detectada."}</p>}
        <div className="radio-validation__targets">{targets.filter((target) => target.address).map((target) => <button type="button" disabled={disabled} key={target.mac || target.address}
          onClick={() => onSelectTarget?.(target.address.split("/")[0])}>
          Usar IP de {target.identity}: {target.address.split("/")[0]}
        </button>)}</div>
        <p>Selecione o destino; inicie o teste abaixo.</p>
      </section>}
      <div className="radio-validation__steps">
        <div><Icon name="link" /><h3>Associação</h3><strong data-state={status.state}>{status.label}</strong></div>
        <div><Icon name="activity" /><h3>Comunicação</h3><span>Teste o IP do outro rádio</span></div>
        <div><Icon name="ethernet" /><h3>Ponta a ponta</h3><span>Confira o equipamento além do enlace</span></div>
      </div>
      <details className="radio-inline-help"><summary><Icon name="info" /> Como conferir o enlace</summary>
        <p>{status.hint}</p>
        <p>O ping parte do MikroTik. Uma resposta confirma acesso ao destino, não o caminho utilizado.</p>
        <p>Em um AP com várias Stations, confira cada uma separadamente.</p>
      </details>
      <footer>
        <button type="button" disabled={disabled} onClick={onRefresh}><Icon name="refresh" />Atualizar associação</button>
        <button type="button" disabled={disabled || !device.wifi_interfaces?.length || Boolean(monitoringError)} onClick={onConfigure}><Icon name="settings" />Revisar enlace</button>
      </footer>
    </section>
  );
}
