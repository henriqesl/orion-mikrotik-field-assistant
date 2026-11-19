import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RadioConnection from "../../../radios/frontend/RadioConnection.jsx";
import ConnectionForm from "../src/components/ConnectionForm.jsx";
import { discoverLanDevices, getMacBootstrapAdapters } from "../src/services/api.js";

vi.mock("../src/services/api.js", () => ({
  discoverLanDevices: vi.fn(), applyMacBootstrap: vi.fn(), getMacBootstrapAdapters: vi.fn(),
  openWinBox: vi.fn(), previewMacBootstrap: vi.fn(),
}));

beforeEach(() => {
  discoverLanDevices.mockResolvedValue({ status: "listening", devices: [] });
});
afterEach(cleanup);

test("radio access requires an address instead of assuming a factory IP", async () => {
  const user = userEvent.setup();
  const onConnect = vi.fn().mockResolvedValue(true);
  render(<RadioConnection onConnect={onConnect} />);
  expect(screen.getByLabelText("Endereço IP").value).toBe("");
  await user.click(screen.getByRole("button", { name: "Conectar e identificar" }));
  expect(onConnect).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("Endereço IP"), "192.0.2.15");
  await user.click(screen.getByRole("button", { name: "Conectar e identificar" }));
  expect(onConnect).toHaveBeenCalledWith(expect.objectContaining({ host: "192.0.2.15", username: "admin", port: 8728 }));
});

test("radio access offers troubleshooting without changing device settings", async () => {
  const user = userEvent.setup();
  render(<RadioConnection onConnect={vi.fn()} />);
  await user.click(screen.getByText("O rádio não apareceu?"));
  expect(screen.getByText(/A descoberta pode estar desativada/).closest("details").open).toBe(true);
  expect(discoverLanDevices).toHaveBeenCalled();
});

test("the shared connection screen keeps RouterBoard defaults", () => {
  render(<ConnectionForm onConnect={vi.fn()} />);
  expect(screen.getByLabelText("Endereço IP").value).toBe("192.168.88.1");
  expect(screen.getByRole("heading", { name: "Dados de acesso" })).toBeTruthy();
  expect(screen.queryByText("O rádio não apareceu?")).toBeNull();
});

const device = (identity, ip_address, mac_address) => ({ identity, ip_address, mac_address, board: "SXTsq", interface: "ether1" });

test("changing the target clears the previous password and manual IP edits clear selection", async () => {
  const user = userEvent.setup();
  discoverLanDevices.mockResolvedValue({ devices: [
    device("AP-Torre", "192.0.2.10", "02:00:00:00:00:01"),
    device("Station-Campo", "192.0.2.20", "02:00:00:00:00:02"),
  ] });
  render(<RadioConnection onConnect={vi.fn()} />);
  const buttons = await screen.findAllByRole("button", { name: "Usar no ORION" });
  await user.click(buttons[0]);
  await user.type(screen.getByLabelText("Senha"), "senha-ap");
  await user.click(buttons[1]);
  expect(screen.getByLabelText("Senha").value).toBe("");
  expect(screen.getByLabelText("Endereço IP").value).toBe("192.0.2.20");
  expect(within(screen.getByRole("status", { name: "Equipamento selecionado" })).getByText("Station-Campo")).toBeTruthy();
  await user.clear(screen.getByLabelText("Endereço IP"));
  expect(screen.queryByRole("status", { name: "Equipamento selecionado" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Selecionado" })).toBeNull();
});

test("MAC preparation clears the previous target and discovery never overwrites a typed IP", async () => {
  const user = userEvent.setup();
  const radio = device("Station", "0.0.0.0", "02:00:00:00:00:03");
  discoverLanDevices.mockResolvedValue({ devices: [radio] });
  getMacBootstrapAdapters.mockResolvedValue([]);
  render(<RadioConnection onConnect={vi.fn()} />);
  await user.type(screen.getByLabelText("Endereço IP"), "192.0.2.10");
  await user.click(await screen.findByRole("button", { name: "Preparar por MAC" }));
  expect(screen.getByLabelText("Endereço IP").value).toBe("");
  discoverLanDevices.mockResolvedValue({ devices: [{ ...radio, ip_address: "192.0.2.30" }] });
  await user.click(screen.getByRole("button", { name: "Atualizar" }));
  await screen.findByText(/IP anunciado: 192.0.2.30/);
  expect(screen.getByLabelText("Endereço IP").value).toBe("");
  await user.type(screen.getByLabelText("Endereço IP"), "192.0.2.40");
  await user.click(screen.getByRole("button", { name: "Atualizar" }));
  expect(screen.getByLabelText("Endereço IP").value).toBe("192.0.2.40");
});

test("discovery failure leaves direct IP access available", async () => {
  discoverLanDevices.mockRejectedValue(new Error("Falha de descoberta"));
  render(<RadioConnection onConnect={vi.fn()} />);
  await screen.findByText("Descoberta indisponível. Você ainda pode informar o IP.");
  expect(screen.getByLabelText("Endereço IP").disabled).toBe(false);
  expect(screen.getByRole("button", { name: "Atualizar" }).disabled).toBe(false);
});
