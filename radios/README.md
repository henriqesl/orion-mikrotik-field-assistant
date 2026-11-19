# ORION Radios

Radio setup: one AP with one or more Stations. The interface has three tabs: Equipment, Link and Tests.

Run the API as described in the [root README](../README.md), then run `npm ci` and `npm run dev` from `shared/frontend`. Open `http://localhost:5174`. Use `demo` to explore without hardware.

`workspace.mjs` selects the radio navigation and components. `frontend/RadioConnection.jsx` provides the radio access screen: select a discovered device or enter its existing IP, with troubleshooting available on demand. No factory IP is assumed. MAC preparation still uses the existing implementation.

Wi-Fi configuration and alignment come from `shared/frontend/src/features/wireless/`, also used by RouterBoards with Wi-Fi. Network and LoRa screens are not included in this entry.

Selecting a discovered device shows its identity, model, IP and MAC before login. Switching devices clears the previous password; editing the IP clears the selection. Discovery never replaces the entered address automatically. An unannounced IP does not prove that the device has no configured address.

After login, the link summary shows interfaces, AP/Station roles and remote peers, with shortcuts to configuration and communication tests. Missing registration data and stale readings are shown separately from an empty association table. Association alone does not confirm working traffic.

MAC preparation keeps credentials beside the network settings. If several computer adapters are available, choose the one connected to the radio before reviewing changes. Connection failures retain the original error and offer a relevant next check; ORION does not retry credentials or weaken TLS settings automatically.
