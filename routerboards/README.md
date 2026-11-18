# ORION RouterBoards

Basic network, Wi-Fi, LoRa and device diagnostics. This interface is maintained while development focuses on radios.

Start the API using the [root README](../README.md). From `shared/frontend`, run `npm run dev:routerboards` and open `http://localhost:5174`. Stop the radio frontend first; both use the same port. Use `demo-router` to explore without hardware.

Navigation is defined in `workspace.mjs`; the implementation lives in `shared/`. `npm run build:routerboards` writes to `shared/frontend/dist-routerboards`. The default build and desktop launcher use the radio interface.
