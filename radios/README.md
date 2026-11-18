# ORION Radios

The default workspace for field technicians preparing a radio pair or an AP with multiple Stations. Its navigation is limited to the device, link configuration and tests. RouterBoard network and LoRa panels are not mounted here.

Run the API as described in the [root README](../README.md), then run `npm ci` and `npm run dev` from `shared/frontend`. Open `http://localhost:5174`. Use `demo` to explore without hardware.

`workspace.mjs` owns the radio navigation. Components and RouterOS communication are reused from `shared/`; this first stage does not change device access or configuration commands. Simplified discovery, guided preparation and radio-specific usability are the next stages, not completed features.
