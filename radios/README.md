# ORION Radios

Radio setup: one AP with one or more Stations. The interface has three tabs: Equipment, Link and Tests.

Run the API as described in the [root README](../README.md), then run `npm ci` and `npm run dev` from `shared/frontend`. Open `http://localhost:5174`. Use `demo` to explore without hardware.

`workspace.mjs` selects the radio navigation and components. `frontend/RadioConnection.jsx` provides the radio access screen: select a discovered device or enter its existing IP, with troubleshooting available on demand. No factory IP is assumed. MAC preparation still uses the existing implementation.

Wi-Fi configuration and alignment come from `shared/frontend/src/features/wireless/`, also used by RouterBoards with Wi-Fi. Network and LoRa screens are not included in this entry.
