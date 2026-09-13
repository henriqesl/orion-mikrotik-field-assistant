import test from "node:test";
import assert from "node:assert/strict";
import { sameDevice, verifyRadio, verifyNetwork } from "../src/services/verification.js";

test("reconnection requires a matching hardware MAC, not just an identity or IP", () => {
  const first = { identity: "MikroTik", ethernet_interfaces: [{ mac_address: "AA:BB:CC:00:00:01" }] };
  assert.equal(sameDevice(first, { ethernet_interfaces: [{ mac_address: "aa:bb:cc:00:00:01" }] }), true);
  assert.equal(sameDevice(first, { identity: "MikroTik", ethernet_interfaces: [{ mac_address: "AA:BB:CC:00:00:02" }] }), false);
  assert.equal(sameDevice({}, {}), false);
});

const settings = { identity: "AP", wifi_interface: "wifi1", role: "ap", device_kind: "radio", link_scenario: "pair", ssid: "ENLACE", frequency_mhz: null, channel_width: null, manage_topology: false };
const device = { identity: "AP", wifi_stack: "wifi", wifi_interfaces: [{ name: "wifi1", mode: "ap", ssid: "ENLACE", disabled: false }] };
test("readback separates matching radio fields from a silent write failure", () => {
  assert.deepEqual(verifyRadio(settings, device), []);
  assert.deepEqual(verifyRadio({ ...settings, ssid: "NOVO" }, device), ["SSID"]);
  assert.deepEqual(verifyRadio(settings, { ...device, wifi_interfaces: [] }), ["Interface Wi-Fi"]);
});
test("radio verification checks requested topology without requiring RF association", () => {
  const result = verifyRadio({ ...settings, manage_topology: true, management_ip: "192.0.2.1/24", bridge_name: "bridge1", bridge_interfaces: ["ether1"] }, device);
  assert.deepEqual(result, ["IP de gerenciamento", "Bridge: wifi1", "Bridge: ether1"]);
});
test("network readback ignores protected scopes and compares active scopes", () => {
  const request = { identity: "R", configure_wan: false, configure_lan: false, configure_dns: false };
  assert.deepEqual(verifyNetwork(request, { identity: "R", wan_interface: "wifi1", dns_servers: ["1.1.1.1"] }), []);
  assert.deepEqual(verifyNetwork({ ...request, configure_wan: true, wan_interface: "ether1", wan_mode: "static", wan_address: "192.0.2.1/24" }, { identity: "R", wan_interface: "ether1", wan_mode: "static", wan_address: "192.0.2.2/24" }), ["IP WAN"]);
});
test("network readback catches DHCP and pool changes not saved", () => {
  const request = { identity: "R", configure_lan: true, lan_ports: ["ether3", "ether2"], enable_lan_dhcp: true, dhcp_pool_start: "192.0.2.10", dhcp_pool_end: "192.0.2.20" };
  assert.deepEqual(verifyNetwork(request, { ...request, lan_ports: ["ether2", "ether3"], dhcp_pool_end: "192.0.2.30" }), ["Fim do pool"]);
});
