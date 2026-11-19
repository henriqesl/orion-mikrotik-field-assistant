import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
vi.mock("../../../routerboards/frontend/BasicNetworkConfiguration.jsx", () => ({ default: () => <div>Editor de rede de teste</div> }));
vi.mock("../../../routerboards/frontend/LoraProtection.jsx", () => ({ default: () => <div>Editor LoRa de teste</div> }));
vi.mock("../src/features/wireless/LinkConfiguration.jsx", () => ({ default: () => <div>Editor de enlace de teste</div> }));
vi.mock("../src/features/wireless/AlignmentMonitor.jsx", () => ({ default: () => null }));
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

async function connect(workspace = radios) {
  const user = userEvent.setup();
  render(<App workspace={workspace} />);
  await user.click(screen.getByRole("button", { name: "Conectar teste" }));
  await screen.findByRole("tablist");
  return user;
}

test("radios exclude network and LoRa panels", async () => {
  const user = await connect();
  expect(screen.getAllByRole("tab")).toHaveLength(3);
  expect(screen.getByRole("tab", { name: "Equipamento" })).toBeTruthy();
  await user.click(screen.getByRole("tab", { name: "Enlace" }));
  expect(screen.getByRole("tabpanel", { name: "Enlace" }).hidden).toBe(false);
  expect(screen.queryByText("Editor de rede de teste")).toBeNull();
  expect(screen.queryByText("Editor LoRa de teste")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Desconectar" }));
  expect(screen.queryByRole("tablist")).toBeNull();
});

test("routerboards retain network and LoRa panels", async () => {
  const user = await connect(routerboards);
  expect(screen.getAllByRole("tab")).toHaveLength(5);
  for (const name of ["Rede básica", "LoRa"]) {
    await user.click(screen.getByRole("tab", { name }));
    expect(screen.getByRole("tabpanel", { name }).hidden).toBe(false);
  }
});

test("devices without Wi-Fi cannot open link configuration", async () => {
  discoverDevice.mockResolvedValue({ ...demoDevice({ host: "demo-router" }), wifi_interfaces: [] });
  await connect();
  expect(screen.getByRole("tab", { name: /Enlace/ }).disabled).toBe(true);
  expect(screen.queryByText("Editor de enlace de teste")).toBeNull();
});

test("radio overview shortcuts open the corresponding workspace tab", async () => {
  const user = await connect(radios);
  await user.click(screen.getByRole("button", { name: "Configurar enlace" }));
  expect(screen.getByRole("tab", { name: "Enlace" }).getAttribute("aria-selected")).toBe("true");
  await user.click(screen.getByRole("tab", { name: "Equipamento" }));
  await user.click(screen.getByRole("button", { name: "Testar comunicação" }));
  expect(screen.getByRole("tab", { name: "Testes" }).getAttribute("aria-selected")).toBe("true");
});

test("RouterBoards do not mount the radio overview", async () => {
  await connect(routerboards);
  expect(screen.queryByRole("region", { name: "Resumo do enlace" })).toBeNull();
});

test("polling another device at the same IP locks configuration until identity is confirmed", async () => {
  const user = await connect(radios);
  const original = { ...demoDevice({ host: "demo-router" }), lora_available: true };
  const other = { ...original,
    wifi_interfaces: original.wifi_interfaces.map((wifi) => ({ ...wifi, mac_address: "02:00:00:99:00:01" })),
    ethernet_interfaces: original.ethernet_interfaces.map((ethernet) => ({ ...ethernet, mac_address: "02:00:00:99:00:02" })),
  };
  discoverDevice.mockResolvedValue(other);
  await user.click(screen.getByRole("tab", { name: "Testes" }));
  await user.click(screen.getByRole("button", { name: "Atualizar associação" }));
  expect(screen.getByRole("tab", { name: /Enlace/ }).disabled).toBe(true);
  expect(screen.getByRole("tab", { name: "Equipamento" }).getAttribute("aria-selected")).toBe("true");
  discoverDevice.mockResolvedValue(original);
  await user.click(screen.getByRole("tab", { name: "Testes" }));
  await user.click(screen.getByRole("button", { name: "Atualizar associação" }));
  expect(screen.getByRole("tab", { name: "Enlace" }).disabled).toBe(false);
});
