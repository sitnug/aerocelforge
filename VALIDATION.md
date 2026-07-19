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
- optimization/Pareto behavior and report escaping;
- geometry format detection, selected-format mismatch rejection, millimetre-to-
  metre conversion, STL/OBJ inspection, B-rep capability gates, untrusted glTF
  resource rejection, component hierarchy cycle rejection, and native source
  archive path/hash validation.

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

- `npm run check`: passed; 35 TypeScript tests, strict type checking, lint,
  formatting, and every workspace build passed.
- Python 3.9: compilation and 3 unit tests passed; strict mypy and Ruff passed.
- Scientific orchestrator: real loopback `/health` smoke test passed and correctly
  reported OpenFOAM, VSPAERO, and JSBSim unavailable rather than returning jobs.
- Rust 1.92: 3 native tests, Cargo format/check, and clippy with warnings denied
  passed.
- Native runtime: release application stayed healthy during a three-second launch
  smoke test.
- Packaging: arm64 `.app` and `.dmg` built; `hdiutil verify` reported a valid disk
  image. The local artifact is intentionally not Developer ID signed or notarized,
  because no organization signing credentials were provided.
- UI: first-run, Geometry, explicit format/unit/type import setup, drag/drop target,
  editable transforms, Settings, remote-host profile form, Rapid Aero, CFD
  unavailable state, motor-out failure, and 1040 × 700 responsive layout were
  exercised in the in-app browser. The browser control surface cannot attach a
  real local file; file parsing and commit preconditions are covered by unit tests
  and the native archive layer by Rust tests.
- Build note: Vite reports a 1.38 MB initial JavaScript chunk (378 kB gzip), driven
  primarily by the native 3D stack. Format loaders are split into separate dynamic
  chunks. Further 3D workspace lazy loading remains a measured performance task;
  it does not affect the local bundle's integrity.
