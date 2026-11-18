# ORION Field

ORION helps field technicians configure MikroTik radio links. The dedicated radio interface is being developed as a local web application, starting from the existing AP/Station workflow. The previous RouterBoard and LoRa tools remain available through a separate entry.

The application uses React and a local FastAPI backend communicating through the RouterOS API. The existing Tauri desktop shell is retained for later packaging. A small [C++ component](shared/native/network-engine/README.md) calculates latency statistics. No cloud service is required. This is an independent project, not affiliated with or certified by MikroTik.

## Run locally

Install Python 3.11+ and a Node.js version compatible with the project's locked Vite version. From the repository root, prepare and start the backend:

```powershell
cd shared/backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

Leave that terminal running. Open a second terminal at the repository root and start the frontend:

```powershell
cd shared/frontend
npm ci
npm run dev
```

Open `http://localhost:5174`. The radio interface is the default. The frontend forwards API requests to `http://127.0.0.1:8000`. To open the preserved RouterBoard interface instead, stop the frontend and run `npm run dev:routerboards` in the same directory. Both use the same port; run one at a time.

After setup, `start-orion.cmd` at the repository root builds and serves the radio interface at `http://127.0.0.1:8765`.

## Try the workflow

Enter `demo` or `teste` in the IP field to explore the radio workflow without hardware. Use `demo-router` for a configured router, `demo-novo` for an unprepared router, or `demo-wireless` for the classic-wireless scan and lock flow. These profiles do not write to real devices.

With a real MikroTik, ORION reads the existing configuration before proposing changes. You choose what to edit, review the differences and confirm the operation. A backup is saved on the device before writes. After reconnecting, ORION compares readable settings; association and traffic still need to be tested.

## Validate the build

Open another terminal at the repository root to run the automated tests and compile the frontend:

```powershell
cd shared/backend
.\.venv\Scripts\python.exe -m pytest
cd ..\frontend
npm test
npm run build
npm audit --audit-level=high
```

Automated tests do not replace a hardware trial. Consult the [validation status](docs/MVP-VALIDATION.md) and [compatibility record](docs/COMPATIBILITY.md) for the remaining physical checks.

As of November 18, 2026, the full npm audit still reports a transitive `picomatch` ReDoS advisory in the development toolchain after compatible updates. Keep development servers local; do not use `npm audit fix --force` without reviewing its proposed downgrades. Production dependencies can be checked separately with `npm audit --omit=dev`.

## Package for Windows

The desktop target is Windows 10/11 x64. Install Rust, Visual Studio Build Tools 2022 with **Desktop development with C++**, and CMake. From the `shared/frontend` directory used above, run:

```powershell
npm run desktop:build
```

The installer is written to `shared/frontend/src-tauri/target/release/bundle/nsis`. To run the desktop application during development instead, use `npm run desktop:dev`.

Company builds use `npm run desktop:build:signed` with private signing material kept outside this repository. Follow the [internal installation guide](docs/instalacao-interna-windows.md) when distributing them. Internal signing does not guarantee public trust or antivirus acceptance.

Installers and build outputs are generated locally, not stored in Git. Pulling main does not update an installed copy; rebuild and reinstall it.

## Use in the field

Connect by Ethernet and follow the [field manual](docs/manual-de-campo.md). Local configuration does not require internet. Discovery can help prepare temporary IPv4 access through MAC, but subsequent management uses the RouterOS API. Prefer a VPN for remote access and validated API-SSL; the MikroTik's API certificate is separate from the installer certificate.

Existing WAN, LAN and DNS remain protected until selected for editing. Leave advanced topology and custom rules to the network administrator. If an operation is interrupted, reconnect and read the device before repeating it; backup restoration is manual.

AP scans interrupt Wi-Fi temporarily. Classic `wireless` supports the implemented BSSID lock. Modern `wifi` uses link credentials and an associated-MAC check, not a lock. Confirm the intended AP and test communication before completing the job.

## Source layout

[radios/](radios/README.md) defines the focused radio workspace. [routerboards/](routerboards/README.md) preserves the previous workspace without expanding its scope. [shared/](shared/README.md) holds the reusable frontend, API, desktop shell and native metrics. Development commands live in `scripts/`, and guides in `docs/`. The older standalone [script generator](tools/mikrotik-generator.html) is kept in `tools/` for reference; it is not part of the app and loads its styling from external CDNs.

Dependencies, caches and build outputs can be recreated using the setup and build commands above. Keep `.git`, source files and any local signing material when cleaning the workspace.
