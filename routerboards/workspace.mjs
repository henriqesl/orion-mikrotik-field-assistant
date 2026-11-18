import BasicNetworkConfiguration from "./frontend/BasicNetworkConfiguration.jsx";
import LoraProtection from "./frontend/LoraProtection.jsx";
import LinkConfiguration from "../shared/frontend/src/features/wireless/LinkConfiguration.jsx";
import AlignmentMonitor from "../shared/frontend/src/features/wireless/AlignmentMonitor.jsx";

export default {
  id: "routerboards",
  name: "ROUTERBOARDS",
  title: "ORION — RouterBoards",
  components: { BasicNetworkConfiguration, LoraProtection, LinkConfiguration, AlignmentMonitor },
  tabs: [
    { id: "routeros", label: "Dados reais do RouterOS" },
    { id: "network", label: "Rede básica", capability: "router" },
    { id: "configuration", label: "Configuração do rádio", wifiLabel: "Configuração Wi-Fi", capability: "wifi" },
    { id: "lora", label: "LoRa", capability: "lora" },
    { id: "tests", label: "Testes" },
  ],
};
