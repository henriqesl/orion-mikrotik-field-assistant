import { useCallback, useEffect, useRef, useState } from "react";

import ConnectionForm from "./components/ConnectionForm.jsx";
import ConnectivityValidation from "./components/ConnectivityValidation.jsx";
import DeviceSummary from "./components/DeviceSummary.jsx";
import AlignmentMonitor from "./components/AlignmentMonitor.jsx";
import LinkConfiguration from "./components/LinkConfiguration.jsx";
import PingTest from "./components/PingTest.jsx";
import { discoverDevice } from "./services/api.js";

const API_STATES = {
  checking: {
    label: "Verificando backend",
    className: "status status--checking",
  },
  online: {
    label: "Backend disponível",
    className: "status status--online",
  },
  offline: {
    label: "Backend indisponível",
    className: "status status--offline",
  },
};

const MONITOR_INTERVAL_MS = 15_000;
const ALIGNMENT_INTERVAL_MS = 3_000;
const WORKSPACE_TABS = [
  { id: "routeros", label: "Dados reais do RouterOS" },
  { id: "configuration", label: "Configuração do rádio" },
  { id: "tests", label: "Testes" },
];

function App() {
  const [apiState, setApiState] = useState("checking");
  const [device, setDevice] = useState(null);
  const [activeConnection, setActiveConnection] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [monitoringError, setMonitoringError] = useState("");
  const [isAlignmentMode, setIsAlignmentMode] = useState(false);
  const [activeTab, setActiveTab] = useState("routeros");
  const refreshInFlight = useRef(false);
  const connectionGeneration = useRef(0);

  useEffect(() => {
    const controller = new AbortController();

    async function checkApi() {
      try {
        const response = await fetch("/api/health", {
          signal: controller.signal,
        });
        const data = await response.json();

        setApiState(response.ok && data.status === "ok" ? "online" : "offline");
      } catch (error) {
        if (error.name !== "AbortError") {
          setApiState("offline");
        }
      }
    }

    checkApi();

    return () => controller.abort();
  }, []);

  const refreshDevice = useCallback(async () => {
    if (!activeConnection || refreshInFlight.current) {
      return;
    }

    refreshInFlight.current = true;
    const refreshGeneration = connectionGeneration.current;
    setIsRefreshing(true);

    try {
      const refreshedDevice = await discoverDevice(activeConnection);

      if (refreshGeneration !== connectionGeneration.current) {
        return;
      }

      setDevice(refreshedDevice);
      setLastUpdatedAt(new Date());
      setMonitoringError("");
    } catch (error) {
      if (refreshGeneration === connectionGeneration.current) {
        setMonitoringError(error.message);
      }
    } finally {
      if (refreshGeneration === connectionGeneration.current) {
        refreshInFlight.current = false;
        setIsRefreshing(false);
      }
    }
  }, [activeConnection]);

  useEffect(() => {
    if (!activeConnection || !isMonitoring) {
      return undefined;
    }

    let cancelled = false;
    let timerId;

    function scheduleRefresh() {
      timerId = window.setTimeout(async () => {
        await refreshDevice();

        if (!cancelled) {
          scheduleRefresh();
        }
      }, isAlignmentMode ? ALIGNMENT_INTERVAL_MS : MONITOR_INTERVAL_MS);
    }

    scheduleRefresh();

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [activeConnection, isAlignmentMode, isMonitoring, refreshDevice]);

  const currentState = API_STATES[apiState];

  async function handleConnect(connection) {
    setIsLoading(true);
    setErrorMessage("");
    setDevice(null);
    setActiveConnection(null);

    try {
      const discoveredDevice = await discoverDevice(connection);
      connectionGeneration.current += 1;
      setDevice(discoveredDevice);
      setActiveConnection(connection);
      setLastUpdatedAt(new Date());
      setMonitoringError("");
      setIsMonitoring(true);
      setIsAlignmentMode(false);
      setActiveTab("routeros");
      return true;
    } catch (error) {
      setErrorMessage(error.message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  function handleDisconnect() {
    connectionGeneration.current += 1;
    setDevice(null);
    setActiveConnection(null);
    setIsMonitoring(false);
    setIsRefreshing(false);
    setLastUpdatedAt(null);
    setMonitoringError("");
    setIsAlignmentMode(false);
    setActiveTab("routeros");
    refreshInFlight.current = false;
  }

  function handleToggleMonitoring() {
    setIsMonitoring((current) => {
      if (current) {
        setIsAlignmentMode(false);
      }

      return !current;
    });
  }

  function handleToggleAlignment() {
    setIsAlignmentMode((current) => {
      const nextValue = !current;

      if (nextValue) {
        setIsMonitoring(true);
      }

      return nextValue;
    });
  }

  function handleConfigurationApplyStart() {
    connectionGeneration.current += 1;
    refreshInFlight.current = false;
    setIsMonitoring(false);
    setIsRefreshing(false);
    setIsAlignmentMode(false);
    setMonitoringError("");
  }

  function handleTabChange(tabId) {
    setActiveTab(tabId);

    if (tabId !== "routeros") {
      setIsAlignmentMode(false);
    }
  }

  async function handleConfigurationApplied(result) {
    const nextConnection = {
      ...activeConnection,
      host: result.reconnect_ip,
    };

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const refreshedDevice = await discoverDevice(nextConnection);
        connectionGeneration.current += 1;
        setDevice(refreshedDevice);
        setActiveConnection(nextConnection);
        setLastUpdatedAt(new Date());
        setMonitoringError("");
        setIsMonitoring(true);
        return true;
      } catch (error) {
        if (attempt < 3) {
          await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        }
      }
    }

    setMonitoringError(
      `A configuração foi aplicada, mas o ORION ainda não conseguiu acessar ${result.reconnect_ip}. ` +
        "Conecte-se novamente nesse IP ou use o IP anterior, que foi preservado.",
    );
    return false;
  }

  return (
    <main className="page">
      <header className="app-header">
        <section className="hero">
          <div className="brand-mark" aria-hidden="true">
            O
          </div>

          <div>
            <p className="eyebrow">MikroTik Field Assistant</p>
            <h1>ORION</h1>
            <p className="tagline">Configure. Monitore. Valide.</p>
          </div>
        </section>

        <div className={currentState.className} role="status">
          <span className="status-dot" aria-hidden="true" />
          {currentState.label}
        </div>
      </header>

      <section className="workspace">
        {!device && (
          <ConnectionForm isLoading={isLoading} onConnect={handleConnect} />
        )}

        {errorMessage && (
          <div className="error-message" role="alert">
            <strong>Conexão não concluída</strong>
            <span>{errorMessage}</span>
          </div>
        )}

        {device && (
          <nav className="workspace-tabs" aria-label="Áreas do equipamento" role="tablist">
            {WORKSPACE_TABS.map((tab) => (
              <button
                aria-controls={`panel-${tab.id}`}
                aria-selected={activeTab === tab.id}
                className={activeTab === tab.id ? "workspace-tab workspace-tab--active" : "workspace-tab"}
                id={`tab-${tab.id}`}
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}

        {device && (
          <section
            aria-labelledby="tab-routeros"
            className="tab-panel"
            hidden={activeTab !== "routeros"}
            id="panel-routeros"
            role="tabpanel"
          >
            <DeviceSummary
              device={device}
              isMonitoring={isMonitoring}
              isRefreshing={isRefreshing}
              lastUpdatedAt={lastUpdatedAt}
              monitoringError={monitoringError}
              onDisconnect={handleDisconnect}
              onRefresh={refreshDevice}
              onToggleMonitoring={handleToggleMonitoring}
            />
          </section>
        )}

        {device && activeConnection && (
          <section
            aria-labelledby="tab-configuration"
            className="tab-panel"
            hidden={activeTab !== "configuration"}
            id="panel-configuration"
            role="tabpanel"
          >
            <LinkConfiguration
              connection={activeConnection}
              device={device}
              onApplyStart={handleConfigurationApplyStart}
              onApplied={handleConfigurationApplied}
            />
          </section>
        )}

        {device && activeConnection && (
          <section
            aria-labelledby="tab-tests"
            className="tab-panel"
            hidden={activeTab !== "tests"}
            id="panel-tests"
            role="tabpanel"
          >
            <AlignmentMonitor
              isAlignmentMode={isAlignmentMode}
              isMonitoring={isMonitoring}
              lastUpdatedAt={lastUpdatedAt}
              onToggleAlignment={handleToggleAlignment}
              peers={device.wifi_peers}
              registrationTableAvailable={device.registration_table_available}
            />
            <ConnectivityValidation connection={activeConnection} />
            <PingTest connection={activeConnection} />
          </section>
        )}
      </section>
    </main>
  );
}

export default App;
