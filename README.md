# ORION Field

ORION Field is a local Windows assistant for configuring, monitoring, and validating MikroTik devices in the field.

> Configure. Monitor. Validate.

## Features

- LAN discovery through MNDP and temporary MAC preparation for devices without a usable IP;
- current RouterOS configuration loaded before any proposal;
- assisted setup for basic routing, LAN, Wi-Fi, AP/Station links, and supported LoRa protections;
- selectable radio workflows: a dedicated pair (default), one AP with multiple Stations, or a Station joining an existing AP;
- nearby AP discovery and verified Station BSSID locking on the classic `wireless` driver;
- live RouterOS data, negotiated radio rates, RX/TX traffic, and structural diagnostics;
- latency, loss, jitter, p95, p99, spike, and stability measurements;
- preview, explicit confirmation, and RouterOS backup before writes;
- sanitized diagnostic export with a technician-selected destination;
- offline demo profiles for training and interface validation.

ORION stores no technician accounts, inventory, installation history, or cloud data.

## Safety

- existing addresses and unrelated RouterOS rules are preserved whenever possible;
- existing WAN, LAN topology, and DNS stay protected until explicitly enabled for editing;
- API services are preserved so ORION does not disable its own access;
- MAC access is temporary and only prepares IPv4 API access;
- credentials remain in memory and are excluded from diagnostic exports.

Validate changes on recoverable lab equipment before production use.

## Requirements

- Windows 10 or Windows 11 x64;
- RouterOS API access with suitable permissions;
- local Ethernet access for discovery and MAC preparation.

RouterOS 7 is recommended. WinBox is optional and used only as a fallback. For remote management, prefer a VPN instead of exposing the standard RouterOS API.

## Demo mode

Enter a profile name in the IP field:

| Profile | Device |
|---|---|
| `demo` or `teste` | MikroTik radio |
| `demo-router` | configured generic router |
| `demo-novo` | router without a prepared network |
| `demo-wireless` | classic wireless Station with AP discovery/lock demo |

Demo mode never writes to real hardware.

## Development

Requirements: Node.js, Python 3.11+, Rust, and Visual Studio Build Tools 2022 with **Desktop development with C++**.

```powershell
# Backend
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
uvicorn app.main:app --reload

# Frontend, in another terminal
cd frontend
npm ci
npm run dev
```

The frontend uses `http://localhost:5174` and proxies FastAPI at `http://127.0.0.1:8000`.

Run the complete desktop application with:

```powershell
cd frontend
npm run desktop:dev
```

## Build and test

```powershell
# Backend tests
cd backend
.\.venv\Scripts\python.exe -m pytest

# Frontend validation
cd ..\frontend
npm test
npm run build
npm audit --audit-level=high

# Windows installer
npm run desktop:build
```

The NSIS installer is generated under `frontend/src-tauri/target/release/bundle/nsis`. Internal signed builds use `npm run desktop:build:signed`; see the installation guide before handling certificates.

## Architecture

`React + Vite → Tauri → FastAPI → RouterOS API`

The C++ Network Engine is restricted to advanced latency metrics. Configuration and RouterOS operations remain in JavaScript and Python.

## Documentation

- [Field manual](docs/manual-de-campo.md)
- [Compatibility and physical acceptance](docs/COMPATIBILITY.md)
- [Internal Windows installation](docs/instalacao-interna-windows.md)
- [V7.2 lab validation](docs/TESTE-DE-BANCADA-V7.2.md)
- [0.7.3 validation and release scope](docs/MVP-VALIDATION.md)
- [Network Engine](native/network-engine/README.md)

## Limitations

- direct management requires IPv4 API access after MAC preparation;
- backup restoration is manual;
- wireless frequencies depend on hardware, RouterOS, and local regulations;
- AP scans temporarily interrupt Wi-Fi; use Ethernet and confirm before scanning;
- BSSID lock uses the classic [wireless connect-list](https://manual.mikrotik.com/docs/cli-reference/interface/wireless/connect-list/); modern `wifi`/`wifiwave2` drivers are not offered an equivalent lock;
- VLAN-aware bridges, shared DHCP pools, and complex routing/NAT require the network administrator;
- LoRa features require RouterOS 7, the IoT package, and a compatible interface;
- physical validation remains required for target hardware.
