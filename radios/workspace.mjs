import LinkConfiguration from "./frontend/RadioLink.jsx";
import AlignmentMonitor from "../shared/frontend/src/features/wireless/AlignmentMonitor.jsx";
import ConnectionForm from "./frontend/RadioConnection.jsx";
import Overview from "./frontend/RadioOverview.jsx";
import ConnectionHelp from "./frontend/ConnectionHelp.jsx";

export default {
  id: "radios",
  name: "RÁDIOS",
  title: "ORION — Rádios",
  components: { ConnectionForm, LinkConfiguration, AlignmentMonitor, Overview, ConnectionHelp },
  tabs: [
    { id: "routeros", label: "Equipamento" },
    { id: "configuration", label: "Enlace", capability: "wifi" },
    { id: "tests", label: "Testes" },
  ],
};
