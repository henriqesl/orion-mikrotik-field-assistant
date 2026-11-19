import "./radio.css";
import { linkStatus } from "./linkStatus.js";
import Icon from "../../shared/frontend/src/components/Icon.jsx";

export default function RadioOverview({ device, monitoringError, disabled, onConfigure, onTests }) {
  const interfaces = device.wifi_interfaces || [];
  const peers = device.wifi_peers || [];
  const status = linkStatus(device, monitoringError);
  return (
    <section className="radio-overview" aria-label="Resumo do enlace">
      <header>
        <div><p className="card-kicker">Visão geral</p><h2>Seu enlace</h2></div>
        <strong className="radio-overview__status" data-state={status.state}><span className="radio-status-dot" />{status.label}</strong>
      </header>
      <div className="radio-topology" data-state={status.state}>
      <div className="radio-local-node">
        <div className="radio-node-icon"><Icon name="radio" /></div>
        <span className="radio-node-label">Este equipamento</span>
        <h3>{device.identity}</h3><p>{device.model}</p>
        <span className="radio-os">RouterOS {device.routeros_version}</span>
      </div>
      <div className="radio-link-line" aria-hidden="true"><span /><Icon name="link" /><span /></div>
      <div className="radio-remote-nodes">
      <div className="radio-remote-heading"><Icon name="network" /><span>{monitoringError || !device.registration_table_available ? "Última leitura" : "Equipamentos remotos"}</span><b>{device.registration_table_available ? peers.length : "—"}</b></div>
      {peers.length > 0 ? <ul className="radio-overview__peers" aria-label="Equipamentos remotos">
        {peers.map((peer, index) => <li key={`${peer.interface}-${peer.mac_address}-${index}`}>
          <div className="radio-peer-identity"><Icon name="radio" /><div><strong>{peer.radio_name || peer.mac_address || "Equipamento remoto"}</strong><span>{peer.interface} · {peer.mac_address}</span></div></div>
          <div className="radio-peer-signal"><Icon name="signal" /><strong>{Number.isFinite(peer.signal_dbm) ? `${peer.signal_dbm} dBm` : "Sinal não informado"}</strong></div>
          <span className="radio-peer-auth" data-authorized={String(peer.authorized)}>{peer.authorized === true ? "Autorizado" : peer.authorized === false ? "Aguardando autorização" : "Autorização não informada"}</span>
        </li>)}
      </ul> : <div className="radio-empty-peer"><Icon name="radio" /><strong>{device.registration_table_available ? "Aguardando o outro lado" : "Associação sem leitura"}</strong><span>Confira em Enlace ou atualize a leitura.</span></div>}
      </div>
      </div>
      <div className="radio-overview__interfaces">
        {interfaces.map((item) => <div key={item.name}>
          <div className="radio-interface-name"><Icon name="radio" /><strong>{item.name}</strong><span>{item.disabled ? "Desativada" : item.mode?.startsWith("station") ? "Station" : ["ap", "ap-bridge", "bridge"].includes(item.mode) ? "AP" : item.mode || "Função não informada"}</span></div>
          <dl><div><dt>Rede / SSID</dt><dd>{item.ssid || "Não informado"}</dd></div>
            <div><dt>Frequência</dt><dd>{item.frequency ? /^\d+$/.test(item.frequency) ? `${item.frequency} MHz` : item.frequency : "—"}</dd></div>
            <div><dt>Canal</dt><dd>{item.channel_width?.replaceAll("mhz", " MHz") || "—"}</dd></div></dl>
        </div>)}
      </div>
      <footer>
        <details className="radio-inline-help"><summary><Icon name="info" /> Entender este estado</summary><p>{status.hint}</p></details>
        <div>
          <button className="primary-button" type="button" disabled={disabled || !interfaces.length || Boolean(monitoringError)} onClick={onConfigure}><Icon name="settings" />Configurar enlace</button>
          <button type="button" disabled={disabled} onClick={onTests}><Icon name="activity" />Testar comunicação</button>
        </div>
      </footer>
    </section>
  );
}
