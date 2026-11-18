# ORION Radios

Radio setup: one AP with one or more Stations. The interface has three tabs: Equipment, Link and Tests.

Run the API as described in the [root README](../README.md), then run `npm ci` and `npm run dev` from `shared/frontend`. Open `http://localhost:5174`. Use `demo` to explore without hardware.

Navigation is defined in `workspace.mjs`; the implementation lives in `shared/`. Device access still uses the existing connection flow. Guided preparation is planned for the next stage.
