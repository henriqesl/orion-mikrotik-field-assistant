export default {
  id: "routerboards",
  name: "ROUTERBOARDS",
  title: "ORION — RouterBoards",
  tabs: [
    { id: "routeros", label: "Dados reais do RouterOS" },
    { id: "network", label: "Rede básica", capability: "router" },
    { id: "configuration", label: "Configuração do rádio", capability: "wifi" },
    { id: "lora", label: "LoRa", capability: "lora" },
    { id: "tests", label: "Testes" },
  ],
};
