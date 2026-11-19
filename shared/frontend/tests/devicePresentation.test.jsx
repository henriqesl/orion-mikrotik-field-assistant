import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DeviceSummary from "../src/components/DeviceSummary.jsx";
import { demoDevice } from "../src/services/demo.js";

vi.mock("../src/components/TrafficMonitor.jsx", () => ({ default: () => <div>Tráfego de teste</div> }));
afterEach(cleanup);
const device = demoDevice({ host: "demo" });

test("radio presentation keeps traffic and warnings visible while technical details can be expanded", async () => {
  const user = userEvent.setup();
  const withWarning = { ...device, structural_diagnostic: { checks: [{ key: "bridge", label: "Bridge", status: "warning", summary: "Revisar portas", possible_causes: [] }] } };
  render(<DeviceSummary device={withWarning} compact monitoringError="Leitura indisponível" />);
  const summary = screen.getByText("Dados técnicos e diagnóstico").closest("summary");
  expect(summary.parentElement.open).toBe(false);
  expect(screen.getByText("1 item para conferir")).toBeTruthy();
  expect(screen.getByText("Tráfego de teste").closest("details")).toBeNull();
  expect(screen.getByRole("alert").closest("details")).toBeNull();
  expect(screen.queryByText("Conectado")).toBeNull();
  await user.click(summary);
  expect(summary.parentElement.open).toBe(true);
  expect(screen.getByText("Revisar portas")).toBeTruthy();
});

test("RouterBoard presentation retains expanded technical content", () => {
  render(<DeviceSummary device={device} />);
  expect(screen.queryByText("Dados técnicos e diagnóstico")).toBeNull();
  expect(screen.getByText("Interfaces Wi-Fi").closest("details")).toBeNull();
});
