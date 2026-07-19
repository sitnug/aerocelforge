# User manual

## Start with Kestrel

Launch the native app with `npm run desktop`. On first run, inspect the detected
capabilities and choose **Explore Kestrel example**. The example is designed to
exercise every workspace; its numbers are illustrative, not measured.

The activity rail follows an engineering workflow: Home, Geometry, Components,
Mass, Propulsion, Rapid Aero, CFD, Flight, Transition, PX4, Mission,
Optimization, Results, Validation, Reports, and Settings. `Cmd+K` opens workspace
navigation. Autosave status and selected result quality remain visible in the
bottom status bar.

## Geometry and components

Use Geometry and choose **Import model**. Select the model type explicitly or use
extension auto-detection, select source units, assign a semantic component type,
name, parent, and CFD inclusion, then either choose one local file or drag it onto
the drop zone. The file extension must match the selected type.

Built-in 3D import supports ASCII/binary STL, OBJ, self-contained glTF/GLB, PLY,
and embedded-geometry DAE. Confirm the metre bounding box and source axes before
**Add to assembly** is enabled. Imported geometry is shown in the viewport and
can be translated, rotated, non-uniformly scaled, reparented, retyped, or excluded
from CFD in the inspector. The untouched source is archived by SHA-256 and is
restored with the project at startup.

The inspection panel reports bounds, area, signed/absolute volume, connected
bodies, duplicate and degenerate faces, boundary and non-manifold edges, likely
inverted normals, triangle quality, thin-axis ratio, and watertightness. DAT and
CSV coordinate files are inspected as sections only. STEP/STP, IGES/IGS, 3MF,
VSP3, URDF, SDF, and DXF require their named external adapters; an unavailable
capability is a hard gate, not a lossy fallback. Self-intersection,
minimum-thickness, and healing remain geometry-service operations and are not
claimed by the local importer.

Use Components for the semantic assembly and independent joint limits. Body
coordinates are FRD: x forward, y right, z down. Each mass item needs a value,
location, and provenance. The Mass workspace combines CG and the full inertia
tensor using the parallel-axis theorem.

## Propulsion and aerodynamics

Propulsion exposes P0/P1/P2/P3 fidelity explicitly. The built-in Kestrel view uses
P2 BEMT with motor losses and battery voltage sag. Inspect convergence and model
warnings before trusting thrust, torque, or endurance. P3 requires real CFD.

Rapid Aero runs the built-in A1 analytical/component buildup across an angle-of-
attack sweep. Lift, drag, pitching moment, span loading, stability estimates, and
glide envelope are derived from the current example inputs and can be exported as
CSV. A1 is useful for concept trades, not separated-flow or propeller/airframe
interaction validation.

## Flight and transition

Flight uses quaternion nonlinear 6-DOF rigid-body dynamics. Trim failure is an
engineering result, not a UI error. Transition uses independent tilt schedules,
rotor-wing interaction approximation, battery power, altitude loss, and failure
checks. Run the one-motor-out case to see an intentionally failed safety case.

## CFD and SITL

The CFD workspace defines a real case plan and quality gates. **Launch solver** is
disabled until a compatible external capability is detected. A completed process
still needs `checkMesh`, residual/force convergence, domain sensitivity, and a
mesh study before its quality can be accepted.

PX4 and Mission validate actuator mapping and scenario inputs. Live SITL requires
version-compatible PX4, Gazebo, and MAVLink tooling. Never arm or fly hardware
from an unvalidated generated mapping.

## Results, validation, and reports

Results compares runs by input identity, source, fidelity, quality, and warnings.
Changing a source input makes an older result stale. Validation shows numerical
evidence separately from physical calibration evidence. Reports export sanitized
HTML with a reproducibility manifest and safety disclaimer; use macOS Print to
create a PDF when required.
