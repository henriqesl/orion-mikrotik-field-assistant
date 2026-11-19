# ORION Radios

Radio setup: one AP with one or more Stations. The interface has three tabs: Equipment, Link and Tests.

Run the API as described in the [root README](../README.md), then run `npm ci` and `npm run dev` from `shared/frontend`. Open `http://localhost:5174`. Use `demo` to explore without hardware.

`workspace.mjs` selects the radio navigation and components. `frontend/RadioConnection.jsx` provides the radio access screen: select a discovered device or enter its existing IP, with troubleshooting available on demand. No factory IP is assumed. MAC preparation still uses the existing implementation.

Wi-Fi configuration and alignment come from `shared/frontend/src/features/wireless/`, also used by RouterBoards with Wi-Fi. Network and LoRa screens are not included in this entry.

Selecting a discovered device shows its identity, model, IP and MAC before login. Switching devices clears the previous password; editing the IP clears the selection. Discovery never replaces the entered address automatically. An unannounced IP does not prove that the device has no configured address.

After login, the link summary shows interfaces, AP/Station roles and remote peers, with shortcuts to configuration and communication tests. Missing registration data and stale readings are shown separately from an empty association table. Association alone does not confirm working traffic.

MAC preparation keeps credentials beside the network settings. If several computer adapters are available, choose the one connected to the radio before reviewing changes. Connection failures retain the original error and offer a relevant next check; ORION does not retry credentials or weaken TLS settings automatically.

Link setup has three steps: role, link settings and review. Start with the AP to reuse the settings for one or several Stations, or adjust only the connected device. Detected settings are retained; a missing management IP must be supplied. Preset profiles are not applied by the guided interface.

Each write requires a fresh review and explicit confirmation. The session advances only after reconnecting and checking the saved fields. A confirmed configuration still needs association and traffic tests; it is not proof of a working link.

If readback fails, use the read-only verification retry before considering another write. Stations in a session must retain its AP credentials; end the session to configure a different link.

In Tests, check association first, then test the other radio's actual IP and a device beyond it. Repeat for each Station. Disabled Wi-Fi, pending authorization and unavailable readings remain distinct; a ping response confirms reachability, not the route taken or the capacity of the wireless link.
