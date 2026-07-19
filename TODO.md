# Prioritized engineering backlog

## Next

- Implement an OpenCascade geometry service for STEP/IGES healing, tessellation,
  measurements, and unit confirmation.
- Add an A2 vortex-lattice solver with Trefftz-plane verification, then an A3
  panel adapter with published validation cases.
- Complete live MAVLink transport and versioned PX4/Gazebo model generators.
- Parse real OpenFOAM residuals, force coefficients, mesh quality, and field files
  into the result envelope; add ParaView-compatible field discovery.
- Add an artifact database and retention controls for large CFD/SITL jobs.

## Release qualification

- Sign and notarize universal macOS artifacts with organization credentials.
- Add Intel macOS and Apple Silicon release machines to the compatibility matrix.
- Run hardware-in-the-loop tests against selected flight controllers and document
  electrical timing, sensor, and actuator tolerances.
- Establish wind-tunnel and flight-test calibration data with uncertainty budgets.
- Commission an external security review before multi-user remote deployment.

## Performance

- Lazy-load the 3D and plotting workspaces to reduce the initial JavaScript bundle.
- Move long local sweeps to Web Workers and measure large-project memory use.
- Add geometry decimation/level-of-detail for multi-million-triangle assemblies.
