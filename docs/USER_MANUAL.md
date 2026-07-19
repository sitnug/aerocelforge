# User manual

## Start with Kestrel

Launch the native app with `npm run desktop`. On first run, choose **Start with
the example aircraft**. The example is designed to exercise every workspace; its
numbers are illustrative, not measured.

Aerocel Forge starts in **Simple** mode. The activity rail uses plain names: Home,
3D model, Parts, Weight, Power, Airflow, Fly, Transition, Route, Results, Reports,
and Settings. Turn on **Advanced** in the top bar or Settings to add detailed wind
tests (CFD), the PX4 autopilot simulator, design searches, and engineering checks.
Turning Advanced off hides these screens but does not remove their settings or
results. `Cmd+K` opens screen navigation.

The default **Bright** theme uses a light background, dark words, and high-contrast
buttons. **Cockpit** uses dark panels with green and amber details. Choose either
theme from the top bar or Settings. Small `i` controls explain unfamiliar terms in
plain language; hover, focus, or click them to open the help card. Theme and skill
level choices are saved on this computer and never change the aircraft model.

## Geometry and components

Use **3D model** and choose **Import model**, or use **File → Import model**.
Select the file type explicitly or keep **Choose automatically**, choose the size
units, and choose **One complete drone part** or **Whole drone model**. Then choose
one local file or drag it onto the drop zone. A whole-model STL keeps all of its
connected shapes together as one selectable object. Advanced mode also shows CFD
inclusion. The file extension must match the selected type.

Built-in 3D import supports ASCII/binary STL, OBJ, self-contained glTF/GLB, PLY,
and embedded-geometry DAE. Confirm the metre bounding box and source axes before
**Add to aircraft** is enabled. Imported geometry is shown in the viewport and
can be translated, rotated, non-uniformly scaled, reparented, retyped, or excluded
from CFD in the inspector. The untouched source is archived by SHA-256 and is
restored with the project at startup.

To edit a part, right-click it in the 3D view, the left navigator, or the Parts
table and choose **Edit part**. To remove a part, select it and press **Delete** or
**Backspace**, use the right-click menu, or use **Delete this part** in the editor.
Aerocel Forge shows attached children before deleting and automatically removes
linked joints and propulsion setup. It will not let a project lose its last part.

You can also click any part in the left navigator to go straight to its editor.
The **How this part works** section changes with the selected part. It provides
plain-language controls for motor thrust, power, current and KV; propeller size,
pitch, blades, and individual keys; battery configuration; wing, tail, movable
surface, and body dimensions; per-part air reaction; accessory power; and part
weight. A motor's **Maximum thrust** is the user-entered limit for
that motor-and-propeller unit and is used by the flight simulator. Use measured
thrust-stand data when available; the nearby propeller value is only an estimate.

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

Rapid Aero runs the built-in A1 attached-flow parabolic polar across an angle-of-
attack sweep. Lift, drag, pitching moment, span loading, stability estimates, and
glide envelope are derived from the current example inputs and can be exported as
CSV. A1 is useful for concept trades, not separated-flow or propeller/airframe
interaction validation.

The drag ledger separates surface profile drag, body/mesh pressure drag, panel
skin friction, induced drag, and explicit user-added drag. It also states the
wing reference area and equivalent drag area (`CdA`), because a coefficient
quoted using frontal area is not directly comparable. Use **Added real-world
drag** in drag counts only when supported by measurement or a documented
engineering method. Imported shape supplies an approximate panel buildup, but it
does not validate interference, transition, roughness, trim, cooling, or wave
drag. See
[AERODYNAMICS_MODEL.md](AERODYNAMICS_MODEL.md) for equations and the required
calibration workflow.

## Flight and transition

Open **Fly** to control the currently loaded vehicle in the interactive Flight
Lab. Choose a hover or cruise start, select Manual, Stabilize, Altitude hold, or
Return home, then choose **Controller** or **Keyboard**. Controller mode accepts
the Mode 2 on-screen sticks or a standard gamepad. In Keyboard mode, W moves a
real elevator/elevon/canard for nose-down, S moves it for nose-up, A/D moves real
aileron/elevon/flaperon parts, and Z/X moves a real rudder. If a matching movable
part is absent, that axis does nothing. Shift/Ctrl changes combined throttle,
Q/E changes motor tilt, and Space starts or pauses the fixed-step simulation.
Choose **Individual propellers** to give each propeller its own increase/decrease
keys and power setting. Powered Fly remains locked without a usable propeller
setup and charged battery; the separate glide test keeps all motors at zero.
Live telemetry includes
attitude, airspeed, altitude, wind-relative aerodynamic state, forces, power,
position, trail, and battery use.

Use the title-bar fullscreen button for the complete application. Within Flight,
**View height** adjusts the 3D stage and **Focus** gives the simulator the entire
application window; press Escape to leave Focus mode. The native window also
supports normal edge resizing and the macOS green window control.

The behavior editor accepts a bounded mission language with ALTITUDE, AIRSPEED,
HEADING, WAYPOINT, LAND, and FAILSAFE commands. Unknown or invalid commands
disable arming; arbitrary code is never executed. See
[FLIGHT_SIMULATOR.md](FLIGHT_SIMULATOR.md) for the complete controls, syntax,
limits, and validation boundary.

Flight uses quaternion nonlinear 6-DOF rigid-body dynamics. Interactive loads are
calculated at each enabled part from local wind, aircraft rotation, size,
orientation, position relative to the centre of gravity, stall/drag inputs, and
actual control-surface deflection. Imported meshes contribute triangle-derived
pressure panels. This is responsive reduced-order physics, not CFD or a calibrated
digital twin. Trim failure is an engineering result, not a UI error. Transition
uses independent tilt schedules, rotor-wing
interaction approximation, battery power, altitude loss, and failure checks. Run
the one-motor-out case to see an intentionally failed safety case.

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
