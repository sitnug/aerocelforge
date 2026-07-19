# Aerocel Forge

Aerocel Forge is a native engineering workspace for aircraft, UAV, eVTOL, and
tilt-rotor concept development. It combines geometry inspection, mass
properties, propulsion, rapid aerodynamics, nonlinear flight dynamics, VTOL
transition studies, uncertainty, optimization, reporting, and capability-gated
external solver workflows in one reproducible project format.

The application is intentionally honest about model limits. Every result carries
a source, fidelity level, input identity, quality grade, and warnings. External
CFD or SITL jobs are never replaced by synthetic results when a solver is absent.

## Quick start on macOS

Requirements: macOS 13+, Node.js 22+, npm 10+, Rust 1.77.2+, and Python 3.9+.
Xcode Command Line Tools are required for the native bundle.

```bash
./scripts/bootstrap-macos.sh
npm run desktop
```

For the browser-hosted development UI only:

```bash
npm run dev
```

The Kestrel tri-tilt example opens from the first-run screen. Its dimensions and
component values are explicitly marked as illustrative user-entered data.

To add geometry, open **Geometry** and choose **Import model**. Select a model
type (or auto-detect), confirm source units and semantic component type, then
choose one file or drag it onto the drop zone. Locally supported triangle formats
are inspected before **Add to assembly** becomes available; CAD and articulated
assembly formats remain explicitly gated on their named external adapters.

To fly the loaded vehicle, open **Fly**. The interactive Flight Lab provides
on-screen Mode 2 sticks, keyboard and standard gamepad control, hover and cruise
starts, stabilization/altitude/return-home modes, wind and autopilot targets,
battery and force telemetry, and a safe waypoint behavior language. See
[docs/FLIGHT_SIMULATOR.md](docs/FLIGHT_SIMULATOR.md) for controls, commands, and
the explicit physical-validation boundary.

## Verification

```bash
npm run check
npm run python:check
npm run python:lint
npm run python:typecheck
npm run rust:check
npm run rust:clippy
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
npm run desktop:build
```

## Repository map

- `apps/desktop`: React, Three.js, and Tauri 2 native application.
- `packages`: strict TypeScript engineering and data-model libraries.
- `services/scientific-orchestrator`: typed FastAPI process orchestrator.
- `examples/kestrel`: complete tri-tilt concept project.
- `solvers`: contracts and setup notes for external scientific tools.
- `infrastructure`: local Linux and remote execution templates.
- `docs`: user, developer, security, and adapter documentation.

Start with [MACOS_SETUP.md](MACOS_SETUP.md), then read
[docs/USER_MANUAL.md](docs/USER_MANUAL.md). The technical boundaries are in
[ARCHITECTURE.md](ARCHITECTURE.md), and validation status is recorded in
[VALIDATION.md](VALIDATION.md). The implementation-versus-qualification audit is
in [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).
The equations and real-world aerodynamic calibration boundary are documented in
[docs/AERODYNAMICS_MODEL.md](docs/AERODYNAMICS_MODEL.md).
Interactive flight controls and mission behavior are documented in
[docs/FLIGHT_SIMULATOR.md](docs/FLIGHT_SIMULATOR.md).

## Safety and scope

Aerocel Forge is an engineering analysis aid, not a certified design system.
Outputs require independent review, suitable verification, and experimental
validation before they influence fabrication or flight. It does not establish
airworthiness or replace compliance with applicable aviation rules.
