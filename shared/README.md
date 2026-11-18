# Shared implementation

`frontend/` contains reusable React components, services, tests and the retained Tauri shell. Vite selects the radio or RouterBoard workspace at startup. `backend/` contains the FastAPI service, RouterOS integration and Python tests. `native/` contains the existing C++ statistics component.

Keep device access, configuration safeguards and reusable UI here. Product navigation belongs in `radios/` or `routerboards/`. These are separate frontend entry modes, not separate backends or security boundaries; hiding a panel does not disable its API endpoint.

Use the setup and test commands in the [root README](../README.md). The browser workflow is the current development target; no new desktop installer is produced by the separation.
