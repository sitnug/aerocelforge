# Roadmap and milestone record

This file records the integrated implementation across all ten milestones. A
checked item means a runnable, tested vertical slice exists in this repository;
it does not imply certification or parity with a dedicated commercial tool.

## 1. Foundation

- [x] npm monorepo, strict TypeScript, formatting, linting, tests, and CI.
- [x] Tauri 2 macOS host with managed, atomic project persistence.
- [x] interactive Three.js vehicle viewport and engineering workspace shell.
- [x] versioned Zod project schema, migration entry point, units, and frames.

## 2. Geometry

- [x] explicit model-type picker plus file picker and drag-and-drop import.
- [x] local ASCII/binary STL, OBJ, self-contained glTF/GLB, PLY, and embedded DAE
      parsing with scene transforms and bounded topology inspection.
- [x] unit-to-metre conversion, dimension confirmation, SHA-256 identity, untouched
      source archiving, startup restoration, and semantic assembly assignment.
- [x] editable component parent, CFD inclusion, translation, rotation, and
      non-uniform scale after import.
- [x] watertightness, boundary/non-manifold and duplicate/degenerate faces,
      connected bodies, normals, triangle quality, thin-axis, area, volume, and
      bounds checks.
- [x] DAT and CSV coordinate sections are inspected without pretending they are
      volumetric components.
- [x] STEP/STP, IGES/IGS, 3MF, VSP3, URDF, SDF, and DXF are explicitly routed to
      named external adapters; they are never flattened or mislabeled as local.
- [ ] isolated self-intersection and minimum-thickness analysis, auditable healing,
      mirroring/alignment/snapping/arrays, and production external format adapters.

## 3. Propulsion and joints

- [x] motor/propeller placement, independent tilt joints, thrust vectors, and
      slipstream visualization.
- [x] P0 first-order thrust, P1 manufacturer interpolation, P2 iterative BEMT,
      motor efficiency/losses, battery sag, and gyroscopic moment models.
- [x] P3 is represented by the external CFD adapter and cannot run without it.

## 4. Rapid aerodynamics

- [x] ISA atmosphere, airfoil DAT parsing, transparent A1 parabolic polar,
      induced drag, span loading, stability estimates, and glide envelope.
- [x] plot and CSV result exploration.
- [ ] full A2 VLM and A3 panel solvers; adapters remain the intended boundary.

## 5. Flight dynamics

- [x] quaternion nonlinear 6-DOF rigid body dynamics with full inertia tensor,
      RK4 integration, frame transforms, trim, deterministic sensor noise, and logs.
- [x] wind/control input contracts and current-vehicle real-time visualization.
- [x] interactive Mode 2 pointer/keyboard/gamepad control, hover/cruise starts,
      stabilization, altitude/heading/airspeed targets, return-home, battery and
      ground-contact state, and bounded waypoint behavior programs.
- [ ] calibrated multidimensional coefficient/control-derivative data, complete
      stall/spin/ground-effect/terrain models, and hardware controller timing.

## 6. VTOL transition

- [x] independent motor schedules, rotor-wing interaction approximation,
      altitude/energy tracking, quality warnings, and motor-out cases.
- [x] failure state and ground-contact detection with plots.

## 7. CFD

- [x] typed OpenFOAM wind-tunnel case, domain/mesh stage plan, adapter-owned
      command arrays, telemetry contract, cancellation, and convergence quality/GCI.
- [x] local-Linux and remote-Linux capability gates.
- [ ] external installation is intentionally not bundled; mesh and solver output
      only exist after a real OpenFOAM run.

## 8. PX4 and Gazebo

- [x] SITL actuator-map validation, deterministic sensor model, mission workspace,
      capability checks, and adapter documentation.
- [ ] live MAVLink/Gazebo execution requires compatible external installations.

## 9. Optimization and reporting

- [x] deterministic grid search, Pareto extraction, Monte Carlo summary,
      comparisons, stale-input detection, HTML report, and CSV export.
- [x] reproducibility manifest and airworthiness disclaimer.
- [ ] native PDF conversion uses the operating system print workflow until a
      separately licensed renderer is selected.

## 10. Hardening

- [x] macOS bundle configuration, CSP, path-safe native commands, autosave,
      diagnostics redaction, first-run capability scan, and recovery-oriented writes.
- [x] Python, Rust, and TypeScript quality gates plus CI templates.
- [x] local Linux and SSH/Slurm deployment guidance.
- [ ] code signing, notarization, and hardware-in-the-loop release qualification
      require organization credentials and target hardware.

The next engineering priorities are tracked in [TODO.md](TODO.md).
The complete readiness boundary is recorded in
[PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).
