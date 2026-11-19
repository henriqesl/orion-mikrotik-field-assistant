# ORION Radios — validation status

Radio-workspace closure, November 19, 2026. This is the local web implementation, not a new installer release. RouterBoard and LoRa workflows remain separate. No ARGOS, cloud, inventory or technician accounts were added.

## Automated checks

| Check | Result |
|---|---|
| Backend | 166 passed; 2 opt-in physical tests excluded |
| Frontend | 14 unit tests and 67 React interaction tests |
| Production builds | Radios and RouterBoards |
| npm dependency audit | No known vulnerabilities reported on November 19, 2026 |
| Native engine and Windows installer | Unchanged; not rebuilt or revalidated in this pass |

The frontend suite covers access selection and credential isolation, reviewed MAC preparation, AP-to-Station handoff, multipoint continuation, existing settings, duplicate IPs within a session, mismatched readback, read-only retry, device identity changes, ping lifecycle and alignment audio. Backend doubles cover existing RouterOS configurations and partial-write failures. These are simulations, not firmware or hardware emulation.

A real-window visual review remains pending: the computer-use runtime required by the installed skill was not available in this session. No physical tests were run. Passing automated checks is not approval for unattended production use.

## Radio bench validation

Use recoverable equipment and an Ethernet connection. Record the model, RouterOS version and Wi-Fi driver for each radio. Do not test disruptive changes on a production device without authorization.

Begin with two radios that need preparation. Confirm discovery, credentials and MAC preparation where available. Check that the reviewed IP remains after disconnecting, and that API access works without internet.

Configure a dedicated AP/Station pair through the guided flow. Confirm the saved identity, Wi-Fi settings, bridge and management access on each device. Check the expected remote MAC, authorization, ping to the other radio and communication with a device beyond the link.

Repeat with already-configured radios. Confirm that unrelated settings and recovery access remain intact. Exercise different management subnets, a duplicate address within the session and a failed readback; verification retry must not send another write.

On classic `wireless`, validate scan consent, BSSID lock and explicit unlock. Test a second AP with the same SSID/security to confirm lock behavior. On modern `wifi`, validate the supported Station-bridge pairing and MAC comparison without claiming a BSSID lock. Include the intended SXTsq 5 ax / RouterOS 7.19+ equipment; driver-family compatibility alone is not hardware approval.

For multipoint, configure a second Station, confirm its unique address and test each remote endpoint. Select each Station for alignment audio, interrupt an update and confirm that stale data does not continue generating samples or sound.

Finally, inspect the real browser at normal and narrow window widths: connection, all three tabs, review, error recovery, keyboard focus, selectors and scrolling. Record observed results before approving the radio workflow for technicians.

## Distribution and limits

The current installed application does not update with a Git pull. Rebuild and validate a new installer separately, including install/upgrade and launch on Windows 10 and Windows 11 x64. Neither platform has been revalidated in this closure pass.

Readback confirms readable settings, not password contents, RF association or performance. A ping response does not identify the path taken. Suggested addresses are not a network-wide conflict check.

Backups are stored on the MikroTik; interrupted writes may be partial and restoration is manual. CAPsMAN, custom routing, shared pools and complex bridges remain administrator work. Internal signing does not guarantee public certificate trust, SmartScreen reputation or antivirus acceptance.

Follow the [field manual](manual-de-campo.md), [compatibility record](COMPATIBILITY.md) and [Windows installation guide](instalacao-interna-windows.md).
