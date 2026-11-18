import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RadioConnection from "../../../radios/frontend/RadioConnection.jsx";
import ConnectionForm from "../src/components/ConnectionForm.jsx";
import { discoverLanDevices } from "../src/services/api.js";

vi.mock("../src/services/api.js", () => ({
  discoverLanDevices: vi.fn(), applyMacBootstrap: vi.fn(), getMacBootstrapAdapters: vi.fn(),
  openWinBox: vi.fn(), previewMacBootstrap: vi.fn(),
}));

beforeEach(() => discoverLanDevices.mockResolvedValue({ status: "listening", devices: [] }));
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
