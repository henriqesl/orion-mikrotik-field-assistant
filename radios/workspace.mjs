import LinkConfiguration from "../shared/frontend/src/features/wireless/LinkConfiguration.jsx";
import AlignmentMonitor from "../shared/frontend/src/features/wireless/AlignmentMonitor.jsx";

export default {
  id: "radios",
  name: "RÁDIOS",
  title: "ORION — Rádios",
  components: { LinkConfiguration, AlignmentMonitor },
  tabs: [
    { id: "routeros", label: "Equipamento" },
    { id: "configuration", label: "Enlace", capability: "wifi" },
    { id: "tests", label: "Testes" },
  ],
};
