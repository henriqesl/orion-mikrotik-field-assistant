# Compatibility and field acceptance

This is an independent project, not a MikroTik-certified application. A menu being supported is not proof that every device or RouterOS version has been tested.

| Target | Implemented path | Physical acceptance for current changes |
|---|---|---|
| SXTsq 5 ax, `wifi-qcom` | Pair, AP with multiple Stations, existing-AP Station; association MAC check, no BSSID lock | Pending; record the exact RouterOS build, not “7.19+” |
| Classic `wireless` | Pair / multipoint, scan, connect-list BSSID lock | Pending on identified models/builds |
| Generic router | Scoped WAN/LAN/DNS/services changes | Pending on identified models/builds |
| Compatible LoRa gateway | Read/save ORION protections and verify saved scripts/schedulers | Pending actual scheduler execution |
| Windows 10 / 11 x64 | Tauri installer and local API | Both OS versions need install/upgrade acceptance |

## Acceptance record

For each target, record: model, exact RouterOS version, package/driver, ORION commit/build, scenario, result and recovery method. Keep credentials and exports containing secrets out of the repository.

Minimum radio bench: configure AP and Station, verify addresses and associated MAC, pass traffic, restart both, reconnect, and recover after a deliberately interrupted lab-only operation. For multipoint, use at least two Stations. An API response or saved configuration is not a throughput test.

The source now compares readable settings after reconnecting and checks hardware MAC continuity. This is not cryptographic identity verification; use validated API-SSL for that. Wi-Fi password contents, every inherited radio property and RF behavior are not claimed as verified.

The coarse frequency/band check is not a regulatory channel database. RouterOS still determines usable channels, country limits and DFS behavior. Preserve advanced settings unless the technician has a reviewed radio plan. See [MikroTik WiFi documentation](https://manual.mikrotik.com/docs/wireless/wifi/).
