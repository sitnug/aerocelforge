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

Use Geometry to import local STL or OBJ meshes. Confirm source units before
accepting dimensions. The inspection panel reports bounds, area, signed/absolute
volume, boundary edges, non-manifold edges, and watertightness. STEP, IGES, and
VSP3 require their named external adapters; an unavailable capability is a hard
gate, not a lossy fallback.

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
