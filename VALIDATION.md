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
- explicit aerodynamic drag-term summation, added-drag propagation, symmetric
  stall margins, exact glide-angle sink rate, analytical parabolic-polar best
  `L/D`, and rejection of nonphysical glide inputs.
- interactive flight-program parsing and arbitrary-code rejection, fixed-step
  hover repeatability, manual attitude response, altitude/program following,
  hard-impact ground contact, and mirrored Kestrel wing geometry invariants;
- per-part aerodynamic model derivation, independent surface size/position,
  triangle-panel scale/normal handling, real aileron-only roll authority, zero
  invented roll without a matching surface, individual-propeller offset moments,
  pressure-panel area scaling, custom propeller-key validation, and independent
  per-part coefficient persistence.
- blank-project schema support, portable unique file naming, retired-sample
  filtering, whole-aircraft import defaults, and deletion back to an empty file.
- normal replace-on-type numeric editing, decimal/comma parsing and range checks;
  basic-part schema validation, lone-propeller zero-thrust behavior, automatic
  motor/propeller pairing, and linked battery cleanup after part deletion.
- rapid analysis without a battery for unpowered aircraft, manual zero-thrust
  glide startup, and geometry-driven surface response with no invented control
  axis.

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

## Regression fixture status

Kestrel remains an automated-test fixture and is not offered in the app. It is
not measured aircraft data. It
exercises 19 components, including left/right ailerons, an elevator, a rudder,
two flaps, three independent tilt propulsion units, mass/inertia, A1 rapid
aerodynamics, per-part interactive air loads, P2 propulsion, battery voltage sag,
slipstream, transition, motor-out failure, optimization, and reporting. Inputs
are labeled user-entered and warnings are retained in exported reports.

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

## Build record — 2026-07-20, macOS 15.7.3 arm64

- `npm run check`: passed; 91 TypeScript tests, strict type checking, lint,
  formatting, and every workspace build passed.
- Python 3.9: compilation and 3 unit tests passed; strict mypy and Ruff passed.
- Scientific orchestrator: real loopback `/health` smoke test passed and correctly
  reported OpenFOAM, VSPAERO, and JSBSim unavailable rather than returning jobs.
- Rust 1.92: 3 native tests, Cargo format/check, and clippy with warnings denied
  passed.
- Native runtime: release application stayed healthy during a three-second launch
  smoke test.
- Packaging: arm64 `.app` and `.dmg` built; strict `codesign` verification and
  `hdiutil verify` passed. The local artifact has a sealed ad-hoc signature, but is
  intentionally not Developer ID signed or notarized because no organization
  signing credentials were provided.
- UI: first-run, Geometry, explicit format/unit/type import setup, drag/drop target,
  editable transforms, Settings, remote-host profile form, Rapid Aero, CFD
  unavailable state, motor-out failure, Flight Lab hover and autonomous program
  execution, invalid behavior rejection, corrected mirrored example geometry,
  application fullscreen, simulator Focus mode, adjustable stage controls,
  powered-flight precheck, fitted-surface axis checks, separate propeller power,
  custom propeller key capture, disabled automatic modes during direct-motor
  control, manual motor-off glide, propulsion-gated automatic modes, basic-part
  library, direct 3D move/turn handles, normal numeric replacement, hover/focus
  help with non-pinning clicks, the 1040-by-700 layout, and per-part live
  pressure/lift/drag table were exercised in the in-app browser. The browser
  control surface cannot attach a real local file or physical gamepad; file
  parsing and commit preconditions are covered by unit tests and the native
  archive layer by Rust tests. A real transmitter/gamepad compatibility matrix
  remains release-qualification evidence.
- Build note: Vite reports a 1.54 MB initial JavaScript chunk (423 kB gzip), driven
  primarily by the native 3D stack. Format loaders are split into separate dynamic
  chunks. Further 3D workspace lazy loading remains a measured performance task;
  it does not affect the local bundle's integrity.
