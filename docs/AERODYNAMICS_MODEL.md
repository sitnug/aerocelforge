# Aerodynamics model and real-world validity

Aerocel Forge separates equation correctness from aircraft accuracy. The built-in
A1 model is a deterministic geometry-aware, attached-flow, parabolic-polar
estimate. It is useful for preliminary comparisons, but it is not a substitute
for airfoil data, VLM/panel analysis, CFD, a wind tunnel, or flight-test
identification.

The interactive Fly workspace has a separate local-flow model. It applies lift,
drag, and pressure forces to individual parts at their actual position relative
to the centre of gravity. Lifting parts use their own area, chord, span,
orientation, lift slope, stall angle, lift limit, and drag inputs. Imported
non-lifting meshes use sampled triangle area, centroid, and normal; procedural
bodies use oriented bounding-box faces. Wind and aircraft angular rate change
the local velocity at each part. The resulting `r × F` moment changes the 6-DOF
state. Pilot inputs do not add direct moments: only matching aileron/elevon,
elevator/canard, rudder, flap/brake, or physically offset propeller forces can
control the vehicle.

This live calculation is a quasi-steady reduced-order pressure/panel model, not
an OpenFOAM/SU2 CFD solve or a replacement for VSPAERO. It makes size, shape,
orientation, asymmetry, wind, and placement matter during interactive flight,
but its coefficients still need calibration.

## Equations implemented

At each operating point the model uses the U.S. Standard Atmosphere 1976
troposphere, Sutherland viscosity, and SI units internally:

```text
q       = 0.5 rho V^2
AR      = b^2 / S
a       = a0 / (1 + a0 / (pi e AR))
CL      = clamp[a (alpha - alpha_0), CL_min, CL_max]
CD_i    = CL^2 / (pi e AR)
CD_beta = K_beta beta^2
CD_base = CD_profile + CD_pressure + CD_skin
CD      = CD_base + CD_i + CD_beta + CD_add
L       = q S CL
D       = q S CD
Re      = rho V c / mu
M       = V / a_sound
```

The UI displays every drag term rather than only the total. A1 derives its base
drag from each enabled part. Lifting surfaces contribute their individual
profile-drag coefficient and actual area. Imported meshes contribute sampled
triangle normals and areas; procedural bodies use oriented bounding-box panels.
Windward pressure and tangential skin-friction forces are reduced to `CD` using
the project wing reference area. `CD_add` is an explicit user-controlled
increment in drag counts (`1 count = 0.0001 CD`) for measured or justified
excrescence, cooling, landing-gear, trim, roughness, or other effects.

## What A1 does not derive

A1 estimates wetted-panel skin friction and windward form pressure, but it does
not solve a boundary layer or independently calculate transition location,
Reynolds-dependent roughness, component interference, cooling flow, landing-gear
drag, trim drag, wave drag, separated flow, dynamic stall, rotor-wake
interaction, or ground effect. Imported mesh shape contributes face area,
direction, pressure drag, and local moment in both A1 and Fly, but it does not
automatically become a validated aerodynamic database. Those effects require
geometry and flow-specific evidence.

The result emits warnings when:

- positive or negative attached-flow stall boundaries are exceeded;
- Mach number reaches the range where omitted compressibility matters;
- Reynolds number is very low and viscous/separation sensitivity is high;
- sideslip is used without a configured quadratic drag increment;
- no real-world added-drag increment is configured;
- span efficiency above 1.0 is used without evidence.

Glide sink rate uses the trigonometric glide angle derived from `CD/CL`, rather
than the small-angle `V/(L/D)` approximation. Published stall speed still uses the
standard steady-flight `L = W` convention.

## Verification in this repository

Automated tests check:

- U.S. Standard Atmosphere sea-level density;
- the finite-wing slope is below the two-dimensional section slope;
- induced drag increases with lift squared;
- every drag contribution sums exactly to total `CD`;
- blunt-body pressure drag exceeds slender-body pressure drag for the same
  reference area;
- imported body-panel drag force is included in the reported Fly `CD`;
- added drag counts propagate through design-point, trim, glide, transition, and
  optimization calculations;
- positive and negative stall margins use the nearest configured boundary;
- best `L/D` agrees with the analytical parabolic-polar result;
- glide sink rate is consistent with the computed glide angle;
- nonphysical drag-polar inputs are rejected.

These are software and equation checks, not validation of the Kestrel example.

## Required calibration workflow

For a real aircraft:

1. Replace illustrative reference area, span, chord, mass, atmosphere, panel
   pressure/skin coefficients, lift slope, stall limits, and span efficiency
   with traceable inputs.
2. Build parasite drag from measured wetted areas and justified skin-friction,
   form, interference, and excrescence methods, or import a validated polar.
3. Match Reynolds and Mach number to the intended operating point.
4. Compare A1 against VSPAERO/VLM or panel results inside their attached-flow
   range, then against mesh-converged CFD where appropriate.
5. Calibrate against wind-tunnel or flight-test data and retain residuals and
   uncertainty bounds. Do not tune one operating point and assume all regimes are
   validated.

## Primary references

- [NASA Glenn lift equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/lift-equation/)
- [NASA Glenn modern drag equation and induced drag](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/modern-drag-equation/)
- [NASA Glenn drag equation and drag contributors](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/)
- [NASA Reynolds-number similarity](https://www.grc.nasa.gov/WWW/k-12/airplane/reynolds.html)
- [NASA OpenVSP Parasite Drag Tool](https://www.nasa.gov/reference/openvsp-parasite-drag-tool/)
- [FAA Pilot's Handbook of Aeronautical Knowledge, Chapter 5](https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/phak/chapter-5-aerodynamics-flight)
