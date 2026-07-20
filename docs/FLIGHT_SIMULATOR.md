# Interactive Flight Lab

The Flight Lab flies the vehicle currently loaded in Aerocel Forge. It uses the
project's mass, full inertia tensor, centre of gravity, individually configured
air surfaces, imported mesh panels, propulsion units, battery definition, and
visible assembly in a deterministic 60 Hz nonlinear six-degree-of-freedom
simulation. The display converts the canonical FRD body and NED world frames
only at the Three.js boundary.

## Start and control a flight

1. Open **Fly** in the activity rail.
2. Choose **Hover start** or **Cruise start**, then select a flight mode.
3. Use **Fly**, **Pause**, and **Reset** to control the deterministic run. The
   1x, 2x, and 4x controls change simulated time, not the fixed integration step.
4. Choose **Controller** or **Keyboard**. Controller mode accepts the two
   on-screen Mode 2 sticks or a standard connected gamepad. Keyboard mode accepts
   only the keyboard flight keys, so a connected gamepad cannot overwrite them.

Powered **Fly** needs a connected motor/propeller unit with positive configured
thrust and a charged battery. Without it, the main action becomes **Start glide**.
The glide starts with forward speed and every propeller at zero. Manual surface
controls and wind still work. Stabilize, Altitude Hold, Return Home, powered
targets, propeller controls, and Hover start are disabled until usable propulsion
is fitted.

Use **View height** to resize the 3D stage from 360 to 800 pixels. The selected
height is retained locally. **Focus** makes the simulator fill the application
window and Escape returns to the full engineering workspace. The title-bar
fullscreen button separately toggles the whole native window or browser view.
The native macOS window can also be resized normally and has a supported minimum
size of 1040 by 700 pixels.

The left stick asks for rudder/yaw and throttle. The right stick asks for bank
and pitch. These channels do not create invisible moments: pitch needs an
elevator, elevon, or movable canard; bank needs ailerons, elevons, or flaperons;
and yaw needs a rudder. In hover, a physically placed multi-motor setup may also
turn through differential thrust. Releasing a pointer recenters yaw, roll, and
pitch while retaining throttle, as a Mode 2 transmitter does. Motor tilt and
flaps are independent channels.

Keyboard controls are W for elevator nose-down, S for elevator nose-up, A for
left aileron bank, D for right aileron bank, Z/X for rudder, Shift for more
combined throttle, Ctrl for less combined throttle, Q/E for motor tilt, and
Space for run/pause. Hold Shift or Ctrl for a smooth throttle change. The live
readout shows pitch, bank, rudder, and throttle, and pressed keys light up. A
standard gamepad maps axes 0/1 to yaw/throttle and axes 2/3 to roll/pitch with a
small center deadband. Controller axis numbering varies by device and operating
system, so verify the live channel readouts before relying on a physical
transmitter or USB adapter.

Choose **Aircraft controls** for one combined throttle. Choose **Individual
propellers** to expose every real propulsion unit. Each row has independent
power, +/− buttons, an increase key, and a decrease key. Click a key field and
press an unused key to save it on that propeller part. Duplicate bindings and
keys reserved for aircraft controls are rejected. The example uses 1/4, 2/5, and
3/6 for its three propellers. Individual mode is manual and uses each propeller's
position, axis, size, rotation direction, and thrust limit when calculating force
and torque.

## Flight modes

- **Manual** applies normalized pilot channels directly.
- **Stabilize** converts roll and pitch stick positions into bounded attitude
  targets and damps angular rates.
- **Altitude hold** closes the loop on altitude, airspeed, and heading targets.
- **Return home** flies toward the NED origin, slows inside the home radius, and
  commands a landing profile.
- **Program** follows the compiled mission behavior and its failsafe choice.

Only **Manual** is available during an unpowered glide. This prevents an
automatic mode from asking missing motors to correct altitude or attitude.

The autopilot target panel changes altitude, airspeed, heading, north wind, east
wind, and the Advanced-mode upward/downward wind while the simulation is paused
or running. At 10% battery, every
non-manual mode automatically uses the mission's RETURN_HOME or LAND failsafe.

## Safe behavior programs

Programs are a bounded declarative language, not JavaScript or shell code. Blank
lines and text after `#` are ignored. Supported commands are:

```text
ALTITUDE 40
AIRSPEED 20
HEADING 0
WAYPOINT 120 0 40
WAYPOINT 120 100 45
LAND
FAILSAFE RETURN_HOME
```

Altitude is metres, airspeed is metres per second, heading is degrees, and
waypoint coordinates are north/east/altitude in metres. Limits are 0–5,000 m
altitude, 0–100 m/s airspeed, 0–360 degrees heading, ±100 km horizontal waypoint
coordinates, and 50 waypoints. Unknown commands and out-of-range values produce
line-specific diagnostics and disable **Load & arm**. The editor is stored
locally, revalidated at startup, and only a valid parsed structure reaches the
controller.

## Physics and evidence boundary

The simulation integrates quaternion attitude, body velocity, angular rates,
and NED position with the tested flight-dynamics core. For every enabled wing,
tail, aileron, elevator, rudder, flap, and brake it calculates local air velocity
from aircraft motion, wind, and angular rate. It then uses that part's actual
position relative to the centre of gravity, orientation, area, chord, span,
lift slope, zero-lift angle, stall angle, lift limit, and drag inputs. A control
command changes only matching movable surfaces. Its force creates a moment with
`r × F`; no fixed roll, pitch, or yaw moment is added for a key press.

Non-lifting procedural bodies use six oriented bounding-box pressure faces.
Every imported aerodynamic mesh uses a bounded set of triangle-derived surface
panels, even when the part is not named as a wing or given an airfoil. Triangle
scale, area, normal, centroid, component rotation, component position, local wind,
and aircraft angular rate change lift, drag, side force, and moment. Open surfaces
react from either side. Closed surfaces use paired-face scaling plus windward
pressure. Imported ailerons, elevators, rudders, flaps, elevons, and flaperons
rotate their panel normals when commanded. A missing mesh asset falls back to
bounding-box panels. The advanced live table shows the strongest local pressure,
lift, and drag loads by part.

Each propeller produces thrust at its own position and along its configured axis.
The model includes offset moment and opposite CW/CCW reaction torque, shared
tilt, battery/power limits, energy use, gravity, ground contact, and hard-impact
detection. If the selected propulsion setup cannot produce vehicle weight, the
UI reports that hover is not sustainable instead of fabricating extra thrust.

The live panel model is quasi-steady and geometry-responsive; it is not CFD and
cannot infer exact real-world coefficients from an STL. It does not require an
airfoil identity, but that does not make it a Navier–Stokes solution. Stall/spin history,
boundary layers, Reynolds-dependent separation, rotor/airframe interference,
motor and actuator dynamics, terrain, ground effect, controller latency,
multidimensional coefficient tables, and hardware timing are not calibrated.
Before real-flight decisions, identify coefficients from traceable data, use the
OpenVSP/VSPAERO or OpenFOAM capability path where appropriate, validate against
wind-tunnel and flight measurements, and use version-matched JSBSim/PX4 SITL and
HIL.
