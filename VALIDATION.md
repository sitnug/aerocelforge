# Validation record

Validation distinguishes software correctness, numerical verification, and
physical validation. Passing unit tests does not establish aerodynamic truth.

## Automated software verification

The repository covers:

- schema rejection and migration behavior;
- unit dimensionality and NED/ENU plus FRD/FLU round trips;
- mesh volume/topology and combined mass/inertia;
- propulsion interpolation, BEMT convergence, battery sag, and slipstream;
- atmosphere, coefficient buildup, span loading, and glide calculations;
- quaternion normalization, 6-DOF stepping, trim, transition, and sensors;
- quality grading, GCI, Monte Carlo repeatability, and stale results;
- case-path safety, OpenFOAM command shape, PX4 mapping, and remote profiles;
- optimization/Pareto behavior and report escaping.

Run the full matrix with the commands in [README.md](README.md). CI repeats the
TypeScript, Python, and Rust gates on clean runners.

## Numerical verification

- Iterative models return convergence state and iteration count.
- BEMT reports non-convergence rather than substituting a value.
- Grid-convergence analysis exposes observed order, extrapolated value, and GCI.
- 6-DOF attitude quaternions are renormalized after integration.
- Transition simulation detects invalid schedules, force margins, and ground
  contact; the Kestrel motor-out demonstration is expected to be a failed case.
- Monte Carlo results require an explicit seed and report distribution statistics.

## Reference project status

Kestrel is an illustrative regression fixture, not measured aircraft data. It
exercises 13 components, three independent tilt propulsion units, mass/inertia,
A1 rapid aerodynamics, P2 propulsion, battery voltage sag, slipstream, transition,
motor-out failure, optimization, and reporting. Inputs are labeled user-entered
and warnings are retained in exported reports.

## Physical validation still required

Before design or flight decisions, calibrate against traceable measurements:

- propeller thrust/torque maps across RPM, inflow, and voltage;
- motor/controller efficiency and thermal limits;
- battery OCV, resistance, capacity, temperature, and aging;
- component mass, CG, and inertia measurements;
- wind-tunnel or flight-derived aerodynamic coefficients;
- actuator dynamics, sensor noise/bias, and PX4 timing;
- CFD mesh independence, turbulence sensitivity, and boundary-domain sensitivity.

No result should receive a validated grade solely because a solver completed.

## Build record — 2026-07-19, macOS 15.7.3 arm64

- `npm run check`: passed; 26 TypeScript tests, strict type checking, lint,
  formatting, and every workspace build passed.
- Python 3.9: compilation and 3 unit tests passed; strict mypy and Ruff passed.
- Scientific orchestrator: real loopback `/health` smoke test passed and correctly
  reported OpenFOAM, VSPAERO, and JSBSim unavailable rather than returning jobs.
- Rust 1.92: 2 native tests, Cargo check, and clippy with warnings denied passed.
- Native runtime: release application stayed healthy during a three-second launch
  smoke test.
- Packaging: arm64 `.app` and `.dmg` built; `hdiutil verify` reported a valid disk
  image. The local artifact is intentionally not Developer ID signed or notarized,
  because no organization signing credentials were provided.
- UI: first-run, Geometry, Rapid Aero, CFD unavailable state, motor-out failure,
  and 1040 × 700 responsive layout were exercised in the in-app browser. No
  application errors were observed; an upstream React Three Fiber use of the
  deprecated Three.js `Clock` API remained a non-failing development warning.
- Build note: Vite reports a 1.34 MB initial JavaScript chunk (368 kB gzip), driven
  primarily by the native 3D stack. This is recorded as a lazy-loading performance
  task; it does not affect the local bundle's integrity.
