import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BasicNetworkConfiguration from "../../../routerboards/frontend/BasicNetworkConfiguration.jsx";
import LinkConfiguration from "../src/features/wireless/LinkConfiguration.jsx";
import RadioLink from "../../../radios/frontend/RadioLink.jsx";
import LoraProtection from "../../../routerboards/frontend/LoraProtection.jsx";
import { demoDevice, demoBasicNetworkCurrent } from "../src/services/demo.js";
import * as api from "../src/services/api.js";

vi.mock("../src/services/api.js", () => ({
  getBasicNetworkCurrent: vi.fn(), previewBasicNetwork: vi.fn(), applyBasicNetwork: vi.fn(), validateConnectivity: vi.fn(),
  previewLinkConfiguration: vi.fn(), applyLinkConfiguration: vi.fn(), getAPLockState: vi.fn(), scanAccessPoints: vi.fn(),
  getLoraProtectionCurrent: vi.fn(), previewLoraProtection: vi.fn(), applyLoraProtection: vi.fn(),
}));

const connection = { host: "192.0.2.10", username: "lab", password: "test-only" };
const preview = { existing: [], changes: [{ area: "Equipamento", field: "Nome", current_value: "MikroTik", new_value: "Campo" }], warnings: [], reconnect_ip: connection.host };
const applied = { status: "applied", backup_file: "test.backup", reconnect_ip: connection.host, summary: "Salvo" };
const callbacks = () => ({ onApplyStart: vi.fn(), onApplyEnd: vi.fn(), onApplied: vi.fn().mockResolvedValue(null), onFieldSessionChange: vi.fn(), onFinishFieldSession: vi.fn(), onPrepareNextDevice: vi.fn() });
const routerDevice = () => ({ ...demoDevice({ host: "demo-router" }), demo_mode: false });

beforeEach(() => {
  api.getBasicNetworkCurrent.mockResolvedValue({ ...demoBasicNetworkCurrent({ host: "demo-router" }), wan_configured: true });
  api.previewBasicNetwork.mockResolvedValue(preview);
  api.applyBasicNetwork.mockResolvedValue(applied);
  api.getAPLockState.mockResolvedValue({ supported: true, managed: false, external_rules: false });
  api.previewLinkConfiguration.mockResolvedValue(preview);
  api.applyLinkConfiguration.mockResolvedValue(applied);
  api.scanAccessPoints.mockResolvedValue({ access_points: [{ bssid: "02:11:22:33:44:55", ssid: "TORRE-CAMPO", frequency_mhz: 5500, signal_dbm: -54 }] });
  api.getLoraProtectionCurrent.mockResolvedValue({ configuration: { enable_lns_watchdog: false, enable_lora_guard: true, enable_device_reboot: false, ping_target: "9.9.9.9", failure_threshold: 4, lora_interval: "10m", connectivity_interval: "5m" }, existing: [] });
  api.previewLoraProtection.mockResolvedValue({ ...preview, lora_interface: "lora1", lora_status: "connected" });
  api.applyLoraProtection.mockResolvedValue(applied);
});
afterEach(cleanup);

function verifiedStation(address) {
  const device = demoDevice({ host: "demo" });
  return { device: { ...device, wifi_interfaces: device.wifi_interfaces.map((wifi) => ({ ...wifi, ssid: "ENLACE" })),
    ip_addresses: [{ address, disabled: false, invalid: false }] } };
}

test("radio scenarios default to a pair and existing AP selects only Station without writing", async () => {
  const user = userEvent.setup();
  render(<LinkConfiguration connection={connection} device={{ ...demoDevice({ host: "demo" }), demo_mode: false }} {...callbacks()} />);
  expect(screen.getByRole("radio", { name: /Par de rádios/ }).checked).toBe(true);
  await user.click(screen.getByRole("radio", { name: /Conectar a AP existente/ }));
  expect(screen.getAllByRole("radio").find((input) => input.name === "role" && input.value === "ap").disabled).toBe(true);
  expect(screen.queryByText("Usar estes dados para configurar o par AP + Station")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Revisar alterações" }));
  await waitFor(() => expect(api.previewLinkConfiguration).toHaveBeenCalledTimes(1));
  expect(api.previewLinkConfiguration.mock.calls[0][1]).toMatchObject({ link_scenario: "existing", role: "station" });
  expect(api.applyLinkConfiguration).not.toHaveBeenCalled();
});

test.each(["pair", "multipoint"])("%s session completes a Station with the correct next step", async (scenario) => {
  const user = userEvent.setup();
  const handlers = callbacks();
  handlers.onApplied.mockResolvedValue(verifiedStation("192.0.2.20/24"));
  const session = { link_scenario: scenario, stations: [], completed_roles: ["ap"], next_role: "station", ssid: "ENLACE", passphrase: "lab-password", station_management_ip: "192.0.2.20/24" };
  render(<LinkConfiguration connection={connection} device={{ ...demoDevice({ host: "demo" }), demo_mode: false, ip_addresses: [] }} fieldSession={session} {...handlers} />);
  await user.click(screen.getByRole("button", { name: "Revisar alterações" }));
  await user.type(await screen.findByLabelText(/Digite APLICAR/), "APLICAR");
  await user.click(screen.getByRole("button", { name: "Criar backup e aplicar" }));
  await waitFor(() => expect(handlers.onFieldSessionChange).toHaveBeenCalledTimes(1));
  expect(handlers.onFieldSessionChange.mock.calls[0][0]).toMatchObject({ next_role: scenario === "pair" ? "complete" : "station", station_management_ip: "" });
  if (scenario === "multipoint") {
    await user.click(screen.getByRole("button", { name: "Desconectar e configurar outra Station" }));
    expect(handlers.onPrepareNextDevice).toHaveBeenCalledTimes(1);
  } else {
    expect(screen.queryByRole("button", { name: "Desconectar e configurar outra Station" })).toBeNull();
  }
});

test("multipoint continuation requires a unique management IP and retains earlier Stations", async () => {
  const user = userEvent.setup();
  const handlers = callbacks();
  handlers.onApplied.mockResolvedValue(verifiedStation("192.0.2.21/24"));
  const session = { link_scenario: "multipoint", stations: ["02:11:11:11:11:11"], station_addresses: { "02:11:11:11:11:11": "192.0.2.20/24" }, completed_roles: ["ap", "station"], next_role: "station", ssid: "ENLACE", passphrase: "lab-password", station_management_ip: "" };
  render(<LinkConfiguration connection={connection} device={{ ...demoDevice({ host: "demo" }), demo_mode: false, ip_addresses: [] }} fieldSession={session} {...handlers} />);
  const ip = screen.getByLabelText("IP de gerenciamento");
  expect(ip.value).toBe("");
  await user.type(ip, "192.0.2.20/24");
  await user.click(screen.getByRole("button", { name: "Revisar alterações" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(api.previewLinkConfiguration).not.toHaveBeenCalled();
  await user.clear(ip); await user.type(ip, "192.0.2.21/24");
  await user.click(screen.getByRole("button", { name: "Revisar alterações" }));
  await user.type(await screen.findByLabelText(/Digite APLICAR/), "APLICAR");
  await user.click(screen.getByRole("button", { name: "Criar backup e aplicar" }));
  await waitFor(() => expect(handlers.onFieldSessionChange).toHaveBeenCalledTimes(1));
  expect(handlers.onFieldSessionChange.mock.calls[0][0].stations).toHaveLength(2);
});

test("the AP cannot accidentally be configured as its own next Station", async () => {
  const user = userEvent.setup();
  const device = { ...demoDevice({ host: "demo" }), demo_mode: false };
  render(<LinkConfiguration connection={connection} device={device} fieldSession={{ next_role: "station", completed_roles: ["ap"], ap_bssid: device.wifi_interfaces[0].mac_address, station_management_ip: "192.0.2.20/24" }} {...callbacks()} />);
  await user.click(screen.getByRole("button", { name: "Revisar alterações" }));
  await screen.findByText(/Este é o AP da sessão/);
  expect(api.previewLinkConfiguration).not.toHaveBeenCalled();
});

test("guided pair setup starts at the AP and reviews before any write", async () => {
  const user = userEvent.setup();
  const handlers = callbacks();
  render(<RadioLink connection={connection} device={{ ...demoDevice({ host: "demo" }), demo_mode: false }} {...handlers} />);
  expect(screen.queryByRole("textbox", { name: "SSID" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Configurar o AP primeiro" }));
  expect(screen.getByLabelText("SSID").value).toBe("ORION-DEMO-LINK");
  await user.type(screen.getByLabelText("Senha do enlace"), "enlace-campo");
  await user.click(screen.getByRole("button", { name: "Revisar alterações" }));
  await screen.findByRole("heading", { name: "Revise antes de confirmar" });
  expect(api.previewLinkConfiguration.mock.calls[0][1]).toMatchObject({ role: "ap", link_scenario: "pair" });
  expect(handlers.onFieldSessionChange.mock.calls[0][0]).toMatchObject({ next_role: "ap", completed_roles: [] });
  expect(api.applyLinkConfiguration).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "2. Dados do enlace" }));
  expect(screen.queryByRole("button", { name: "Criar backup e aplicar" })).toBeNull();
});

test.each([null, { device: demoDevice({ host: "demo" }) }])("a session cannot advance without a matching readback", async (readback) => {
  const user = userEvent.setup();
  const handlers = callbacks();
  handlers.onApplied.mockResolvedValue(readback);
  render(<LinkConfiguration connection={connection} device={{ ...demoDevice({ host: "demo" }), demo_mode: false, ip_addresses: [] }}
    fieldSession={{ next_role: "station", completed_roles: ["ap"], ssid: "ENLACE", station_management_ip: "192.0.2.20/24" }} {...handlers} />);
  await user.click(screen.getByRole("button", { name: "Revisar alterações" }));
  await user.type(await screen.findByLabelText(/Digite APLICAR/), "APLICAR");
  await user.click(screen.getByRole("button", { name: "Criar backup e aplicar" }));
  await waitFor(() => expect(handlers.onApplyEnd).toHaveBeenCalled());
  expect(handlers.onFieldSessionChange).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Concluir sessão e abrir os testes" })).toBeNull();
  handlers.onApplied.mockResolvedValue(verifiedStation("192.0.2.20/24"));
  await user.click(screen.getByRole("button", { name: "Conferir novamente sem reaplicar" }));
  await waitFor(() => expect(handlers.onFieldSessionChange).toHaveBeenCalledOnce());
  expect(api.applyLinkConfiguration).toHaveBeenCalledOnce();
});

test("a radio without a management address does not receive a made-up default", async () => {
  const user = userEvent.setup();
  render(<RadioLink connection={connection} device={{ ...demoDevice({ host: "demo" }), ip_addresses: [] }} {...callbacks()} />);
  await user.click(screen.getByRole("button", { name: "Ajustar somente este rádio" }));
  expect(screen.getByLabelText("IP de gerenciamento").value).toBe("");
});

test.each(["SSID", "Nova senha WPA2 (opcional)"])("Station sessions reject changes to the AP's %s", async (field) => {
  const user = userEvent.setup();
  render(<LinkConfiguration connection={connection} device={{ ...demoDevice({ host: "demo" }), demo_mode: false }}
    fieldSession={{ next_role: "station", completed_roles: ["ap"], ssid: "ENLACE", passphrase: "senha-do-ap", station_management_ip: "192.0.2.20/24" }} {...callbacks()} />);
  await user.type(screen.getByLabelText(field), "outro");
  await user.click(screen.getByRole("button", { name: "Revisar alterações" }));
  await screen.findByText(/Use o SSID e a senha do AP desta sessão/);
  expect(api.previewLinkConfiguration).not.toHaveBeenCalled();
});

test("technician can toggle LAN resources, review and save without changing WAN", async () => {
  const user = userEvent.setup();
  const handlers = callbacks();
  render(<BasicNetworkConfiguration connection={connection} device={routerDevice()} {...handlers} />);
  await screen.findByText("Configuração atual protegida");
  await user.click(screen.getByRole("checkbox", { name: /Manter rede LAN atual/ }));
  const nat = screen.getByRole("checkbox", { name: /Liberar internet na LAN/ });
  const dhcp = screen.getByRole("checkbox", { name: /DHCP nas portas LAN/ });
  await user.click(nat); await user.click(nat);
  await user.click(dhcp); await user.click(dhcp);
  await user.click(screen.getByRole("button", { name: "Revisar configuração" }));
  await waitFor(() => expect(api.previewBasicNetwork).toHaveBeenCalledTimes(1));
  const payload = api.previewBasicNetwork.mock.calls[0][1];
  expect(payload.configure_wan).toBe(false);
  expect(payload.configure_dns).toBe(false);
  expect(payload.existing_lan_configured).toBeUndefined();
  await user.type(screen.getByLabelText(/Digite APLICAR/), "APLICAR");
  await user.click(screen.getByRole("button", { name: "Criar backup e aplicar" }));
  await waitFor(() => expect(api.applyBasicNetwork).toHaveBeenCalledTimes(1));
  expect(handlers.onApplyStart).toHaveBeenCalledTimes(1);
  expect(handlers.onApplyEnd).toHaveBeenCalledTimes(1);
  expect(api.applyBasicNetwork.mock.calls[0][1]).toEqual(payload);
});

test("an incomplete initial read never lets a fallback overwrite the router", async () => {
  api.getBasicNetworkCurrent.mockRejectedValue(new Error("Leitura incompleta"));
  render(<BasicNetworkConfiguration connection={connection} device={routerDevice()} {...callbacks()} />);
  await screen.findByText(/Leitura incompleta. Reconecte/);
  expect(screen.getByRole("button", { name: "Revisar configuração" }).matches(":disabled")).toBe(true);
  expect(api.previewBasicNetwork).not.toHaveBeenCalled();
});

test("switching Wi-Fi interface loads that interface, not the other band's values", async () => {
  const user = userEvent.setup();
  const device = routerDevice();
  device.wifi_interfaces.push({ ...device.wifi_interfaces[0], name: "wifi2", ssid: "OUTRA-REDE", frequency: "5745", channel_width: "20/40/80mhz", band: "5ghz-ax" });
  render(<LinkConfiguration connection={connection} device={device} {...callbacks()} />);
  await user.selectOptions(screen.getByRole("combobox", { name: "Interface Wi-Fi a configurar" }), "wifi2");
  expect(screen.getByLabelText("SSID").value).toBe("OUTRA-REDE");
  expect(screen.getByLabelText("Frequência em MHz").value).toBe("5745");
  expect(screen.getByRole("combobox", { name: "Largura do canal" }).value).toBe("");
  await user.click(screen.getByRole("button", { name: "Revisar alterações" }));
  await waitFor(() => expect(api.previewLinkConfiguration).toHaveBeenCalledTimes(1));
  expect(api.previewLinkConfiguration.mock.calls[0][1]).toMatchObject({ wifi_interface: "wifi2", ssid: "OUTRA-REDE", channel_width: null, passphrase: null, country: null, manage_topology: false });
});

test("Station scan requires consent and selecting an AP prepares a reviewed lock", async () => {
  const user = userEvent.setup();
  const device = { ...demoDevice({ host: "demo-wireless" }), demo_mode: false };
  render(<LinkConfiguration connection={connection} device={device} {...callbacks()} />);
  const scan = screen.getByRole("button", { name: "Buscar APs" });
  expect(scan.disabled).toBe(true);
  await user.click(screen.getByRole("checkbox", { name: /Estou conectado por cabo/ }));
  await user.click(scan);
  await user.click(await screen.findByRole("button", { name: "Selecionar e fixar" }));
  expect(screen.getByLabelText("SSID").value).toBe("TORRE-CAMPO");
  expect(screen.getByLabelText("MAC do AP de destino").value).toBe("02:11:22:33:44:55");
  expect(api.applyLinkConfiguration).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Revisar alterações" }));
  await waitFor(() => expect(api.previewLinkConfiguration).toHaveBeenCalledTimes(1));
  expect(api.previewLinkConfiguration.mock.calls[0][1]).toMatchObject({ ap_lock_action: "lock", ap_bssid: "02:11:22:33:44:55", frequency_mhz: 5500 });
});

test("LoRa opens with saved protections and never enables device reboot implicitly", async () => {
  const user = userEvent.setup();
  render(<LoraProtection connection={connection} device={routerDevice()} {...callbacks()} />);
  await waitFor(() => expect(screen.getByRole("checkbox", { name: /Interface LoRa/ }).checked).toBe(true));
  expect(screen.getByRole("checkbox", { name: /Reiniciar dispositivo/ }).checked).toBe(false);
  expect(screen.getByRole("checkbox", { name: /Desconexão LNS/ }).checked).toBe(false);
  await user.click(screen.getByRole("button", { name: "Verificar compatibilidade e revisar" }));
  await waitFor(() => expect(api.previewLoraProtection).toHaveBeenCalledTimes(1));
  expect(api.previewLoraProtection.mock.calls[0][1]).toMatchObject({ enable_device_reboot: false, enable_lora_guard: true, ping_target: "9.9.9.9", lora_interval: "10m" });
});

test("failed apply releases the operation guard and preserves the field draft", async () => {
  const user = userEvent.setup();
  const handlers = callbacks();
  api.applyLinkConfiguration.mockRejectedValue(new Error("Pode haver alterações parciais. Backup: test.backup."));
  render(<LinkConfiguration connection={connection} device={routerDevice()} {...handlers} />);
  await user.click(screen.getByRole("button", { name: "Revisar alterações" }));
  await user.type(await screen.findByLabelText(/Digite APLICAR/), "APLICAR");
  await user.click(screen.getByRole("button", { name: "Criar backup e aplicar" }));
  await screen.findByRole("alert");
  expect(handlers.onApplyEnd).toHaveBeenCalledTimes(1);
  expect(handlers.onApplied).not.toHaveBeenCalled();
  expect(screen.getByLabelText("SSID").value).not.toBe("");
});

test("reconnecting alone never hides a radio setting that was not saved", async () => {
  const user = userEvent.setup();
  const handlers = callbacks();
  const device = routerDevice();
  handlers.onApplied.mockResolvedValue({ connection, device });
  render(<LinkConfiguration connection={connection} device={device} {...handlers} />);
  await user.clear(screen.getByLabelText("SSID"));
  await user.type(screen.getByLabelText("SSID"), "REDE-NOVA");
  await user.click(screen.getByRole("button", { name: "Revisar alterações" }));
  await user.type(await screen.findByLabelText(/Digite APLICAR/), "APLICAR");
  await user.click(screen.getByRole("button", { name: "Criar backup e aplicar" }));
  await screen.findByText(/Acesso confirmado; confira estes campos: SSID/);
  expect(handlers.onApplyEnd).toHaveBeenCalledTimes(1);
});

test("management defaults follow the selected radio bridge and retain an existing Station IP", async () => {
  const device = { ...demoDevice({ host: "demo" }), demo_mode: false };
  const bridge = device.bridge_ports.find((port) => port.interface === device.wifi_interfaces[0].name).bridge;
  device.ip_addresses = [{ address: "198.51.100.10/24", interface: "ether9" }, { address: "192.0.2.77/24", interface: bridge }];
  render(<LinkConfiguration connection={connection} device={device} fieldSession={{ next_role: "station", completed_roles: ["ap"], ap_management_ip: "192.0.2.1/24", station_management_ip: "192.0.2.2/24" }} {...callbacks()} />);
  expect(screen.getByLabelText("IP de gerenciamento").value).toBe("192.0.2.77/24");
});

test("ending a session discards its reviewed write and password", async () => {
  const user = userEvent.setup();
  render(<LinkConfiguration connection={connection} device={{ ...demoDevice({ host: "demo" }), demo_mode: false }}
    fieldSession={{ next_role: "station", completed_roles: ["ap"], ssid: "ENLACE", passphrase: "senha-do-ap" }} {...callbacks()} />);
  await user.click(screen.getByRole("button", { name: "Revisar alterações" }));
  await screen.findByLabelText(/Digite APLICAR/);
  await user.click(screen.getByRole("button", { name: "Encerrar sessão" }));
  expect(screen.queryByRole("button", { name: "Criar backup e aplicar" })).toBeNull();
  expect(screen.getByLabelText("Nova senha WPA2 (opcional)").value).toBe("");
  expect(api.applyLinkConfiguration).not.toHaveBeenCalled();
});

test("guided setup recovers from a failed write without a blank review step", async () => {
  const user = userEvent.setup();
  api.applyLinkConfiguration.mockRejectedValue(new Error("Falha de conexão"));
  render(<RadioLink connection={connection} device={{ ...demoDevice({ host: "demo" }), demo_mode: false }} {...callbacks()} />);
  await user.click(screen.getByRole("button", { name: "Ajustar somente este rádio" }));
  await user.click(screen.getByRole("button", { name: "Revisar alterações" }));
  await user.type(await screen.findByLabelText(/Digite APLICAR/), "APLICAR");
  await user.click(screen.getByRole("button", { name: "Criar backup e aplicar" }));
  await user.click(await screen.findByRole("button", { name: "Voltar aos dados e revisar novamente" }));
  expect(screen.getByRole("textbox", { name: "SSID" }).value).not.toBe("");
  expect(api.applyLinkConfiguration).toHaveBeenCalledOnce();
});

test.each(["pair", "multipoint"])("guided %s setup carries verified AP settings to a different Station", async (scenario) => {
  const user = userEvent.setup();
  const finished = vi.fn();
  function Workflow() {
    const [session, setSession] = useState(null);
    const [index, setIndex] = useState(0);
    const device = { ...demoDevice({ host: "demo" }), demo_mode: false, identity: index ? "Station-campo" : "AP-campo", ip_addresses: [] };
    device.wifi_interfaces = device.wifi_interfaces.map((wifi) => ({ ...wifi, mac_address: index ? "02:00:00:00:09:02" : "02:00:00:00:09:01" }));
    const readback = async () => {
      const request = api.applyLinkConfiguration.mock.lastCall[1];
      return { device: { ...device, identity: request.identity,
        wifi_interfaces: device.wifi_interfaces.map((wifi) => ({ ...wifi, mode: request.role === "ap" ? "ap" : "station-bridge", ssid: request.ssid, frequency: String(request.frequency_mhz), channel_width: request.channel_width || wifi.channel_width })),
        ip_addresses: [{ address: request.management_ip }],
        bridge_ports: [request.wifi_interface, ...request.bridge_interfaces].map((name) => ({ interface: name, bridge: request.bridge_name })),
      } };
    };
    return <RadioLink key={index} connection={connection} device={device} fieldSession={session} {...callbacks()}
      onApplied={readback} onFieldSessionChange={setSession} onPrepareNextDevice={() => setIndex(index + 1)} onFinishFieldSession={() => finished(session)} />;
  }
  render(<Workflow />);
  if (scenario === "multipoint") await user.click(screen.getByRole("radio", { name: /AP com várias Stations/ }));
  await user.click(screen.getByRole("button", { name: "Configurar o AP primeiro" }));
  await user.type(screen.getByLabelText("Senha do enlace"), "senha-do-enlace");
  await user.type(screen.getByLabelText("IP de gerenciamento"), "192.0.2.10/24");
  for (let index = 0; index < 2; index += 1) {
    await user.click(screen.getByRole("button", { name: "Revisar alterações" }));
    await user.type(await screen.findByLabelText(/Digite APLICAR/), "APLICAR");
    await user.click(screen.getByRole("button", { name: "Criar backup e aplicar" }));
    if (!index) {
      await user.click(await screen.findByRole("button", { name: "Desconectar AP e configurar Station" }));
      await user.click(screen.getByRole("button", { name: "Continuar para os dados do enlace" }));
      expect(screen.getByLabelText("IP de gerenciamento").value).toBe("192.0.2.11/24");
      expect(screen.getByLabelText("Nova senha WPA2 (opcional)").value).toBe("senha-do-enlace");
    }
  }
  await user.click(await screen.findByRole("button", { name: "Concluir sessão e abrir os testes" }));
  expect(finished.mock.calls[0][0]).toMatchObject({ next_role: scenario === "pair" ? "complete" : "station", ap_identity: "AP-campo", station_details: { "02:00:00:00:09:02": { identity: "Station-campo", address: "192.0.2.11/24" } } });
  expect(api.applyLinkConfiguration).toHaveBeenCalledTimes(2);
});
