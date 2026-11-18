import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App.jsx";
import radios from "../../../radios/workspace.mjs";
import routerboards from "../../../routerboards/workspace.mjs";
import { demoDevice } from "../src/services/demo.js";
import { discoverDevice } from "../src/services/api.js";

vi.mock("../src/services/api.js", () => ({ discoverDevice: vi.fn() }));
vi.mock("../src/components/ConnectionForm.jsx", () => ({
  default: ({ onConnect }) => <button onClick={() => onConnect({ host: "demo-router" })}>Conectar teste</button>,
}));
vi.mock("../src/components/DeviceSummary.jsx", () => ({ default: () => <div>Resumo de teste</div> }));
vi.mock("../src/components/BasicNetworkConfiguration.jsx", () => ({ default: () => <div>Editor de rede de teste</div> }));
vi.mock("../src/components/LoraProtection.jsx", () => ({ default: () => <div>Editor LoRa de teste</div> }));
vi.mock("../src/components/LinkConfiguration.jsx", () => ({ default: () => <div>Editor de enlace de teste</div> }));
vi.mock("../src/components/AlignmentMonitor.jsx", () => ({ default: () => null }));
vi.mock("../src/components/PingTest.jsx", () => ({ default: () => null }));
vi.mock("../src/components/UpdateNotice.jsx", () => ({ default: () => null }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ok", service: "orion-field-api" }) }));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  discoverDevice.mockResolvedValue({ ...demoDevice({ host: "demo-router" }), lora_available: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("radio workspace shows only device, link and tests and never mounts router panels", async () => {
  render(<App workspace={radios} />);
  await userEvent.click(screen.getByRole("button", { name: "Conectar teste" }));
  await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(3));
  expect(screen.getByRole("tab", { name: "Equipamento" })).toBeTruthy();
  await userEvent.click(screen.getByRole("tab", { name: "Enlace" }));
  expect(screen.getByText("Editor de enlace de teste")).toBeTruthy();
  expect(screen.queryByText("Editor de rede de teste")).toBeNull();
  expect(screen.queryByText("Editor LoRa de teste")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Desconectar" }));
  expect(screen.queryByRole("tablist")).toBeNull();
});

test("RouterBoard workspace retains basic network and LoRa workflows", async () => {
  render(<App workspace={routerboards} />);
  await userEvent.click(screen.getByRole("button", { name: "Conectar teste" }));
  await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(5));
  await userEvent.click(screen.getByRole("tab", { name: "Rede básica" }));
  expect(screen.getByText("Editor de rede de teste")).toBeTruthy();
  await userEvent.click(screen.getByRole("tab", { name: "LoRa" }));
  expect(screen.getByText("Editor LoRa de teste")).toBeTruthy();
});

test("radio workspace keeps unsupported Wi-Fi disabled", async () => {
  discoverDevice.mockResolvedValue({ ...demoDevice({ host: "demo-router" }), wifi_interfaces: [] });
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: "Conectar teste" }));
  await waitFor(() => expect(screen.getByRole("tab", { name: /Enlace/ }).disabled).toBe(true));
  expect(screen.queryByText("Editor de enlace de teste")).toBeNull();
});
