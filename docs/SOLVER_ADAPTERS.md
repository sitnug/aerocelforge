# Solver adapter contract

An adapter converts validated engineering input into an immutable case, a fixed
sequence of command specifications, telemetry, and a result manifest.

## Required lifecycle

1. `capability`: discover executable/version/platform and explain absence.
2. `validate`: reject unsupported physics, mappings, resources, and unsafe paths.
3. `build`: create a new case directory plus input hash and solver manifest.
4. `commands`: emit executable and argument arrays; never concatenate shell text.
5. `run`: capture timestamps, stdout/stderr, exit status, environment identity,
   cancellation, and remote scheduler identity.
6. `parse`: retain raw evidence and map only known output fields with units.
7. `grade`: assess convergence, mesh/domain studies, warnings, and uncertainty.

The current TypeScript OpenFOAM adapter constructs a wind-tunnel stage plan. The
Python service runs `checkMesh`, VSPAERO, or JSBSim only when the fixed executable
is detected and the named managed case already exists. It deliberately reports
`progressFraction: null`; solver iterations rarely predict wall-clock completion.

## OpenFOAM minimum evidence

- exact distribution/version and solver executable;
- mesh cells, non-orthogonality, skewness, negative volume, and patch summary;
- boundary/domain dimensions and ground-plane choice;
- turbulence and numerical schemes;
- residual history plus force/moment history;
- mass conservation and stop reason;
- at least three systematically refined meshes for GCI when claiming mesh
  independence;
- raw logs and field/result hashes.

## PX4/Gazebo minimum evidence

- exact PX4 commit/release and Gazebo release pairing;
- complete actuator order, direction, limits, neutral, and fail-safe values;
- airframe/model hashes and generated parameter diff;
- sensor rate, noise, bias, delay, frame, and deterministic seed;
- mission and environment definition;
- ULog/MAVLink logs and simulator output; and
- explicit separation between SIL/SITL/HITL and flight evidence.
