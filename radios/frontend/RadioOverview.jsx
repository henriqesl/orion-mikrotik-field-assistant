import "./radio.css";
import { linkStatus } from "./linkStatus.js";

export default function RadioOverview({ device, monitoringError, disabled, onConfigure, onTests }) {
  const interfaces = device.wifi_interfaces || [];
  const peers = device.wifi_peers || [];
  const status = linkStatus(device, monitoringError);
  return (
    <section className="radio-overview" aria-label="Resumo do enlace">
      <header>
        <div><p className="card-kicker">Equipamento acessado</p><h2>{device.identity}</h2><p>{device.model} · RouterOS {device.routeros_version}</p></div>
        <strong className="radio-overview__status" data-state={status.state}>{status.label}</strong>
      </header>
      <div className="radio-overview__interfaces">
        {interfaces.map((item) => <div key={item.name}>
          <strong>{item.name}</strong>
          <span>{item.disabled ? "Desativada" : item.mode?.startsWith("station") ? "Station" : ["ap", "ap-bridge", "bridge"].includes(item.mode) ? "AP" : item.mode || "Função não informada"}</span>
          <span>{item.ssid || "SSID não informado"}</span>
        </div>)}
      </div>
      {peers.length > 0 && <ul className="radio-overview__peers" aria-label="Equipamentos remotos">
        {peers.map((peer, index) => <li key={`${peer.interface}-${peer.mac_address}-${index}`}>
          <strong>{peer.radio_name || peer.mac_address || "Equipamento remoto"}</strong>
          <span>{peer.interface} · {peer.mac_address}</span>
          <span>{Number.isFinite(peer.signal_dbm) ? `${peer.signal_dbm} dBm` : "Sinal não informado"}</span>
          <span>{peer.authorized === true ? "Autorizado" : peer.authorized === false ? "Aguardando autorização" : "Autorização não informada"}</span>
        </li>)}
      </ul>}
      <footer>
        <p>{status.hint}</p>
        <div>
          <button type="button" disabled={disabled || !interfaces.length || Boolean(monitoringError)} onClick={onConfigure}>Configurar enlace</button>
          <button type="button" disabled={disabled} onClick={onTests}>Testar comunicação</button>
        </div>
      </footer>
    </section>
  );
}
