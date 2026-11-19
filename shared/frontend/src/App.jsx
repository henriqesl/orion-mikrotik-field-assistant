import { useCallback, useEffect, useRef, useState } from "react";

import DefaultConnectionForm from "./components/ConnectionForm.jsx";
import DeviceSummary from "./components/DeviceSummary.jsx";
import PingTest from "./components/PingTest.jsx";
import UpdateNotice from "./components/UpdateNotice.jsx";
import { discoverDevice } from "./services/api.js";
import { apiUrl, isDesktopRuntime } from "./services/runtime.js";
import orionMark from "./assets/orion-mark.svg";
import { sameDevice } from "./services/deviceIdentity.js";
import { sessionSummary } from "./features/wireless/sessionSummary.js";
import Icon from "./components/Icon.jsx";

const API_STATES = {
  checking: {
    label: "Iniciando ORION",
    className: "status status--checking",
  },
  online: {
    label: "Sistema pronto",
    className: "status status--online",
  },
  offline: {
    label: "Serviço indisponível",
    className: "status status--offline",
  },
};

const MONITOR_INTERVAL_MS = 15_000;
const ALIGNMENT_INTERVAL_MS = 3_000;

function resetWorkspaceScroll() {
  return window.requestAnimationFrame(() => {
    document.querySelector(".app-viewport")?.scrollTo({ top: 0, left: 0 });
    window.scrollTo({ top: 0, left: 0 });
  });
}

function App({ workspace }) {
  const { AlignmentMonitor, LinkConfiguration, BasicNetworkConfiguration, LoraProtection } = workspace.components;
  const ConnectionForm = workspace.components.ConnectionForm || DefaultConnectionForm;
  const { Overview, ConnectionHelp, LinkValidation } = workspace.components;
  const hasPanel = (id) => workspace.tabs.some((tab) => tab.id === id);
  const [apiState, setApiState] = useState("checking");
  const [device, setDevice] = useState(null);
  const [activeConnection, setActiveConnection] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [connectionFailure, setConnectionFailure] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOperating, setIsOperating] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [monitoringError, setMonitoringError] = useState("");
  const [identityUncertain, setIdentityUncertain] = useState(false);
  const [isAlignmentMode, setIsAlignmentMode] = useState(false);
  const [activeTab, setActiveTab] = useState("routeros");
  const [linkSession, setLinkSession] = useState(null);
  const [linkValidation, setLinkValidation] = useState(null);
  const [testTarget, setTestTarget] = useState(null);
  const refreshInFlight = useRef(false);
  const connectionGeneration = useRef(0);
  const connectedDevice = useRef(null);

  useEffect(() => {
    const controller = new AbortController();

    async function checkApi() {
      const attempts = isDesktopRuntime() ? 12 : 1;

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          const response = await fetch(apiUrl("/api/health"), {
            signal: controller.signal,
          });
          const data = await response.json();

          if (
            response.ok &&
            data.status === "ok" &&
            data.service === "orion-field-api"
          ) {
            setApiState("online");
            return;
          }
        } catch (error) {
          if (error.name === "AbortError") return;
        }

        if (attempt < attempts) {
          await new Promise((resolve) => window.setTimeout(resolve, 500));
        }
      }

      setApiState("offline");
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

      if (!sameDevice(connectedDevice.current, refreshedDevice)) {
        setIdentityUncertain(true);
        setActiveTab("routeros");
        setMonitoringError("O IP respondeu, mas a identidade física do MikroTik não foi confirmada. Reconecte e confira o equipamento antes de alterar configurações.");
        setIsMonitoring(false);
        setIsAlignmentMode(false);
        return;
      }

      setDevice(refreshedDevice);
      setIdentityUncertain(false);
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

  const currentState = device?.demo_mode
    ? { label: "Demonstração local", className: "status status--demo" }
    : API_STATES[apiState];
  const wifiAvailable = Boolean(device?.wifi_interfaces?.length);
  const radioDevice = Boolean(device?.radio_device);
  const loraAvailable = Boolean(device?.lora_available);

  useEffect(() => {
    const activeCapabilityUnavailable =
      (activeTab === "configuration" && !wifiAvailable) ||
      (activeTab === "lora" && !loraAvailable) ||
      (activeTab === "network" && radioDevice);

    if (device && activeCapabilityUnavailable) {
      setActiveTab("routeros");
    }
  }, [activeTab, device, loraAvailable, radioDevice, wifiAvailable]);

  useEffect(() => {
    const frame = resetWorkspaceScroll();
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, device?.identity]);

  async function handleConnect(connection) {
    setConnectionFailure(null);
    setIsLoading(true);
    setErrorMessage("");
    setDevice(null);
    setActiveConnection(null);

    try {
      const discoveredDevice = await discoverDevice(connection);
      connectedDevice.current = discoveredDevice;
      setIdentityUncertain(false);
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
      setConnectionFailure({ status: error.status, code: error.code });
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  function handleDisconnect() {
    if (isOperating) return;
    connectionGeneration.current += 1;
    connectedDevice.current = null;
    setIdentityUncertain(false);
    setDevice(null);
    setActiveConnection(null);
    setIsMonitoring(false);
    setIsRefreshing(false);
    setLastUpdatedAt(null);
    setMonitoringError("");
    setIsAlignmentMode(false);
    setActiveTab("routeros");
    setTestTarget(null);
    refreshInFlight.current = false;
  }

  function handlePrepareNextLinkDevice() {
    handleDisconnect();
  }

  function handleClearLinkSession() {
    setLinkSession(null);
    setLinkValidation(null);
  }

  function handleFinishLinkSession() {
    setLinkValidation(sessionSummary(linkSession));
    setLinkSession(null);
    setActiveTab("tests");
  }

  function handleLinkSessionChange(session) {
    setLinkSession(session);
    setLinkValidation(null);
    setTestTarget(null);
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
    setIsOperating(true);
    connectionGeneration.current += 1;
    refreshInFlight.current = false;
    setIsMonitoring(false);
    setIsRefreshing(false);
    setIsAlignmentMode(false);
    setMonitoringError("");
  }

  function handleConfigurationApplyEnd() {
    setIsOperating(false);
  }

  function handleTabChange(tabId) {
    if (isOperating) return;
    if (identityUncertain && !["routeros", "tests"].includes(tabId)) return;
    if (
      (tabId === "configuration" && !wifiAvailable) ||
      (tabId === "lora" && !loraAvailable) ||
      (tabId === "network" && radioDevice)
    ) {
      return;
    }

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
        if (!sameDevice(device, refreshedDevice)) {
          setIdentityUncertain(true);
          setActiveTab("routeros");
          setMonitoringError("O IP respondeu, mas não foi possível confirmar que é o mesmo MikroTik. Confira o equipamento e possíveis IPs duplicados antes de continuar.");
          return null;
        }
        connectionGeneration.current += 1;
        setDevice(refreshedDevice);
        connectedDevice.current = refreshedDevice;
        setIdentityUncertain(false);
        setActiveConnection(nextConnection);
        setLastUpdatedAt(new Date());
        setMonitoringError("");
        setIsMonitoring(true);
        return {
          connection: nextConnection,
          device: refreshedDevice,
        };
      } catch (error) {
        if (attempt < 3) {
          await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        }
      }
    }

    setMonitoringError(
      `Os comandos foram enviados, mas o ORION ainda não conseguiu acessar ${result.reconnect_ip}. ` +
        "Conecte-se novamente nesse IP ou use o IP anterior, que foi preservado.",
    );
    return null;
  }

  async function handleInPlaceConfigurationApplied() {
    setIsMonitoring(true);
    await refreshDevice();
  }

  return (
    <main className={`page${workspace.id === "radios" ? " page--radios" : ""}`}>
      <header className="app-header">
        <section className="hero">
          <div className="brand-mark">
            <img alt="" aria-hidden="true" src={orionMark} />
          </div>

          <div>
            <div className="brand-name">
              <h1>ORION</h1>
              <span>{workspace.name}</span>
            </div>
            <p className="tagline">Configuração e diagnóstico MikroTik</p>
          </div>
        </section>

        <div className="app-header-actions">
          <div className={currentState.className} role="status">
            <span className="status-dot" aria-hidden="true" />
            {currentState.label}
          </div>
          {device && (
            <button className="global-disconnect-button" disabled={isOperating} onClick={handleDisconnect} type="button">
              <Icon name="power" />
              Desconectar
            </button>
          )}
        </div>
      </header>

      <section className="workspace">
        {isOperating && <div className="network-post-check network-post-check--running" role="status"><strong>Operação em andamento</strong><span>Aguarde a conclusão antes de desconectar ou iniciar outro ajuste.</span></div>}
        <UpdateNotice />
        {!device && (
          <ConnectionForm
            fieldSession={linkSession}
            isLoading={isLoading}
            onClearFieldSession={handleClearLinkSession}
            onConnect={handleConnect}
          />
        )}

        {errorMessage && (
          <div className="error-message" role="alert">
            <strong>Conexão não concluída</strong>
            <span>{errorMessage}</span>
            {ConnectionHelp && <ConnectionHelp {...connectionFailure} />}
          </div>
        )}

        {device?.demo_mode && (
          <aside className="demo-banner" role="status">
            <strong>Modo demonstração</strong>
            <span>Todos os dados são simulados. Nenhuma configuração será aplicada a um equipamento.</span>
          </aside>
        )}

        {device && (
          <nav className="workspace-tabs" aria-label="Áreas do equipamento" role="tablist">
            {workspace.tabs.map((tab) => {
              const unavailable =
                (tab.capability === "wifi" && !wifiAvailable) ||
                (tab.capability === "lora" && !loraAvailable) ||
                (tab.capability === "router" && radioDevice) ||
                (identityUncertain && !["routeros", "tests"].includes(tab.id));

              return (
                <button
                  aria-controls={`panel-${tab.id}`}
                  aria-selected={activeTab === tab.id}
                  className={[
                    "workspace-tab",
                    activeTab === tab.id ? "workspace-tab--active" : "",
                    unavailable ? "workspace-tab--unavailable" : "",
                  ].filter(Boolean).join(" ")}
                  disabled={unavailable || isOperating}
                  id={`tab-${tab.id}`}
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  role="tab"
                  title={unavailable
                    ? identityUncertain ? "Reconecte para confirmar o equipamento" : tab.id === "network"
                      ? "Rede básica indisponível para equipamentos classificados como rádio"
                      : "Recurso não detectado neste equipamento"
                    : undefined}
                  type="button"
                >
                  <Icon name={tab.icon || ({ routeros: "device", configuration: "radio", tests: "activity", network: "network", lora: "shield" })[tab.id]} />
                  <span>
                    {tab.wifiLabel && !radioDevice
                      ? tab.wifiLabel
                      : tab.label}
                  </span>
                  {unavailable && <small>Indisponível</small>}
                </button>
              );
            })}
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
            {Overview && activeTab === "routeros" && <Overview device={device} monitoringError={monitoringError} disabled={isOperating}
              onConfigure={() => handleTabChange("configuration")} onTests={() => handleTabChange("tests")} />}
            <DeviceSummary
              compact={workspace.id === "radios"}
              connection={activeConnection}
              device={device}
              isActive={activeTab === "routeros"}
              isMonitoring={isMonitoring}
              isRefreshing={isRefreshing}
              lastUpdatedAt={lastUpdatedAt}
              monitoringError={monitoringError}
              onRefresh={refreshDevice}
              onToggleMonitoring={handleToggleMonitoring}
            />
          </section>
        )}

        {hasPanel("lora") && device && activeConnection && loraAvailable && (
          <section aria-labelledby="tab-lora" className="tab-panel" hidden={activeTab !== "lora"} id="panel-lora" role="tabpanel">
            <LoraProtection connection={activeConnection} device={device} onApplyStart={handleConfigurationApplyStart} onApplyEnd={handleConfigurationApplyEnd} onApplied={handleInPlaceConfigurationApplied} />
          </section>
        )}

        {device && activeConnection && wifiAvailable && (
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
              fieldSession={linkSession}
              onFieldSessionChange={handleLinkSessionChange}
              onFinishFieldSession={handleFinishLinkSession}
              onApplyStart={handleConfigurationApplyStart}
              onApplyEnd={handleConfigurationApplyEnd}
              onApplied={handleConfigurationApplied}
              onPrepareNextDevice={handlePrepareNextLinkDevice}
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
            {LinkValidation && <LinkValidation device={device} monitoringError={monitoringError}
              summary={linkValidation || sessionSummary(linkSession)} onSelectTarget={(host) => setTestTarget({ host })}
              disabled={isOperating || isRefreshing} onRefresh={refreshDevice}
              onConfigure={() => handleTabChange("configuration")} />}
            <AlignmentMonitor
              isAlignmentMode={isAlignmentMode}
              isMonitoring={isMonitoring}
              lastUpdatedAt={lastUpdatedAt}
              onToggleAlignment={handleToggleAlignment}
              peers={device.wifi_peers}
              radioAvailable={radioDevice}
              registrationTableAvailable={device.registration_table_available}
              monitoringError={monitoringError}
              disabled={isOperating}
            />
            <PingTest connection={activeConnection} suggestedTarget={testTarget} disabled={isOperating} radioContext={Boolean(LinkValidation)} />
          </section>
        )}

        {hasPanel("network") && device && activeConnection && !radioDevice && (
          <section
            aria-labelledby="tab-network"
            className="tab-panel"
            hidden={activeTab !== "network"}
            id="panel-network"
            role="tabpanel"
          >
            <BasicNetworkConfiguration
              connection={activeConnection}
              device={device}
              onApplyStart={handleConfigurationApplyStart}
              onApplyEnd={handleConfigurationApplyEnd}
              onApplied={handleConfigurationApplied}
            />
          </section>
        )}
      </section>
    </main>
  );
}

export default App;
