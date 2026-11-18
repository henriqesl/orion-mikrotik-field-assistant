# Shared implementation

`frontend/` holds the application shell, connection screen, device summary, diagnostics and Tauri integration. Its `src/features/wireless/` module provides Wi-Fi configuration, AP selection, alignment and readback checks for both products. Styles, API access and device identity checks are shared too.

Each product's `workspace.mjs` supplies its navigation and components. Basic network and LoRa screens live in `routerboards/frontend/`; the shared shell does not import them. Radio builds do not include those screens.

`backend/app/services/` contains device access, discovery, diagnostics and write safeguards. Configuration workflows live in `backend/app/features/wireless/` and `backend/app/features/routerboards/`. Bridge helpers are shared in `services/topology.py`, so network and LoRa workflows do not depend on radio configuration.

The backend stays in one Python package to keep the local server and desktop packaging consistent. Both products use the same API; hiding a panel is not an access-control boundary. `native/` contains the C++ latency statistics component, not radio configuration logic.

See the [root README](../README.md) for setup, tests and packaging. Current development targets the local web application.
