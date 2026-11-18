# Shared implementation

`frontend/` holds the React interface and Tauri shell, `backend/` the FastAPI service and RouterOS integration, and `native/` the C++ latency statistics component.

Both products share this code and API. Navigation belongs in `radios/` or `routerboards/`; hiding a panel does not disable its API endpoint.

See the [root README](../README.md) for setup, tests and packaging. Current development targets the local web application.
