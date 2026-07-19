# Production-readiness audit

Audit date: 2026-07-19. This record separates a working vertical slice from a
production-qualified aerospace analysis system. Aerocel Forge is currently a
hardened engineering-development build; it is **not yet production-qualified for
flight, certification, or every function in the master specification**.

## Status vocabulary

- **Verified** — implemented here and exercised by automated or release checks.
- **Capability-gated** — the UI and typed adapter boundary exist, but a real
  external installation and verification case are required.
- **Partial** — a useful reduced-order workflow exists, but the full milestone is
  not implemented.
- **External qualification** — completion depends on credentials, target hardware,
  traceable data, or independent review outside this repository.

## Milestone audit

| Milestone                 | Status                              | What is available now                                                                                                                                                                                                                                                                                                             | Production boundary                                                                                                                                                                                                  |
| ------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Foundation             | Verified vertical slice             | Tauri 2/React workspace, strict versioned schema, SI internal units, atomic managed autosave, most-recent-project recovery, capability detection, persistent Bright/Cockpit themes, Simple/Advanced views, accessible plain-language help, resizable native window, explicit application fullscreen and simulator Focus mode      | Full create/open/duplicate project UI and cross-version migrations beyond 1.0.0 remain backlog                                                                                                                       |
| 2. Geometry               | Partial, hardened                   | Explicit format/unit/type selection, picker and drag/drop, local STL/OBJ/glTF/GLB/PLY/DAE parsing, topology/quality checks, source hashing/archive/restore, assembly parenting and transforms                                                                                                                                     | STEP/IGES/3MF/VSP3/URDF/SDF/DXF require adapters; self-intersection, minimum thickness, healing, mirroring, alignment, snapping, sections, arrays, and grouping are incomplete                                       |
| 3. Propulsion and joints  | Partial                             | P0/P1/P2 contracts and calculations, P3/P4 boundaries, motor placement in the example, tilt joints, thrust/gyro/slipstream/battery and failure models                                                                                                                                                                             | General attachment-point editor, all advanced joint types/dynamics, collision/clearance tooling, and blade-resolved CFD are incomplete                                                                               |
| 4. Rapid aerodynamics     | Partial                             | A1 attached-flow parabolic polar, atmosphere, stability estimates, polar/span/glide outputs, CSV export                                                                                                                                                                                                                           | Geometry-derived parasite buildup, A0 table editing, and full A2 VLM/A3 panel integrations are incomplete; separated and rotor-dominated regimes require higher fidelity                                             |
| 5. Flight dynamics        | Partial, interactive slice          | Native quaternion nonlinear 6-DOF, RK4, trim, deterministic sensors, wind/control contracts and logs; live current-vehicle visualization; Mode 2 pointer/keyboard/gamepad input; stabilization, target, return-home and safe waypoint-program controllers; wind, P2-point/battery-limited propulsion, contact and force telemetry | Live JSBSim/PX4 transport, terrain and full collision world, controller/actuator latency, ground effect, spin/stall and rotor-interference validation, transmitter calibration, and model calibration are incomplete |
| 6. VTOL transition        | Verified reduced-order slice        | Independent tilt schedules, interaction approximation, energy/altitude tracking, warnings, motor-out and jammed-tilt cases                                                                                                                                                                                                        | Hardware/controller timing and rotor-wake calibration require SITL/HIL and physical evidence                                                                                                                         |
| 7. CFD                    | Capability-gated                    | Typed OpenFOAM case manifest/stages, quality/GCI contracts, presets and honest unavailable states                                                                                                                                                                                                                                 | No live job launch, meshing, telemetry, residual/field ingestion, or restartable transfer is claimed without an installed adapter/backend                                                                            |
| 8. PX4/Gazebo             | Capability-gated                    | Actuator-map validation, mission/sensor contracts, setup documentation and unavailable states                                                                                                                                                                                                                                     | Live MAVLink, PX4 SITL, Gazebo world/model generation, ROS 2 bridge, and HIL are incomplete                                                                                                                          |
| 9. Optimization/reporting | Partial                             | Deterministic grid search/Pareto, Monte Carlo and stale-input contracts, CSV and sanitized HTML reports                                                                                                                                                                                                                           | Retained revision comparison, persisted result artifact database, larger optimizers, and native PDF rendering remain incomplete                                                                                      |
| 10. Hardening/release     | Partial plus external qualification | CSP, bounded untrusted imports, path-safe atomic native writes, source integrity checks, redacted diagnostics, TypeScript/Python/Rust gates, native bundle/DMG build                                                                                                                                                              | Developer ID signing/notarization, universal/Intel qualification, external security review, load testing, HIL, wind-tunnel and flight calibration require external resources                                         |

## Geometry import support matrix

| Source     | Current behavior                                                                |
| ---------- | ------------------------------------------------------------------------------- |
| STL        | Built-in ASCII/binary triangle import and inspection                            |
| OBJ        | Built-in polygon triangulation, including relative indices                      |
| glTF / GLB | Built-in self-contained scene import; external resource URLs are rejected       |
| PLY        | Built-in common ASCII/binary triangle import                                    |
| DAE        | Built-in embedded-geometry scene import; external asset references are rejected |
| DAT / CSV  | Built-in coordinate-section inspection only; not accepted as a 3D component     |
| STEP / STP | Hard-gated on an OpenCascade B-rep service                                      |
| IGES / IGS | Hard-gated on an OpenCascade B-rep/surface service                              |
| 3MF        | Hard-gated on an isolated archive adapter with decompression limits             |
| VSP3       | Hard-gated on OpenVSP to preserve parametric meaning                            |
| URDF       | Hard-gated on a robotics assembly and package resolver                          |
| SDF        | Hard-gated on a versioned Gazebo model adapter                                  |
| DXF        | Hard-gated on a section/layer adapter                                           |

The local import path accepts one source at a time so every component receives an
explicit semantic type, parent, unit decision, source identity, and geometry
health record. Repeating the workflow assembles a multi-file vehicle.

## Release gates before an engineering-production claim

1. Implement and validate the incomplete adapters and workflows above against
   published or traceable reference cases.
2. Add retained artifacts, migration fixtures, large-project/load tests, crash
   recovery tests, and supported-platform compatibility runs.
3. Sign and notarize release artifacts with organization credentials; commission
   dependency/licence and external security review.
4. Calibrate relevant physics against propeller-bench, component mass/inertia,
   wind-tunnel, HIL, ground, and flight data with uncertainty budgets.
5. Define the intended regulatory use, configuration control, review authority,
   and acceptance criteria. Passing software tests alone is not this evidence.

See [VALIDATION.md](VALIDATION.md) for the latest executed verification record and
[THIRD_PARTY.md](THIRD_PARTY.md) for dependency and adapter boundaries.
