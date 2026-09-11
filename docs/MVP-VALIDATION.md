# ORION Field 0.7.3 — MVP validation

Scope: straightforward field configuration, preserving existing settings, with AP discovery and classic-wireless Station locking. No ARGOS, cloud, inventory, or technician accounts.

## Automated checks

| Check | Result |
|---|---|
| Backend | 157 passed; 2 opt-in physical tests skipped |
| Frontend | 6 payload/error tests and 6 React interaction tests passed |
| Native network metrics | CTest passed |
| Frontend production build | Passed |
| Dependency audit | npm reported no known vulnerabilities |

Stateful RouterOS doubles cover new routers, Wi-Fi uplinks, static IP without a gateway, existing bridges/DHCP/NAT, LAN toggles, classic/modern Wi-Fi, AP lock/change/unlock, LoRa scripts/schedulers, backup failure, and interrupted writes. These are simulations, not RouterOS hardware or firmware emulation.

React tests exercise loading existing values, changing interfaces, scan consent, AP selection, preview/apply, and recovery after failure. Native/browser automation was unavailable in this environment; an actual-window visual review remains pending.

## Final bench gate

Use recoverable equipment and an Ethernet connection. Never apply these checks to a production device without authorization.

1. On two classic-wireless radios, configure AP/Station, scan and lock to the intended AP. Confirm the associated MAC. With another AP advertising the same SSID/security, verify the Station does not switch to it when its locked AP is unavailable. Restore the intended AP; then test explicit unlock.
2. On a configured router with Wi-Fi uplink, preserve WAN/DNS, review LAN changes, and verify the IP, DHCP pool, NAT and recovery access afterward. Verify a removed Ethernet LAN member no longer serves that LAN.
3. On a compatible LoRa gateway, load saved protections, change one option, apply, and inspect execution at the next scheduler interval. Keep automatic device reboot off unless explicitly required.
4. Install/upgrade on Windows 10 and Windows 11 x64; check launch, dragging, scrolling, discovery and disconnect. Target compatibility is not a claim of testing both operating systems.

## Operational limits

- Scanning interrupts Wi-Fi. Classic `wireless` connect-list provides the implemented BSSID lock; modern `wifi`/`wifiwave2` do not receive a substitute roaming setting disguised as a lock.
- Successful command/save verification does not prove RF association or scheduler execution.
- Backups are created on the MikroTik. Interrupted writes may be partial; recovery is manual. Reconnect and read the device before retrying.
- Complex bridges, shared pools, CAPsMAN and custom connection/NAT rules are administrator work, not silently normalized by the basic form.
- Internal code signing identifies the internal publisher on trusted company PCs. It does not guarantee public trust, SmartScreen reputation, or antivirus acceptance.

See the [field manual](manual-de-campo.md) and [Windows installation guide](instalacao-interna-windows.md).
