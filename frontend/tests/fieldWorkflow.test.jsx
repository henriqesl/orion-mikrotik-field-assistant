import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BasicNetworkConfiguration from "../src/components/BasicNetworkConfiguration.jsx";
import LinkConfiguration from "../src/components/LinkConfiguration.jsx";
import LoraProtection from "../src/components/LoraProtection.jsx";
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
  const session = { link_scenario: scenario, stations: [], completed_roles: ["ap"], next_role: "station", ssid: "ENLACE", passphrase: "lab-password", station_management_ip: "192.0.2.20/24" };
  render(<LinkConfiguration connection={connection} device={{ ...demoDevice({ host: "demo" }), demo_mode: false }} fieldSession={session} {...handlers} />);
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
  const session = { link_scenario: "multipoint", stations: ["02:11:11:11:11:11"], station_addresses: { "02:11:11:11:11:11": "192.0.2.20/24" }, completed_roles: ["ap", "station"], next_role: "station", ssid: "ENLACE", passphrase: "lab-password", station_management_ip: "" };
  render(<LinkConfiguration connection={connection} device={{ ...demoDevice({ host: "demo" }), demo_mode: false }} fieldSession={session} {...handlers} />);
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
