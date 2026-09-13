# ORION Field

A local Windows assistant for MikroTik field configuration and diagnostics. Built for technicians, with **a pair of radios as the primary workflow**.

Independent project; not affiliated with or certified by MikroTik.

## What it does

- Configure a radio pair, one AP with multiple Stations, or a Station joining an existing AP.
- Discover local devices and prepare temporary IPv4 API access through MAC when needed.
- Load existing Wi-Fi, basic network and supported LoRa protection settings before editing.
- Preview changes, create a RouterOS backup, and compare readable radio/network settings after reconnecting.
- Display RouterOS signals, negotiated rates, actual RX/TX traffic and latency metrics.
- Export sanitized diagnostics to a chosen destination; use offline demo profiles without hardware.

`React + Vite → Tauri → FastAPI → RouterOS API`

The C++ sidecar calculates latency statistics only. No cloud, inventory or technician accounts.

## Use and limitations

Target: **Windows 10/11 x64** with RouterOS API access. Local Ethernet is required for LAN discovery and MAC preparation; internet is not required for local configuration.

- Existing WAN, LAN and DNS stay protected until selected for editing. Backups are stored on the MikroTik; restoration is manual.
- AP scanning temporarily interrupts Wi-Fi. Use Ethernet and confirm before scanning.
- BSSID lock is implemented for classic `wireless`. With modern `wifi`, use dedicated link credentials and verify the associated AP MAC; this is not a lock.
- Prefer a VPN for remote access and validated API-SSL. The MikroTik API certificate is separate from the BIONIC installer certificate.
- Advanced topology, shared pools and custom rules remain administrator work. Saved settings do not prove RF association or traffic flow.

See [compatibility and physical acceptance](docs/COMPATIBILITY.md) before production use. The previously generated **0.7.3 installer predates the latest source refinements**; merging or pulling main does not update an installed copy.

## Demo

Enter `demo` or `teste` for a radio, `demo-router` for a configured router, `demo-novo` for an unprepared router, or `demo-wireless` for classic-wireless scan/lock demonstrations. Demo mode never writes to hardware.

## Development

Use Node.js compatible with the locked Vite version and Python 3.11+. Desktop builds also require Rust, Visual Studio Build Tools 2022 (**Desktop development with C++**) and CMake.

```powershell
# From the repository root: backend
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
uvicorn app.main:app --reload

# From the repository root, in another terminal: frontend
cd frontend
npm ci
npm run dev
```

Frontend: `http://localhost:5174`; API proxy: `http://127.0.0.1:8000`. From `frontend`, run `npm run desktop:dev` for the desktop application.

## Test and build

```powershell
# From the repository root
cd backend
.\.venv\Scripts\python.exe -m pytest
cd ..\frontend
npm test
npm run build
npm audit --audit-level=high
npm run desktop:build
```

Installers are generated under `frontend/src-tauri/target/release/bundle/nsis`. Internal signed builds use `npm run desktop:build:signed` and require the company's private signing material, which is not included in this repository. Internal signing does not guarantee public trust or antivirus acceptance.

## Guides

- [Field manual](docs/manual-de-campo.md)
- [Compatibility and acceptance](docs/COMPATIBILITY.md)
- [Validation status](docs/MVP-VALIDATION.md)
- [Internal Windows installation](docs/instalacao-interna-windows.md)
- [Native metrics engine](native/network-engine/README.md)
