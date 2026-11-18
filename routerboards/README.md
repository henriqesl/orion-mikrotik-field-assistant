# ORION RouterBoards

This entry preserves the previous device, basic network, Wi-Fi, LoRa and test workflows. New RouterBoard features are deferred while the radio product is developed.

Start the shared API using the [root README](../README.md). From `shared/frontend`, run `npm run dev:routerboards` and open `http://localhost:5174`. Stop the radio frontend first: both entries deliberately use the same development port. Use `demo-router` to explore without hardware.

`workspace.mjs` defines this workspace. The implementation remains in `shared/` so fixes do not need to be copied between products. For a separate web artifact, run `npm run build:routerboards`; its output is `shared/frontend/dist-routerboards`. The regular build and desktop launcher continue to select radios.
