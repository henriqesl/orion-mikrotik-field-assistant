# ORION Network Engine

Native C++ component used by ORION Field to calculate reproducible metrics from real latency samples.

It calculates:

- packet loss and availability;
- average, minimum, and maximum latency;
- jitter, p95, and p99;
- latency spikes and range;
- standard deviation and stability score.

RSSI, noise, and SNR are not calculated by this engine. They are read directly from RouterOS when the device provides them.

## CLI

```powershell
orion-network-engine.exe analyze --sent 5 --samples "1,2,3,4,52"
```

The result is emitted as one JSON object on `stdout`. Invalid input is written to `stderr` and returns exit code `2`.

## Build and test

From the repository root:

```powershell
.\scripts\build-network-engine.ps1
```

Or directly with CMake:

```powershell
cmake -S native/network-engine -B native/network-engine/build -A x64
cmake --build native/network-engine/build --config Release
ctest --test-dir native/network-engine/build -C Release --output-on-failure
```

The engine is packaged as a Tauri sidecar. It does not contain RouterOS configuration or application UI logic.
