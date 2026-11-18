# ORION RouterBoards

Basic network, Wi-Fi, LoRa and device diagnostics. This interface is maintained while development focuses on radios.

Start the API using the [root README](../README.md). From `shared/frontend`, run `npm run dev:routerboards` and open `http://localhost:5174`. Stop the radio frontend first; both use the same port. Use `demo-router` to explore without hardware.

`frontend/` contains the basic network and LoRa screens and network form logic. `workspace.mjs` combines them with shared Wi-Fi configuration and diagnostics. Backend workflows remain in `shared/backend/app/features/routerboards/`, within the common Python package. LoRa is kept here for compatibility, not treated as a feature of every RouterBoard.

`npm run build:routerboards` writes to `shared/frontend/dist-routerboards`. The default build and desktop launcher use the radio interface.
