# Engineering decisions

## D-001 — Tauri 2 rather than Electron

Status: accepted. The native host remains small, uses the platform webview, and
lets Rust enforce filesystem and process boundaries. The UI remains standard
React/TypeScript.

## D-002 — SI internally; conversions only at boundaries

Status: accepted. Model functions take named SI fields. The unit package rejects
cross-dimension conversions. Display preferences never change stored physics.

## D-003 — FRD/NED are canonical

Status: accepted. Vehicle data use forward-right-down and dynamics use
north-east-down. Rendering conversions are explicit and tested.

## D-004 — Result quality is not inferred from solver name

Status: accepted. Fidelity, provenance, convergence, uncertainty, warnings, and
input identity are separate fields. Missing evidence lowers the grade.

## D-005 — No arbitrary shell bridge

Status: accepted. Adapters own executable/argument arrays. Tauri exposes only
specific commands. The Python runner validates case paths and has cancellation.

## D-006 — External solvers stay external

Status: accepted. OpenFOAM, SU2, OpenVSP/VSPAERO, JSBSim, PX4, and Gazebo have
independent release and licensing lifecycles. The app detects them and explains
setup; it does not bundle or pretend to run them.

## D-007 — Local geometric subset, OCC for B-rep

Status: accepted. STL and OBJ are parsed locally. STEP/IGES require a real
OpenCascade-backed service so B-rep fidelity is not lost through a fake parser.

## D-008 — HTML is the canonical report artifact

Status: accepted. It is inspectable, portable, and preserves the manifest. PDF is
created through a controlled print/export step until a renderer is selected.

## D-009 — Deterministic examples and tests

Status: accepted. Example values are illustrative and labeled. Randomized models
use explicit seeds so regressions are reproducible.
