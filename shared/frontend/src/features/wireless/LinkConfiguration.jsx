import { useMemo, useRef, useState } from "react";

import {
  applyLinkConfiguration,
  previewLinkConfiguration,
} from "../../services/api.js";
import CurrentConfiguration from "../../components/CurrentConfiguration.jsx";
import AccessPointSelector from "./AccessPointSelector.jsx";
import fieldProfiles from "./field-profiles.json";
import { verifyRadio } from "./verification.js";
import { managementNetworksDiffer } from "./managementNetwork.js";
import Icon from "../../components/Icon.jsx";

function nextManagementAddress(value) {
  const match = value?.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d|[12]\d|3[0-2])$/);
  if (!match) return value;

  const octets = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  if (octets.some((octet) => octet > 255) || prefix >= 31) return "";
  const address = octets.reduce((result, octet) => ((result << 8) | octet) >>> 0, 0);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const broadcast = ((address & mask) | (~mask >>> 0)) >>> 0;
  const candidate = address + 1 < broadcast ? address + 1 : address - 1;
  const parts = [24, 16, 8, 0].map((shift) => (candidate >>> shift) & 255);
  return `${parts.join(".")}/${prefix}`;
}

function initialConfiguration(device, fieldSession, wifiInterface) {
  const wifi = device.wifi_interfaces.find((item) => item.name === wifiInterface) || device.wifi_interfaces.find((item) => !item.disabled) || device.wifi_interfaces[0];
  const wifiPort = device.bridge_ports.find(
    (port) => port.interface === wifi?.name && !port.disabled,
  );
  const bridgedEthernetInterfaces = device.bridge_ports.filter(
    (port) => port.bridge === wifiPort?.bridge
      && device.ethernet_interfaces.some((item) => item.name === port.interface && !item.disabled)
      && !port.disabled,
  ).map((port) => port.interface);
  const fallbackEthernet = device.ethernet_interfaces.find((item) => !item.disabled)
    || device.ethernet_interfaces[0];
  const addresses = device.ip_addresses.filter((address) => !address.disabled && !address.invalid);
  const managementAddress = addresses.find((address) => address.interface === wifiPort?.bridge)
    || addresses.find((address) => address.interface === wifi?.name)
    || addresses[0];
  const existingStationAddress = managementAddress?.address;
  const usedAddresses = [fieldSession?.ap_management_ip, ...Object.values(fieldSession?.station_addresses || {})]
    .filter(Boolean).map((address) => address.split("/")[0]);
  const defaultRoute = device.default_routes.find((route) => !route.disabled);
  const frequency = /^\d{4}$/.test(wifi?.frequency || "") ? Number(wifi.frequency) : "";

  const detectedRole = wifi?.mode?.startsWith("station") ? "station" : "ap";

  return {
    role: fieldSession?.next_role === "complete" ? detectedRole : fieldSession?.next_role || detectedRole,
    link_scenario: fieldSession?.link_scenario || (wifi?.mode === "ap-bridge" ? "multipoint" : "pair"),
    device_kind: device.radio_device ? "radio" : "generic",
    manage_topology: Boolean(device.radio_device),
    identity: device.identity,
    wifi_interface: wifi?.name || "wifi1",
    bridge_interfaces: bridgedEthernetInterfaces.length > 0
      ? bridgedEthernetInterfaces
      : device.radio_device && fallbackEthernet
        ? [fallbackEthernet.name]
        : [],
    ssid: fieldSession?.ssid || wifi?.ssid || "ORION-Link",
    passphrase: fieldSession?.passphrase || "",
    country: "",
    ap_lock_action: fieldSession?.next_role === "station" && fieldSession.ap_bssid && device.wifi_stack === "wireless" ? "lock" : "preserve",
    ap_bssid: fieldSession?.next_role === "station" && device.wifi_stack === "wireless" ? fieldSession.ap_bssid || "" : "",
    frequency_mhz: fieldSession?.frequency_mhz || frequency,
    channel_width: fieldSession?.channel_width || (wifi?.channel_width === "20/40mhz"
      ? "20/40mhz"
      : wifi?.channel_width === "20mhz" ? "20mhz" : ""),
    management_ip: fieldSession?.next_role === "station"
      ? existingStationAddress && !usedAddresses.includes(existingStationAddress.split("/")[0])
        ? existingStationAddress : fieldSession.station_management_ip || ""
      : managementAddress?.address || (device.radio_device ? "" : "192.168.88.2/24"),
    gateway: defaultRoute?.gateway || "",
    bridge_name: wifiPort?.bridge || device.bridges[0]?.name || fieldSession?.bridge_name || "bridge-field",
  };
}

function LinkConfiguration({
  connection,
  device,
  fieldSession,
  onApplied,
  onApplyStart,
  onApplyEnd,
  onFieldSessionChange,
  onFinishFieldSession,
  onPrepareNextDevice,
  guided = false,
}) {
  const isRadioDevice = Boolean(device.radio_device);
  const [step, setStep] = useState(1);
  const [startSessionOnReview, setStartSessionOnReview] = useState(false);
  const previewRequest = useRef(null);
  const defaults = useMemo(
    () => initialConfiguration(device, fieldSession),
    [device, fieldSession],
  );
  const [form, setForm] = useState(defaults);
  const [selectedProfile, setSelectedProfile] = useState(fieldSession?.profile_id || "");
  const [preview, setPreview] = useState(null);
  const [confirmation, setConfirmation] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [verification, setVerification] = useState(null);
  const verificationRequest = useRef(null);
  const currentWifiMac = device.wifi_interfaces.find((item) => item.name === form.wifi_interface)?.mac_address;
  const expectedAP = fieldSession?.ap_bssid;
  const associatedPeer = device.wifi_peers?.find((item) => item.interface === form.wifi_interface);
  const alreadyConfigured = fieldSession?.next_role === "station" && device.wifi_interfaces.some((wifi) => {
    const mac = wifi.mac_address?.toUpperCase();
    return mac && [fieldSession.ap_bssid, ...(fieldSession.stations || [])].some((value) => value?.toUpperCase() === mac);
  });

  function updateField(event) {
    const { checked, name, type, value } = event.target;
    if (name === "role" || name === "wifi_interface") setStartSessionOnReview(false);
    setForm((current) => ({
      ...current,
      ...(name === "wifi_interface" ? initialConfiguration(device, fieldSession, value) : {}),
      ...(name === "wifi_interface" ? { link_scenario: current.link_scenario, ...(current.link_scenario === "existing" ? { role: "station" } : {}) } : {}),
      [name]: type === "checkbox" ? checked : value,
      ...(name === "ap_lock_action" && value !== "lock" ? { ap_bssid: "" } : {}),
      ...(name === "role" ? { ap_lock_action: "preserve", ap_bssid: "" } : {}),
    }));
    setPreview(null); previewRequest.current = null;
    setResult(null);
    setConfirmation("");
  }

  function chooseScenario(value) {
    if (fieldSession || isApplying || isPreviewing || isScanning) return;
    setStartSessionOnReview(false);
    setForm((current) => ({ ...current, link_scenario: value,
      ...(value === "existing" ? { role: "station", ap_lock_action: "preserve", ap_bssid: "" } : {}),
    }));
    setPreview(null); setResult(null); setConfirmation(""); setErrorMessage("");
  }

  function toggleBridgeInterface(event) {
    const { checked, value } = event.target;
    setForm((current) => ({
      ...current,
      bridge_interfaces: checked
        ? [...current.bridge_interfaces, value]
        : current.bridge_interfaces.filter((item) => item !== value),
    }));
    setPreview(null);
    setResult(null);
    setConfirmation("");
  }

  function adjustFrequency(delta) {
    const selected = device.wifi_interfaces.find((item) => item.name === form.wifi_interface);
    const fallback = selected?.band?.startsWith("2ghz") ? 2412 : selected?.band?.startsWith("6ghz") ? 5955 : 5180;
    setForm((current) => ({
      ...current,
      frequency_mhz: current.frequency_mhz === "" ? fallback : Math.min(7100, Math.max(2000, Number(current.frequency_mhz) + delta)),
    }));
    setPreview(null);
    setResult(null);
    setConfirmation("");
  }

  function applyProfile(profile) {
    if (isApplying || isPreviewing || isScanning) return;
    setSelectedProfile(profile.id);
    setForm((current) => ({
      ...current,
      bridge_name: profile.bridge_name,
      channel_width: profile.channel_width,
      ssid: profile.ap_ssid,
    }));
    setPreview(null);
    setResult(null);
    setConfirmation("");
    setErrorMessage("");
  }

  function startPairConfiguration() {
    if (isApplying || isPreviewing || isScanning) return;
    if (form.passphrase.length < 8) {
      setErrorMessage("Defina uma senha WPA2 com pelo menos oito caracteres antes de iniciar o par.");
      return;
    }

    const session = {
      link_scenario: form.link_scenario,
      stations: [],
      profile_id: selectedProfile || "custom",
      ssid: form.ssid,
      passphrase: form.passphrase,
      frequency_mhz: form.frequency_mhz === "" ? null : Number(form.frequency_mhz),
      channel_width: form.channel_width,
      bridge_name: form.bridge_name,
      station_management_ip: nextManagementAddress(form.management_ip),
      completed_roles: [],
      next_role: "ap",
    };
    onFieldSessionChange(session);
    setForm((current) => ({ ...current, role: "ap", ap_lock_action: "preserve", ap_bssid: "" }));
    setPreview(null); setResult(null); setConfirmation("");
    setErrorMessage("");
    return true;
  }

  function clearPairConfiguration() {
    if (isApplying || isPreviewing || isScanning) return;
    onFieldSessionChange(null);
    setStartSessionOnReview(false);
    setPreview(null); previewRequest.current = null;
    verificationRequest.current = null;
    setResult(null); setVerification(null); setConfirmation(""); setErrorMessage("");
    setForm(initialConfiguration(device, null, form.wifi_interface));
    if (guided) setStep(1);
  }

  function payload() {
    return {
      ...form,
      device_kind: isRadioDevice ? "radio" : "generic",
      manage_topology: isRadioDevice || form.manage_topology,
      frequency_mhz: form.frequency_mhz === "" ? null : Number(form.frequency_mhz),
      channel_width: form.channel_width || null,
      passphrase: form.passphrase || null,
      country: form.country || null,
      ap_bssid: form.ap_lock_action === "lock" ? form.ap_bssid : null,
      gateway: form.gateway.trim() || null,
    };
  }

  function selectAccessPoint(point, lock) {
    setForm((current) => ({ ...current, ssid: point.ssid, frequency_mhz: point.frequency_mhz || "", ap_lock_action: lock ? "lock" : "preserve", ap_bssid: lock ? point.bssid : "" }));
    setPreview(null); setResult(null); setConfirmation(""); setErrorMessage("");
  }

  async function handlePreview(event) {
    event.preventDefault();
    if (guided && step !== 2) return;
    if (fieldSession && fieldSession.next_role !== form.role) {
      setErrorMessage(fieldSession.next_role === "complete"
        ? "A configuração da sessão foi conferida. Abra os testes ou encerre a sessão antes de fazer novos ajustes."
        : "Esta etapa já foi conferida. Conecte o próximo equipamento da sessão para continuar.");
      return;
    }
    if (startSessionOnReview && !fieldSession && !startPairConfiguration()) return;
    if (fieldSession && form.role === "ap" && !form.passphrase) {
      setErrorMessage("Informe a senha do enlace para que ela possa ser usada nas Stations desta sessão.");
      return;
    }
    if (fieldSession && form.role === "station") {
      if ((fieldSession.stations || []).some((mac) => mac.toUpperCase() === (currentWifiMac || connection.host).toUpperCase())) {
        setErrorMessage("Esta Station já foi conferida na sessão. Conecte outra Station ou encerre a sessão para ajustar este equipamento.");
        return;
      }
      if (fieldSession.passphrase && (form.passphrase !== fieldSession.passphrase || form.ssid !== fieldSession.ssid)) {
        setErrorMessage("Use o SSID e a senha do AP desta sessão. Para configurar outro enlace, encerre a sessão atual.");
        return;
      }
      if (fieldSession.ap_wifi_stack && (fieldSession.ap_wifi_stack === "wireless") !== (device.wifi_stack === "wireless")) {
        setErrorMessage("Este assistente usa Station-bridge: AP e Station precisam da mesma família de driver (WiFi com WiFi ou Wireless com Wireless).");
        return;
      }
      if (expectedAP && device.wifi_interfaces.some((wifi) => wifi.mac_address?.toUpperCase() === expectedAP.toUpperCase())) {
        setErrorMessage("Este é o AP da sessão. Conecte o outro rádio para configurar a Station.");
        return;
      }
      const address = form.management_ip.split("/")[0].trim();
      const reused = fieldSession.ap_management_ip?.split("/")[0] === address
        || Object.entries(fieldSession.station_addresses || {}).some(([mac, value]) => mac !== (currentWifiMac || connection.host) && value.split("/")[0] === address);
      if (reused) {
        setErrorMessage("Este IP já foi usado por outro rádio nesta sessão. Escolha um IP de gerenciamento exclusivo.");
        return;
      }
    }
    setIsPreviewing(true);
    setErrorMessage("");
    setResult(null);

    try {
      const requested = payload();
      previewRequest.current = null;
      setPreview(null);
      setConfirmation("");
      const response = await previewLinkConfiguration(connection, requested);
      previewRequest.current = requested;
      setPreview(response);
      if (guided) setStep(3);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsPreviewing(false);
    }
  }

  async function verifyApplied(applyResult, requested) {
    const reconnected = await onApplied(applyResult);
    const differences = reconnected ? verifyRadio(requested, reconnected.device) : [];
    const confirmed = Boolean(reconnected) && differences.length === 0;
    if (fieldSession && confirmed) {
      const completedRoles = Array.from(new Set([
        ...fieldSession.completed_roles,
        requested.role,
      ]));
      onFieldSessionChange({
        ...fieldSession,
        ...(requested.role === "ap" ? {
          ssid: requested.ssid, passphrase: requested.passphrase || fieldSession.passphrase,
          frequency_mhz: requested.frequency_mhz == null || requested.frequency_mhz === "" ? null : Number(requested.frequency_mhz),
          channel_width: requested.channel_width, bridge_name: requested.bridge_name,
          station_management_ip: nextManagementAddress(requested.management_ip),
          ap_management_ip: requested.management_ip,
          ap_wifi_stack: device.wifi_stack,
          ap_identity: requested.identity,
        } : {
          stations: Array.from(new Set([...(fieldSession.stations || []), device.wifi_interfaces.find((item) => item.name === requested.wifi_interface)?.mac_address || connection.host])),
          station_management_ip: "",
          station_addresses: { ...fieldSession.station_addresses, [currentWifiMac || connection.host]: requested.management_ip },
          station_details: { ...fieldSession.station_details, [currentWifiMac || connection.host]: {
            identity: requested.identity, address: requested.management_ip, wifi_interface: requested.wifi_interface,
          } },
        }),
        ...(requested.role === "ap" ? { ap_bssid: device.wifi_interfaces.find((item) => item.name === requested.wifi_interface)?.mac_address || null } : {}),
        completed_roles: completedRoles,
        next_role: requested.role === "ap" || fieldSession.link_scenario === "multipoint" ? "station" : "complete",
      });
    }
    setVerification({ confirmed, message: !reconnected
      ? "Acesso ainda não confirmado. Confira o IP e o backup antes de repetir a aplicação."
      : differences.length ? `Acesso confirmado; confira estes campos: ${differences.join(", ")}.`
      : "Campos de identidade, Wi-Fi e topologia conferidos. Associação e tráfego ainda precisam ser testados." });
    if (confirmed) verificationRequest.current = null;
  }

  async function retryVerification() {
    if (!result || !verificationRequest.current || isApplying) return;
    setIsApplying(true);
    setErrorMessage("");
    onApplyStart();
    try {
      await verifyApplied(result, verificationRequest.current);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsApplying(false);
      onApplyEnd?.();
    }
  }

  async function handleApply() {
    const requested = previewRequest.current;
    if (isApplying || confirmation !== "APLICAR" || !requested || JSON.stringify(requested) !== JSON.stringify(payload())) return;
    previewRequest.current = null;
    verificationRequest.current = requested;
    setIsApplying(true);
    setErrorMessage("");
    onApplyStart();
    setVerification({ message: "Confirmando o acesso e relendo a configuração…" });

    try {
      const applyResult = await applyLinkConfiguration(connection, requested);
      setResult(applyResult);
      setPreview(null);
      setConfirmation("");
      setForm((current) => ({ ...current, passphrase: "" }));
      await verifyApplied(applyResult, requested);
    } catch (error) {
      setErrorMessage(
        `${error.message} Se a conexão caiu durante a aplicação, tente acessar o novo IP antes de repetir.`,
      );
      setVerification({ confirmed: false, message: "Não foi possível concluir a conferência. Reconecte e leia o equipamento antes de repetir a aplicação." });
    } finally {
      setPreview(null); previewRequest.current = null; setConfirmation("");
      setIsApplying(false);
      onApplyEnd?.();
    }
  }

  return (
    <section className="configuration-card" aria-labelledby="configuration-title">
      <div className="section-heading">
        <div>
          <p className="card-kicker">Configuração assistida</p>
          <h2 id="configuration-title">
            {isRadioDevice ? "Configurar enlace" : "Configurar Wi-Fi"}
          </h2>
        </div>
        <span className="write-badge">{device.demo_mode ? "Simulação" : "Altera o equipamento"}</span>
      </div>

      {isRadioDevice && (!guided || step === 1) && (
        <fieldset className="link-scenario-selector" disabled={Boolean(fieldSession) || isApplying || isPreviewing || isScanning}>
          <legend>O que você quer configurar?</legend>
          <div className="field-profile-grid">
            {[
              ["pair", "Par de rádios", "Principal · um AP + uma Station"],
              ["multipoint", "AP com várias Stations", "Reaproveite os dados para cada Station"],
              ["existing", "Conectar a AP existente", "Configure somente esta Station"],
            ].map(([value, title, description]) => <label key={value} className={`field-profile ${form.link_scenario === value ? "field-profile--selected" : ""}`}>
              <input type="radio" name="link-scenario" value={value} checked={form.link_scenario === value} onChange={() => chooseScenario(value)} />
              <Icon name={value === "pair" ? "link" : value === "multipoint" ? "network" : "radio"} />
              <strong>{title}</strong><span>{description}</span>
            </label>)}
          </div>
        </fieldset>
      )}
      {!guided && isRadioDevice && form.link_scenario !== "existing" && !fieldSession && (
        <section className="field-profiles" aria-labelledby="field-profiles-title">
          <header>
            <div>
              <span>Cenário do enlace</span>
              <strong id="field-profiles-title">Escolha o ponto de partida</strong>
            </div>
          </header>
          <div className="field-profile-grid">
            {fieldProfiles
              .filter((profile) => profile.id !== "local-wifi")
              .map((profile) => (
              <button
                className={selectedProfile === profile.id ? "field-profile field-profile--selected" : "field-profile"}
                disabled={isApplying || isPreviewing || isScanning}
                key={profile.id}
                onClick={() => applyProfile(profile)}
                type="button"
              >
                <strong>{profile.name}</strong>
                <span>{profile.description}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {isRadioDevice && fieldSession && (
        <section className={fieldSession ? "pair-session pair-session--active" : "pair-session"}>
          <div>
            <span>{fieldSession.link_scenario === "multipoint" ? `AP + várias Stations · ${fieldSession.stations?.length || 0} configurada(s)` : "AP + Station"}</span>
            <strong>
              {fieldSession
                ? `Etapa atual: ${fieldSession.next_role === "station" ? "Station" : fieldSession.next_role === "complete" ? "validação" : "AP"}`
                : "Configure os dois lados sem redigitar os parâmetros"}
            </strong>
            <small>
              {fieldSession
                ? `${fieldSession.ssid} · sessão mantida somente enquanto o ORION estiver aberto`
                : "Configure o AP primeiro; ao conectar a Station, o ORION reaproveitará os mesmos dados do enlace."}
            </small>
          </div>
          {fieldSession ? (
            <div>
              {fieldSession.next_role === "complete" && !result && <button disabled={isApplying || isPreviewing || isScanning} onClick={onFinishFieldSession} type="button">Abrir conferência do enlace</button>}
              {alreadyConfigured && !result && <button disabled={isApplying || isPreviewing || isScanning} onClick={onPrepareNextDevice} type="button">Este rádio já foi conferido. Conectar a próxima Station</button>}
              <button disabled={isApplying || isPreviewing || isScanning} onClick={clearPairConfiguration} type="button">Encerrar sessão</button>
            </div>
          ) : (
            <button onClick={startPairConfiguration} type="button">Iniciar configuração do par</button>
          )}
        </section>
      )}

      <div className="network-proposal-banner network-proposal-banner--loaded configuration-current-banner">
        <div>
          <span>{fieldSession ? "Dados do enlace da sessão" : "Configuração atual carregada"}</span>
          <strong>{fieldSession ? "SSID e segurança do AP; confira o nome e o IP deste equipamento" : "Função, SSID, frequência, interfaces e endereçamento"}</strong>
        </div>
        <b>Editável</b>
      </div>
      {isRadioDevice && form.role === "station" && expectedAP && <p className="configuration-note" role="status">
        AP esperado: {expectedAP}. {associatedPeer?.mac_address
          ? `MAC na última leitura: ${associatedPeer.mac_address} — ${associatedPeer.mac_address.toUpperCase() === expectedAP.toUpperCase() ? "corresponde ao AP esperado" : "diferente do esperado; confira a associação"}.`
          : "Associação ainda não confirmada na leitura do equipamento."}
        {device.wifi_stack !== "wireless" && " Conferência de associação, não lock por MAC."}
      </p>}

      {guided && <nav className="radio-steps" aria-label="Etapas da configuração">
        {["Função do rádio", "Dados do enlace", "Revisão"].map((label, index) => <button key={label} type="button"
          aria-current={step === index + 1 ? "step" : undefined} disabled={isApplying || isPreviewing || isScanning || (index === 2 && !preview)}
          onClick={() => { setStep(index + 1); if (index < 2) { setPreview(null); previewRequest.current = null; setConfirmation(""); } }}>
          <Icon name={["radio", "settings", "shield"][index]} />{index + 1}. {label}
        </button>)}
      </nav>}
      <form className="configuration-form" onSubmit={handlePreview} hidden={guided && step === 3}
        onInvalidCapture={(event) => { if (guided && event.target.closest("[data-radio-step='1']")) setStep(1); }}>
        <fieldset className="form-scope" disabled={isPreviewing || isApplying || isScanning}>
        <legend className="sr-only">Configuração Wi-Fi</legend>
        <div data-radio-step="1" hidden={guided && step !== 1}>
        <fieldset disabled={isPreviewing || isApplying}>
          <legend>{isRadioDevice ? "Função do rádio" : "Modo de operação"}</legend>
          <div className="role-selector">
            <label className={form.role === "ap" ? "role-option role-option--selected" : "role-option"}>
              <input
                checked={form.role === "ap"}
                name="role"
                disabled={form.link_scenario === "existing" || Boolean(fieldSession)}
                onChange={updateField}
                type="radio"
                value="ap"
              />
              <span className="role-option__mark" aria-hidden="true"><Icon name="radio" /></span>
              <span className="role-option__content">
                <strong>AP</strong>
                <small>
                  {isRadioDevice
                    ? "Cria e transmite a rede do enlace"
                    : "Cria e transmite a rede Wi-Fi"}
                </small>
              </span>
              <span className="role-option__check" aria-hidden="true">✓</span>
            </label>
            <label className={form.role === "station" ? "role-option role-option--selected" : "role-option"}>
              <input
                checked={form.role === "station"}
                name="role"
                disabled={Boolean(fieldSession)}
                onChange={updateField}
                type="radio"
                value="station"
              />
              <span className="role-option__mark" aria-hidden="true"><Icon name="device" /></span>
              <span className="role-option__content">
                <strong>Station</strong>
                <small>
                  {isRadioDevice
                    ? "Conecta-se ao AP do outro lado"
                    : "Conecta-se a uma rede Wi-Fi existente"}
                </small>
              </span>
              <span className="role-option__check" aria-hidden="true">✓</span>
            </label>
          </div>
        </fieldset>

        <label className="field">
          <span>Interface Wi-Fi a configurar</span>
          <select name="wifi_interface" onChange={updateField} value={form.wifi_interface}>
            {device.wifi_interfaces.map((item) => <option key={item.name} value={item.name}>{item.name}{item.band ? ` · ${item.band}` : ""}</option>)}
          </select>
        </label>
        {form.role === "station" && <AccessPointSelector connection={connection} wifiInterface={form.wifi_interface} action={form.ap_lock_action} bssid={form.ap_bssid} busy={isPreviewing || isApplying} onChange={updateField} onSelect={selectAccessPoint} onScanning={(active) => { setIsScanning(active); if (active) onApplyStart(); else onApplyEnd?.(); }} refreshKey={result?.backup_file} />}

        </div>
        <div hidden={guided && step !== 2}>
        {!isRadioDevice && (
          <fieldset className="network-options network-toggle-section" disabled={isPreviewing || isApplying}>
            <legend>Topologia do router</legend>
            <label className="setting-toggle setting-toggle--wide">
              <span>
                <strong>Alterar bridge e IP de gerenciamento</strong>
                <small>Desativado: o ORION muda somente o Wi-Fi e preserva toda a rede atual</small>
              </span>
              <input
                checked={form.manage_topology}
                name="manage_topology"
                onChange={updateField}
                type="checkbox"
              />
              <span aria-hidden="true" className="toggle-control"><i /></span>
            </label>
          </fieldset>
        )}

        <div className="configuration-grid">
          <label className="field">
            <span>Nome do equipamento</span>
            <input name="identity" onChange={updateField} required value={form.identity} />
          </label>
          <label className="field">
            <span>SSID</span>
            <input maxLength="32" name="ssid" onChange={updateField} required value={form.ssid} />
          </label>
          <label className="field">
            <span>{startSessionOnReview && !fieldSession ? "Senha do enlace" : "Nova senha WPA2 (opcional)"}</span>
            <input
              autoComplete="new-password"
              minLength="8"
              maxLength="63"
              required={startSessionOnReview && !fieldSession}
              name="passphrase"
              onChange={updateField}
              placeholder="Vazio mantém a segurança atual"
              type="password"
              value={form.passphrase}
            />
          </label>
          <div className="field">
            <span>Frequência (MHz)</span>
            <div className="number-stepper">
              <button aria-label="Diminuir frequência em 5 MHz" onClick={() => adjustFrequency(-5)} type="button">−</button>
              <input
                aria-label="Frequência em MHz"
                max="7100"
                min="2000"
                name="frequency_mhz"
                onChange={updateField}
                placeholder="Manter frequência atual / automática"
                type="number"
                value={form.frequency_mhz}
              />
              <button aria-label="Aumentar frequência em 5 MHz" onClick={() => adjustFrequency(5)} type="button">+</button>
            </div>
          </div>
          <label className="field">
            <span>Largura do canal</span>
            <select name="channel_width" onChange={updateField} value={form.channel_width}>
              <option value="">Manter largura atual</option>
              <option value="20mhz">20 MHz — mais estável</option>
              <option value="20/40mhz">20/40 MHz — mais capacidade</option>
            </select>
          </label>
          {(isRadioDevice || form.manage_topology) && (
            <>
              <label className="field">
                <span>IP de gerenciamento</span>
                <input
                  name="management_ip"
                  aria-label="IP de gerenciamento"
                  aria-describedby={fieldSession?.next_role === "station" && form.management_ip && form.management_ip === fieldSession.station_management_ip ? "station-ip-suggestion" : undefined}
                  onChange={updateField}
                  placeholder="Ex.: 192.168.88.2/24"
                  required
                  value={form.management_ip}
                />
                {fieldSession?.next_role === "station" && form.management_ip && form.management_ip === fieldSession.station_management_ip && <small id="station-ip-suggestion">IP sugerido para este rádio. Confirme se está livre na rede antes de aplicar.</small>}
              </label>
              <label className="field">
                <span>Gateway (opcional)</span>
                <input name="gateway" onChange={updateField} value={form.gateway} />
              </label>
              <label className="field">
                <span>Bridge</span>
                <input name="bridge_name" onChange={updateField} required value={form.bridge_name} />
              </label>
            </>
          )}
          <label className="field"><span>País regulatório</span><select name="country" onChange={updateField} value={form.country}><option value="">Manter país do MikroTik</option><option value="Brazil">Brasil</option></select></label>
        </div>

        {(isRadioDevice || form.manage_topology) && (
          <fieldset className="network-options" disabled={isPreviewing || isApplying}>
            <legend>{isRadioDevice ? "Portas cabeadas do enlace" : "Interfaces Ethernet na bridge"}</legend>
            <div className="port-selector">
              {device.ethernet_interfaces.filter((item) => !item.disabled).map((item) => (
                <label className="check-field" key={item.name}>
                  <input
                    checked={form.bridge_interfaces.includes(item.name)}
                    onChange={toggleBridgeInterface}
                    type="checkbox"
                    value={item.name}
                  />
                  <span>{item.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {fieldSession?.next_role === "station" && managementNetworksDiffer(fieldSession.ap_management_ip, form.management_ip) && <p className="configuration-note" role="status">
          O AP usa {fieldSession.ap_management_ip}; esta Station usa {form.management_ip}. Os IPs de gerenciamento estão em redes diferentes. Confirme o roteamento com o responsável ou escolha um IP livre na rede do AP.
        </p>}
        <p className="configuration-note">
          {isRadioDevice || form.manage_topology
            ? "O ORION cria backup e preserva IPs, DHCP, NAT e firewall existentes."
            : "Somente identidade e Wi-Fi serão alterados; a rede atual permanecerá intacta."}
        </p>
        <button
          className="primary-button"
          disabled={isPreviewing || isApplying || (isRadioDevice && form.bridge_interfaces.length === 0)}
          type="submit"
        >
          {isPreviewing ? "Analisando…" : "Revisar alterações"}
        </button>
        {!guided && isRadioDevice && !fieldSession && form.link_scenario !== "existing" && <button className="secondary-button" onClick={startPairConfiguration} type="button">{form.link_scenario === "multipoint" ? "Usar estes dados para o AP e suas Stations" : "Usar estes dados para configurar o par AP + Station"}</button>}
        </div>
        {guided && step === 1 && <>
          <button className="primary-button" type="button" onClick={() => {
            if (isRadioDevice && !fieldSession && form.link_scenario !== "existing") {
              setStartSessionOnReview(true);
              setForm((current) => ({ ...current, role: "ap", ap_lock_action: "preserve", ap_bssid: "" }));
            }
            setStep(2);
          }}>{isRadioDevice && !fieldSession && form.link_scenario !== "existing" ? "Configurar o AP primeiro" : "Continuar para os dados do enlace"}</button>
          {isRadioDevice && !fieldSession && form.link_scenario !== "existing" && <button type="button" onClick={() => { setStartSessionOnReview(false); setStep(2); }}>Ajustar somente este rádio</button>}
        </>}
        </fieldset>
      </form>

      {errorMessage && <div className="inline-error" role="alert">{errorMessage}</div>}
      {guided && step === 3 && !preview && !result && !isApplying && <button type="button" onClick={() => setStep(2)}>Voltar aos dados e revisar novamente</button>}
      {result && verification && <div className="network-post-check" role="status">{verification.message}</div>}

      {preview && (
        <section className="configuration-preview" aria-labelledby="preview-title">
          <div>
            <p className="card-kicker">Nenhuma alteração aplicada ainda</p>
            <h3 id="preview-title">Revise antes de confirmar</h3>
          </div>
          <CurrentConfiguration items={preview.existing} />
          <div className="change-list">
            {preview.changes.map((change, index) => (
              <article key={`${change.area}-${change.field}-${index}`}>
                <span>{change.area}</span>
                <strong>{change.field}</strong>
                <div>
                  <small>{change.current_value || "Não configurado"}</small>
                  <b aria-hidden="true">→</b>
                  <small>{change.new_value}</small>
                </div>
              </article>
            ))}
          </div>
          <ul className="configuration-warnings">
            {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
          {device.demo_mode ? (
            <p className="demo-preview-note">Esta é apenas uma prévia. O modo demonstração não grava configurações.</p>
          ) : (
            <>
              <label className="confirmation-field">
                <span>Digite <strong>APLICAR</strong> para confirmar</span>
                <input onChange={(event) => setConfirmation(event.target.value)} value={confirmation} />
              </label>
              <button
                className="danger-button"
                disabled={confirmation !== "APLICAR" || isApplying}
                onClick={handleApply}
                type="button"
              >
                {isApplying ? "Criando backup e aplicando…" : "Criar backup e aplicar"}
              </button>
            </>
          )}
        </section>
      )}

      {result && (
        <div className="configuration-success" role="status">
          <strong>Configuração enviada</strong>
          {verification && !verification.confirmed && <button type="button" disabled={isApplying} onClick={retryVerification}>
            {isApplying ? "Conferindo…" : "Conferir novamente sem reaplicar"}
          </button>}
          <span>{result.summary}</span>
          <small>
            Backup: {result.backup_file} · {isRadioDevice || form.manage_topology ? "IP de acesso" : "rede preservada"}: {result.reconnect_ip}
          </small>
          {fieldSession && verification?.confirmed && form.role === "ap" && (
            <button onClick={onPrepareNextDevice} type="button">
              Desconectar AP e configurar Station
            </button>
          )}
          {fieldSession && verification?.confirmed && form.role === "station" && (
            <>
            {fieldSession.link_scenario === "multipoint" && <button onClick={onPrepareNextDevice} type="button">Desconectar e configurar outra Station</button>}
            <button onClick={onFinishFieldSession} type="button">
              Concluir sessão e abrir os testes
            </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default LinkConfiguration;
