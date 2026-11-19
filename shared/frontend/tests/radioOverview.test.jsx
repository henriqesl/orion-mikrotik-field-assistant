import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RadioOverview from "../../../radios/frontend/RadioOverview.jsx";
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
