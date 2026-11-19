export function linkStatus(device, monitoringError) {
  const interfaces = device.wifi_interfaces || [];
  const peers = device.wifi_peers || [];
  if (monitoringError) return { label: "Leitura desatualizada", hint: "Atualize o equipamento antes de avaliar o enlace.", state: "unknown" };
  if (!interfaces.length) return { label: "Wi-Fi não detectado", hint: "Confira o modelo, os pacotes e as permissões de leitura.", state: "unknown" };
  if (interfaces.every((item) => item.disabled === true)) return { label: "Wi-Fi desativado", hint: "Revise a interface na aba Enlace antes de testar o outro rádio.", state: "pending" };
  if (!device.registration_table_available) return { label: "Associação não disponível para leitura", hint: "A lista de associações não pôde ser lida. Isso não comprova que o enlace esteja desconectado.", state: "unknown" };
  if (!peers.length) return {
    label: "Nenhum equipamento associado",
    hint: interfaces.some((item) => !item.disabled && item.mode?.startsWith("station"))
      ? "Confira se o AP está ligado e se SSID, senha e faixa de frequência correspondem ao enlace."
      : "Ligue a Station e confira se ela usa o SSID, a senha e a faixa de frequência deste AP.",
    state: "pending",
  };
  if (peers.some((peer) => peer.authorized === false)) return { label: "Autorização pendente", hint: "Há equipamento remoto sem autorização. Confira a segurança do enlace antes de prosseguir.", state: "pending" };
  return { label: "Associação detectada", hint: "Confira o MAC do equipamento remoto. A associação não confirma a comunicação por IP.", state: "detected" };
}
