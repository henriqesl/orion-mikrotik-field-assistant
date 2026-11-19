import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AlignmentMonitor from "../src/features/wireless/AlignmentMonitor.jsx";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const peer = { interface: "wifi1", mac_address: "02:00:00:00:00:01", radio_name: "Station A", signal_dbm: -60 };
const props = { radioAvailable: true, registrationTableAvailable: true, isMonitoring: true, isAlignmentMode: true, peers: [peer], lastUpdatedAt: new Date(1000), onToggleAlignment: vi.fn() };

test("alignment excludes invalid samples and does not record stale readings", () => {
  const view = render(<AlignmentMonitor {...props} />);
  view.rerender(<AlignmentMonitor {...props} lastUpdatedAt={new Date(2000)} peers={[{ ...peer, signal_dbm: -70 }]} />);
  expect(screen.getByRole("img", { name: "Histórico com 2 leituras de sinal" })).toBeTruthy();
  view.rerender(<AlignmentMonitor {...props} lastUpdatedAt={new Date(3000)} monitoringError="timeout" peers={[{ ...peer, signal_dbm: -90 }]} />);
  expect(screen.getByRole("img", { name: "Histórico com 2 leituras de sinal" })).toBeTruthy();
  expect(screen.getByText("Aguardando leitura válida")).toBeTruthy();
  view.rerender(<AlignmentMonitor {...props} lastUpdatedAt={new Date(4000)} peers={[{ ...peer, signal_dbm: undefined }]} />);
  expect(screen.getByText("Sem leitura")).toBeTruthy();
  expect(screen.getByRole("img", { name: "Histórico com 2 leituras de sinal" })).toBeTruthy();
});

test("multipoint audio follows the selected peer and reports unavailable browser audio", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("AudioContext", undefined);
  vi.stubGlobal("webkitAudioContext", undefined);
  render(<AlignmentMonitor {...props} peers={[peer, { ...peer, radio_name: "Station B", mac_address: "02:00:00:00:00:02", signal_dbm: -80 }]} />);
  const sound = screen.getByRole("button", { name: "Ativar som" });
  expect(sound.disabled).toBe(true);
  const select = screen.getByLabelText("Rádio para acompanhar pelo som");
  await user.selectOptions(select, within(select).getByRole("option", { name: "Station B · wifi1" }));
  expect(sound.disabled).toBe(false);
  await user.click(sound);
  expect(screen.getByText(/áudio não está disponível/)).toBeTruthy();
});

test("missing association data cannot start an alignment session", () => {
  render(<AlignmentMonitor {...props} isAlignmentMode={false} registrationTableAvailable={false} />);
  expect(screen.getByRole("button", { name: "Iniciar alinhamento" }).disabled).toBe(true);
});

test("audio uses the selected Station and stays silent on stale or duplicate readings", async () => {
  const user = userEvent.setup();
  const oscillator = { frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  const createOscillator = vi.fn(() => oscillator);
  vi.stubGlobal("AudioContext", class {
    currentTime = 0;
    createOscillator = createOscillator;
    createGain = () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} });
    resume = async () => {};
    close = async () => {};
  });
  const peers = [peer, { ...peer, radio_name: "Station B", mac_address: "02:00:00:00:00:02", signal_dbm: -80 }];
  const view = render(<AlignmentMonitor {...props} peers={peers} />);
  await user.selectOptions(screen.getByLabelText("Rádio para acompanhar pelo som"), "wifi1:02:00:00:00:00:02");
  await user.click(screen.getByRole("button", { name: "Ativar som" }));
  expect(oscillator.frequency.value).toBe(684);
  expect(createOscillator).toHaveBeenCalledOnce();
  view.rerender(<AlignmentMonitor {...props} peers={[...peers]} />);
  expect(createOscillator).toHaveBeenCalledOnce();
  view.rerender(<AlignmentMonitor {...props} peers={peers} lastUpdatedAt={new Date(2000)} monitoringError="timeout" />);
  expect(createOscillator).toHaveBeenCalledOnce();
});

test("a delayed audio permission cannot restart sound after alignment ends", async () => {
  const user = userEvent.setup();
  let resume;
  vi.stubGlobal("AudioContext", class {
    resume = () => new Promise((resolve) => { resume = resolve; });
    close = async () => {};
  });
  const view = render(<AlignmentMonitor {...props} />);
  await user.click(screen.getByRole("button", { name: "Ativar som" }));
  view.rerender(<AlignmentMonitor {...props} isAlignmentMode={false} />);
  await act(async () => { resume(); });
  expect(screen.getByRole("button", { name: "Ativar som" }).disabled).toBe(true);
});
