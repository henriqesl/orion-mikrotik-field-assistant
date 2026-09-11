import test from "node:test";
import assert from "node:assert/strict";
import { networkFormFromCurrent, networkPayload } from "../src/services/networkForm.js";

const fallback = { identity: "MikroTik", wan_interface: "ether1", wan_mode: "dhcp", lan_bridge: "bridge-lan", lan_address: "192.168.50.1/24", lan_ports: ["ether2", "ether3"], dns_servers: "1.1.1.1, 8.8.8.8", enable_nat: true, enable_lan_dhcp: true };
const current = { ...fallback, wan_interface: "wifi1", wan_configured: true, configure_lan: true, dns_servers: ["9.9.9.9"], wan_address: null, gateway: null };

test("existing WAN, LAN and DNS start protected with their real values", () => {
  const form = networkFormFromCurrent(current, fallback);
  assert.equal(form.configure_wan, false);
  assert.equal(form.configure_lan, false);
  assert.equal(form.configure_dns, false);
  assert.equal(form.wan_interface, "wifi1");
  assert.equal(form.wan_address, "");
  assert.equal(form.dns_servers, "9.9.9.9");
});

test("LAN off clears only the request, not the technician's draft", () => {
  const form = networkFormFromCurrent(current, fallback);
  const payload = networkPayload(form);
  assert.equal(payload.lan_address, null);
  assert.deepEqual(payload.lan_ports, []);
  assert.equal(payload.enable_nat, false);
  assert.equal(payload.existing_lan_configured, undefined);
  assert.equal(payload.wan_configured, undefined);
  form.configure_lan = true;
  assert.equal(networkPayload(form).lan_address, current.lan_address);
});

test("factory proposal has working DNS, DHCP and NAT without claiming detection", () => {
  const form = networkFormFromCurrent({ ...current, wan_configured: false, configure_lan: false, enable_nat: false, enable_lan_dhcp: false, dns_servers: [] }, fallback);
  assert.equal(form.existing_lan_configured, false);
  assert.equal(form.configure_wan, true);
  assert.equal(form.enable_lan_dhcp, true);
  assert.equal(form.enable_nat, true);
  assert.deepEqual(networkPayload(form).dns_servers, ["1.1.1.1", "8.8.8.8"]);
});

test("DHCP off never sends a hidden pool to the backend", () => {
  const form = { ...networkFormFromCurrent(current, fallback), configure_lan: true, enable_lan_dhcp: false, dhcp_pool_start: "192.168.50.10", dhcp_pool_end: "192.168.50.100" };
  assert.equal(networkPayload(form).dhcp_pool_start, null);
  assert.equal(form.dhcp_pool_start, "192.168.50.10");
});
