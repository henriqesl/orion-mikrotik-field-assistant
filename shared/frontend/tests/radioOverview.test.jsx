import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RadioOverview from "../../../radios/frontend/RadioOverview.jsx";
import RadioValidation from "../../../radios/frontend/RadioValidation.jsx";
import { linkStatus } from "../../../radios/frontend/linkStatus.js";
import { sessionSummary } from "../src/features/wireless/sessionSummary.js";
import ConnectionHelp from "../../../radios/frontend/ConnectionHelp.jsx";
import { discoverDevice } from "../src/services/api.js";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const radio = { identity: "Torre", model: "SXTsq", routeros_version: "7.19", registration_table_available: true,
  wifi_interfaces: [{ name: "wifi1", mode: "ap", ssid: "CAMPO" }], wifi_peers: [] };

test("radio overview lists multiple peers without treating pending authorization as success", async () => {
  const onTests = vi.fn();
  render(<RadioOverview device={{ ...radio, wifi_peers: [
    { interface: "wifi1", mac_address: "02:00:00:00:00:01", authorized: true, signal_dbm: -60 },
    { interface: "wifi1", mac_address: "02:00:00:00:00:02", authorized: false, signal_dbm: null },
  ] }} onTests={onTests} />);
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByText("Autorização pendente")).toBeTruthy();
  expect(screen.getByText("Sinal não informado")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Testar comunicação" }));
  expect(onTests).toHaveBeenCalledOnce();
});

test.each([
  [{ ...radio, registration_table_available: false }, "", "Associação não disponível para leitura", false],
  [{ ...radio, wifi_interfaces: [] }, "", "Wi-Fi não detectado", true],
  [radio, "timeout", "Leitura desatualizada", true],
])("overview distinguishes missing data from a disconnected link", (device, monitoringError, label, disabled) => {
  render(<RadioOverview device={device} monitoringError={monitoringError} />);
  expect(screen.getByText(label)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Configurar enlace" }).disabled).toBe(disabled);
});

test.each([
  [{ status: 401 }, /Confira o usuário/],
  [{ status: 504 }, /ainda não responder pela API/],
  [{ code: "BACKEND_UNREACHABLE" }, /serviço local não respondeu/],
])("connection help offers the next check without retrying credentials", (props, text) => {
  render(<ConnectionHelp {...props} />);
  expect(screen.getByText(text)).toBeTruthy();
});

test("API failures preserve their status for connection guidance", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ detail: "Acesso recusado" }) }));
  await expect(discoverDevice({ host: "192.0.2.15" })).rejects.toMatchObject({ status: 401, message: "Acesso recusado" });
});

test("a local service failure is distinguished from a MikroTik rejection", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
  await expect(discoverDevice({ host: "192.0.2.15" })).rejects.toMatchObject({ code: "BACKEND_UNREACHABLE" });
});

test.each([
  [{ ...radio, wifi_interfaces: [{ name: "wifi1", disabled: true }] }, "", "Wi-Fi desativado"],
  [{ ...radio, wifi_peers: [{ authorized: true }, { authorized: false }] }, "", "Autorização pendente"],
  [{ ...radio, wifi_peers: [{ authorized: true }] }, "timeout", "Leitura desatualizada"],
  [{ ...radio, registration_table_available: false, wifi_peers: [{ authorized: true }] }, "", "Associação não disponível para leitura"],
  [{ ...radio, wifi_peers: [{ authorized: null }] }, "", "Associação detectada"],
])("link guidance does not infer connectivity from incomplete evidence", (device, error, label) => {
  expect(linkStatus(device, error).label).toBe(label);
});

test("an unassociated Station is directed to check its AP", () => {
  expect(linkStatus({ ...radio, wifi_interfaces: [{ mode: "station-bridge" }] }).hint).toContain("AP está ligado");
  expect(linkStatus(radio).hint).toContain("Ligue a Station");
});

test("link validation refreshes readings without applying configuration", async () => {
  const onRefresh = vi.fn();
  const onConfigure = vi.fn();
  const view = render(<RadioValidation device={radio} onRefresh={onRefresh} onConfigure={onConfigure} />);
  await userEvent.click(screen.getByRole("button", { name: "Atualizar associação" }));
  expect(onRefresh).toHaveBeenCalledOnce();
  expect(onConfigure).not.toHaveBeenCalled();
  expect(screen.getByText(/confira cada uma separadamente/)).toBeTruthy();
  view.rerender(<RadioValidation device={radio} disabled onRefresh={onRefresh} onConfigure={onConfigure} />);
  expect(screen.getByRole("button", { name: "Atualizar associação" }).disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Revisar enlace" }).disabled).toBe(true);
});

test("finished-session guidance retains endpoints, not credentials, and selects a target without running it", async () => {
  const summary = sessionSummary({ ssid: "CAMPO", passphrase: "private-password", ap_identity: "Torre", ap_bssid: "02:00:00:00:00:01", ap_management_ip: "192.0.2.1/24", station_addresses: { "02:00:00:00:00:02": "192.0.2.2/24" }, station_details: { "02:00:00:00:00:02": { identity: "Galpão", wifi_interface: "wifi1" } } });
  expect(JSON.stringify(summary)).not.toContain("private-password");
  const onSelectTarget = vi.fn();
  const device = { ...radio, wifi_interfaces: [{ name: "wifi1", mac_address: "02:00:00:00:00:02" }], wifi_peers: [{ interface: "wifi1", mac_address: "02:00:00:00:00:09" }] };
  const view = render(<RadioValidation device={device} summary={summary} onSelectTarget={onSelectTarget} />);
  expect(screen.getByText(/associado a outro MAC/)).toBeTruthy();
  expect(onSelectTarget).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Usar IP de Torre: 192.0.2.1" }));
  expect(onSelectTarget).toHaveBeenCalledWith("192.0.2.1");
  view.rerender(<RadioValidation device={radio} summary={summary} onSelectTarget={onSelectTarget} />);
  expect(screen.queryByRole("region", { name: "Equipamentos configurados nesta sessão" })).toBeNull();
});
