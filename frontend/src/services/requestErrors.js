const labels = {
  host: "IP do equipamento", port: "Porta da API", username: "Usuário", password: "Senha de acesso",
  identity: "Nome do equipamento", ssid: "SSID", passphrase: "Senha Wi-Fi", ap_bssid: "MAC do AP",
  management_ip: "IP de gerenciamento", wan_address: "IP da WAN", gateway: "Gateway",
  lan_address: "IP da LAN", lan_ports: "Portas LAN", bridge_interfaces: "Portas da bridge",
  frequency_mhz: "Frequência", dhcp_pool_start: "Início do pool DHCP", dhcp_pool_end: "Fim do pool DHCP",
};

export function requestErrorMessage(detail) {
  if (typeof detail === "string") return detail.replace(/&#x20;|&nbsp;/gi, " ").trim();
  if (!Array.isArray(detail)) return "Não foi possível concluir a solicitação. Tente novamente.";
  return detail.slice(0, 3).map((item) => {
    const label = labels[item.loc?.at(-1)];
    const message = item.type === "missing" ? "Campo obrigatório."
      : item.type?.includes("ipv4") ? "Informe um endereço IPv4 válido."
      : item.type === "int_parsing" ? "Use um número inteiro."
      : String(item.msg || "Confira o valor informado.").replace(/^Value error, /, "");
    return label ? `${label}: ${message}` : message;
  }).join(" ");
}
