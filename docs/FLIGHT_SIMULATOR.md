# Interactive Flight Lab

The Flight Lab flies the vehicle currently loaded in Aerocel Forge. It uses the
project's mass, full inertia tensor, reference wing dimensions, A1 aerodynamic
inputs, current aggregate P2 propeller point, battery definition, and visible
assembly in a deterministic 60 Hz
nonlinear six-degree-of-freedom simulation. The display converts the canonical
FRD body and NED world frames only at the Three.js boundary.

## Start and control a flight

1. Open **Fly** in the activity rail.
2. Choose **Hover start** or **Cruise start**, then select a flight mode.
3. Use **Fly**, **Pause**, and **Reset** to control the deterministic run. The
   1x, 2x, and 4x controls change simulated time, not the fixed integration step.
4. Choose **Controller** or **Keyboard**. Controller mode accepts the two
   on-screen Mode 2 sticks or a standard connected gamepad. Keyboard mode accepts
   only the keyboard flight keys, so a connected gamepad cannot overwrite them.

Use **View height** to resize the 3D stage from 360 to 800 pixels. The selected
height is retained locally. **Focus** makes the simulator fill the application
window and Escape returns to the full engineering workspace. The title-bar
fullscreen button separately toggles the whole native window or browser view.
The native macOS window can also be resized normally and has a supported minimum
size of 1040 by 700 pixels.

The left stick controls yaw and throttle. The right stick controls roll and
pitch. Releasing a pointer recenters yaw, roll, and pitch while retaining
throttle, as a Mode 2 transmitter does. Motor tilt is an independent channel.

Keyboard controls are W for pitch down, S for pitch up, A for bank left, D for
bank right, Shift for more throttle, Ctrl for less throttle, Q/E for motor tilt,
and Space for run/pause. Hold Shift or Ctrl for a smooth throttle change. The
live readout shows pitch, bank, and throttle, and pressed keys light up. A
standard gamepad maps axes 0/1 to yaw/throttle and axes 2/3 to roll/pitch with a
small center deadband. Controller axis numbering varies by device and operating
system, so verify the live channel readouts before relying on a physical
transmitter or USB adapter.

## Flight modes

- **Manual** applies normalized pilot channels directly.
- **Stabilize** converts roll and pitch stick positions into bounded attitude
  targets and damps angular rates.
- **Altitude hold** closes the loop on altitude, airspeed, and heading targets.
- **Return home** flies toward the NED origin, slows inside the home radius, and
  commands a landing profile.
- **Program** follows the compiled mission behavior and its failsafe choice.

The autopilot target panel changes altitude, airspeed, heading, north wind, and
east wind while the simulation is paused or running. At 10% battery, every
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
and NED position with the tested flight-dynamics core. Loads include
wind-relative angle of attack and sideslip, bounded attached-flow lift,
parabolic drag, lateral force, hybrid thrust-vector tilt, simplified aerodynamic
and differential-thrust moments, gravity, battery-limited aggregate thrust and
energy, ground contact, and hard-impact detection. The trail, force, power,
current, attitude, position, and battery telemetry come from the integrated
state. If the selected P2 point cannot produce vehicle weight, the UI reports
that hover is not sustainable instead of fabricating extra thrust.

This is a responsive concept-level A1 simulation, not a flight-qualified digital
twin. Stall/spin behavior, rotor/airframe interference, motor and actuator
dynamics, terrain, ground effect, controller latency, multidimensional
coefficient tables, and hardware timing are not calibrated. Before real-flight
decisions, identify coefficients from traceable data, validate the model against
wind-tunnel and flight measurements, and use version-matched PX4 SITL and HIL.
