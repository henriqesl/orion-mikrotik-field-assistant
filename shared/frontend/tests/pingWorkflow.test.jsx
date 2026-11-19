import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PingTest from "../src/components/PingTest.jsx";
import { runPing } from "../src/services/api.js";
import { demoPing } from "../src/services/demo.js";

vi.mock("../src/services/api.js", () => ({ runPing: vi.fn() }));
afterEach(cleanup);
const connection = { host: "192.0.2.10" };

test("a session endpoint fills the form but requires an explicit test", async () => {
  const user = userEvent.setup();
  runPing.mockResolvedValue(demoPing("192.0.2.11"));
  render(<PingTest connection={connection} suggestedTarget={{ host: "192.0.2.11" }} radioContext />);
  expect(screen.getByLabelText("IP do destino").value).toBe("192.0.2.11");
  expect(runPing).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Testar conexão" }));
  await screen.findByText("Destino testado");
  expect(runPing).toHaveBeenCalledWith(connection, "192.0.2.11", 10);
  expect(screen.queryByText("Saúde do enlace")).toBeNull();
});

test("switching equipment discards a late ping and prevents overlapping submissions", async () => {
  const user = userEvent.setup();
  let resolve;
  runPing.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const view = render(<PingTest connection={connection} />);
  await user.type(screen.getByLabelText("IP do destino"), "192.0.2.11");
  await user.dblClick(screen.getByRole("button", { name: "Testar conexão" }));
  expect(runPing).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("IP do destino").disabled).toBe(true);
  view.rerender(<PingTest connection={{ host: "192.0.2.20" }} />);
  await act(async () => { resolve(demoPing("192.0.2.11")); });
  expect(screen.queryByText("Destino testado")).toBeNull();
  expect(screen.getByLabelText("IP do destino").value).toBe("");
  expect(screen.getByRole("button", { name: "Testar conexão" }).disabled).toBe(false);
});
