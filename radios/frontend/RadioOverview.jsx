import "./radio.css";

export default function RadioOverview({ device, monitoringError, disabled, onConfigure, onTests }) {
  const interfaces = device.wifi_interfaces || [];
  const peers = device.wifi_peers || [];
  const status = monitoringError ? "Leitura desatualizada"
    : !interfaces.length ? "Wi-Fi não detectado"
      : !device.registration_table_available ? "Associação não disponível para leitura"
        : peers.length ? "Associação detectada" : "Nenhum equipamento associado";
  return (
    <section className="radio-overview" aria-label="Resumo do enlace">
      <header>
        <div><p className="card-kicker">Equipamento acessado</p><h2>{device.identity}</h2><p>{device.model} · RouterOS {device.routeros_version}</p></div>
        <strong className="radio-overview__status">{status}</strong>
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
          <span>{peer.authorized === true ? "Autorizado" : peer.authorized === false ? "Autorização pendente" : "Autorização não informada"}</span>
        </li>)}
      </ul>}
      <footer>
        <p>{monitoringError ? "Os dados são da última leitura. Atualize o equipamento antes de decidir qualquer alteração."
          : !interfaces.length ? "Confira o modelo, os pacotes e as permissões de leitura. A configuração de enlace permanece indisponível."
            : !device.registration_table_available ? "A lista de associações não pôde ser lida. Isso não comprova que o enlace esteja desconectado."
              : peers.length ? "Confira o equipamento remoto e use os testes para verificar a comunicação." : "Revise o enlace ou conecte o outro rádio para verificar a associação."}</p>
        <div>
          <button type="button" disabled={disabled || !interfaces.length || Boolean(monitoringError)} onClick={onConfigure}>Configurar enlace</button>
          <button type="button" disabled={disabled} onClick={onTests}>Testar comunicação</button>
        </div>
      </footer>
    </section>
  );
}
