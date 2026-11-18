# ORION Network Engine

Small C++17 component used by ORION Field to calculate reproducible statistics from latency samples supplied by the backend. It does not send probes, measure throughput or configure devices.

## Build and test

On Windows, install Visual Studio C++ tools and CMake 3.24+. From the repository root, run:

```powershell
.\scripts\build-network-engine.ps1
```

The script compiles the engine, runs CTest and copies the executable into the desktop sidecar directory. If you only need a standalone build, use CMake instead:

```powershell
cmake -S native/network-engine -B native/network-engine/build -A x64
cmake --build native/network-engine/build --config Release
ctest --test-dir native/network-engine/build -C Release --output-on-failure
```

## Analyze samples

After building, run the executable from the repository root:

```powershell
.\native\network-engine\build\Release\orion-network-engine.exe analyze --sent 5 --samples "1,2,3,4,52"
```

Supply received latency samples in milliseconds, in collection order, and the total number of probes sent. The result is one JSON object on `stdout`. Invalid input produces an error on `stderr` and exit code `2`; unavailable measurements are `null`.

## Read the result

The output includes packet loss, availability, latency minimum/average/maximum, jitter, p95/p99, spikes, range, standard deviation and a stability score. Jitter is the mean absolute difference between consecutive received samples; percentiles use linear interpolation.

Availability describes the supplied probe results, not historical uptime. The stability score is an ORION heuristic, not a MikroTik rating or an RF alignment measurement. RSSI, noise and SNR come directly from RouterOS when available, not from this engine.

The engine is packaged as a Tauri sidecar. See the [main README](../../README.md) for application setup and the [acceptance guide](../../docs/COMPATIBILITY.md) for physical validation requirements.
