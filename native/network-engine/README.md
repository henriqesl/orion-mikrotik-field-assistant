# ORION Network Engine

Small C++17 component used by ORION Field to calculate reproducible statistics from latency samples supplied by the backend. It does not send probes, measure throughput or configure devices.

It calculates:

- packet loss and availability;
- average, minimum, and maximum latency;
- jitter, p95, and p99;
- latency spikes and range;
- standard deviation and stability score.

RSSI, noise, and SNR are not calculated by this engine. They are read directly from RouterOS when the device provides them.

Jitter is the mean absolute difference between consecutive received samples; p95/p99 use linear interpolation. Availability is the fraction of sent probes that returned samples, not a historical uptime measurement. The stability score is an ORION heuristic, not a MikroTik rating or an RF alignment measurement.

## CLI

```powershell
orion-network-engine.exe analyze --sent 5 --samples "1,2,3,4,52"
```

The result is emitted as one JSON object on `stdout`; samples are milliseconds, in collection order. Invalid input is written to `stderr` and returns exit code `2`. Missing measurements are represented as `null` rather than fabricated values.

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

The script builds, runs CTest and copies the executable into the desktop sidecar directory. Windows builds require Visual Studio C++ tools and CMake 3.24+.

The engine is packaged as a Tauri sidecar. See the [main README](../../README.md) for application setup and the [acceptance guide](../../docs/COMPATIBILITY.md) for physical validation requirements.
