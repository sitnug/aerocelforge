import { describe, expect, it } from "vitest";
import { halfSurfaceRootTipBodyY } from "./aircraftPresentation";
import {
  aerodynamicAndPropulsiveLoads,
  compileFlightProgram,
  createInitialFlightState,
  deriveFlightTelemetry,
  quaternionToEuler,
  stepInteractiveFlight,
  type AutomationSettings,
  type FlightModel,
  type InteractiveFlightState,
  type PilotInput
} from "./flightSimulator";
import { kestrelProject } from "./kestrel";

const model: FlightModel = {
  massKg: 8,
  inertiaBodyKgM2: [1.4, 0, 0, 0, 1.8, 0, 0, 0, 2.2],
  centerOfGravityBodyM: [0, 0, 0],
  densityKgM3: 1.225,
  wingAreaM2: 0.82,
  wingSpanM: 2.4,
  meanChordM: 0.36,
  liftSlopePerRad: 4.7,
  zeroLiftAngleRad: (-2 * Math.PI) / 180,
  maximumLiftCoefficient: 1.35,
  minimumLiftCoefficient: -1.35,
  zeroLiftDragCoefficient: 0.034,
  inducedDragFactor: 0.055,
  sideForceSlopePerRad: -0.8,
  maximumTotalThrustN: 8 * 9.80665 * 1.55,
  maximumPowerW: 3_900,
  batteryEnergyWh: 220,
  nominalVoltageV: 22.2,
  surfaces: [
    {
      componentId: "wing",
      parentComponentId: null,
      name: "Main wing",
      kind: "horizontal",
      positionBodyM: [0, 0, 0],
      chordDirectionBody: [1, 0, 0],
      spanDirectionBody: [0, 1, 0],
      areaM2: 0.72,
      chordM: 0.36,
      liftSlopePerRad: 4.7,
      zeroLiftAngleRad: (-2 * Math.PI) / 180,
      stallAngleRad: (15 * Math.PI) / 180,
      maximumLiftCoefficient: 1.35,
      baseDragCoefficient: 0.026,
      inducedDragFactor: 0.055,
      control: "none",
      controlSign: 1,
      controlEffectivenessRad: 0
    },
    ...([-1, 1] as const).map((side) => ({
      componentId: `aileron-${side}`,
      parentComponentId: "wing",
      name: side < 0 ? "Left aileron" : "Right aileron",
      kind: "horizontal" as const,
      positionBodyM: [-0.05, side * 0.8, 0] as const,
      chordDirectionBody: [1, 0, 0] as const,
      spanDirectionBody: [0, 1, 0] as const,
      areaM2: 0.05,
      chordM: 0.14,
      liftSlopePerRad: 4.1,
      zeroLiftAngleRad: 0,
      stallAngleRad: (18 * Math.PI) / 180,
      maximumLiftCoefficient: 1.1,
      baseDragCoefficient: 0.024,
      inducedDragFactor: 0.08,
      control: "roll" as const,
      controlSign: -side,
      controlEffectivenessRad: (14 * Math.PI) / 180
    })),
    {
      componentId: "elevator",
      parentComponentId: null,
      name: "Elevator",
      kind: "horizontal",
      positionBodyM: [-0.7, 0, 0],
      chordDirectionBody: [1, 0, 0],
      spanDirectionBody: [0, 1, 0],
      areaM2: 0.08,
      chordM: 0.15,
      liftSlopePerRad: 3.8,
      zeroLiftAngleRad: 0,
      stallAngleRad: (18 * Math.PI) / 180,
      maximumLiftCoefficient: 1,
      baseDragCoefficient: 0.024,
      inducedDragFactor: 0.08,
      control: "pitch",
      controlSign: -1,
      controlEffectivenessRad: (16 * Math.PI) / 180
    }
  ],
  panels: [],
  propulsors: [
    {
      id: "left-propulsor",
      name: "Left propulsor",
      propellerComponentId: "left-propeller",
      positionBodyM: [0, -0.5, 0],
      axisBody: [1, 0, 0],
      maximumThrustN: (8 * 9.80665 * 1.55) / 2,
      maximumPowerW: 1_950,
      diameterM: 0.42,
      rotation: "CW",
      throttleUpKey: "Digit1",
      throttleDownKey: "Digit2"
    },
    {
      id: "right-propulsor",
      name: "Right propulsor",
      propellerComponentId: "right-propeller",
      positionBodyM: [0, 0.5, 0],
      axisBody: [1, 0, 0],
      maximumThrustN: (8 * 9.80665 * 1.55) / 2,
      maximumPowerW: 1_950,
      diameterM: 0.42,
      rotation: "CCW",
      throttleUpKey: "Digit3",
      throttleDownKey: "Digit4"
    }
  ]
};

const automation: AutomationSettings = {
  targetAltitudeM: 30,
  targetAirspeedMS: 0,
  targetHeadingRad: 0,
  maximumBankRad: (35 * Math.PI) / 180,
  program: null
};

const hoverPilot: PilotInput = {
  throttle: (model.massKg * 9.80665) / model.maximumTotalThrustN,
  roll: 0,
  pitch: 0,
  yaw: 0,
  flaps: 0,
  tiltRad: Math.PI / 2,
  propellerControl: "aircraft",
  propellerThrottles: {}
};

describe("flight behavior program", () => {
  it("compiles bounded mission commands without executing arbitrary code", () => {
    const result = compileFlightProgram(`
      ALTITUDE 42
      AIRSPEED 21
      HEADING 90
      WAYPOINT 100 20 45
      LAND
      FAILSAFE RETURN_HOME
    `);
    expect(result.diagnostics).toEqual([]);
    expect(result.program?.targetAltitudeM).toBe(42);
    expect(result.program?.targetHeadingRad).toBeCloseTo(Math.PI / 2, 12);
    expect(result.program?.waypoints).toEqual([{ northM: 100, eastM: 20, altitudeM: 45 }]);
    expect(result.program?.landAtEnd).toBe(true);

    const rejected = compileFlightProgram("globalThis.fetch('https://example.com')");
    expect(rejected.program).toBeNull();
    expect(rejected.diagnostics[0]).toContain("unknown command");
  });

  it("rejects out-of-range targets with line-numbered diagnostics", () => {
    const result = compileFlightProgram("ALTITUDE -2\nAIRSPEED 900");
    expect(result.program).toBeNull();
    expect(result.diagnostics).toEqual([
      "Line 1: altitude must be between 0 and 5000",
      "Line 2: airspeed must be between 0 and 100"
    ]);
  });
});

describe("interactive flight physics", () => {
  it("holds an exactly balanced hover with deterministic fixed steps", () => {
    let first = createInitialFlightState(model, "hover");
    let second = createInitialFlightState(model, "hover");
    for (let index = 0; index < 600; index += 1) {
      first = stepInteractiveFlight(
        model,
        first,
        hoverPilot,
        "manual",
        automation,
        [0, 0, 0],
        1 / 60
      );
      second = stepInteractiveFlight(
        model,
        second,
        hoverPilot,
        "manual",
        automation,
        [0, 0, 0],
        1 / 60
      );
    }
    const telemetry = deriveFlightTelemetry(model, first);
    expect(telemetry.altitudeM).toBeCloseTo(30, 8);
    expect(telemetry.groundSpeedMS).toBeCloseTo(0, 8);
    expect(telemetry.timeS).toBeCloseTo(10, 10);
    expect(first.rigidBody).toEqual(second.rigidBody);
    expect(first.batteryRemainingWh).toBeLessThan(model.batteryEnergyWh);
  });

  it("turns a remote roll command into a finite positive body attitude", () => {
    let state = createInitialFlightState(model, "hover");
    const rollPilot = { ...hoverPilot, roll: 0.45 };
    for (let index = 0; index < 30; index += 1) {
      state = stepInteractiveFlight(model, state, rollPilot, "manual", automation, [0, 0, 0], 0.02);
    }
    const attitude = quaternionToEuler(state.rigidBody.attitudeBodyToNed);
    expect(attitude.rollRad).toBeGreaterThan(0);
    expect(
      Object.values(deriveFlightTelemetry(model, state))
        .filter((value): value is number => typeof value === "number")
        .every(Number.isFinite)
    ).toBe(true);
  });

  it("holds hover altitude in closed loop and follows a bounded cruise program", () => {
    let hover = createInitialFlightState(model, "hover");
    for (let index = 0; index < 300; index += 1) {
      hover = stepInteractiveFlight(
        model,
        hover,
        hoverPilot,
        "altitude_hold",
        automation,
        [0, 0, 0],
        1 / 60
      );
    }
    expect(deriveFlightTelemetry(model, hover).altitudeM).toBeCloseTo(30, 2);
    expect(hover.appliedControls.source).toBe("autopilot");

    const program = compileFlightProgram(
      "ALTITUDE 40\nAIRSPEED 22\nWAYPOINT 200 0 40\nFAILSAFE RETURN_HOME"
    ).program;
    expect(program).not.toBeNull();
    let cruise = createInitialFlightState(model, "cruise");
    const cruiseAutomation = { ...automation, targetAltitudeM: 40, targetAirspeedMS: 22, program };
    for (let index = 0; index < 300; index += 1) {
      cruise = stepInteractiveFlight(
        model,
        cruise,
        hoverPilot,
        "program",
        cruiseAutomation,
        [0, 0, 0],
        1 / 60
      );
    }
    const cruiseTelemetry = deriveFlightTelemetry(model, cruise);
    expect(cruise.phase).toBe("flying");
    expect(cruiseTelemetry.northM).toBeGreaterThan(50);
    expect(cruiseTelemetry.altitudeM).toBeGreaterThan(15);
  });

  it("lands exactly on the ground plane and distinguishes a hard impact", () => {
    const initial = createInitialFlightState(model, "hover");
    let state: InteractiveFlightState = {
      ...initial,
      rigidBody: {
        ...initial.rigidBody,
        positionNedM: [0, 0, -0.05] as const,
        velocityBodyMS: [0, 0, 8] as const
      }
    };
    state = stepInteractiveFlight(
      model,
      state,
      { ...hoverPilot, throttle: 0 },
      "manual",
      automation,
      [0, 0, 0],
      0.02
    );
    expect(state.phase).toBe("crashed");
    expect(state.rigidBody.positionNedM[2]).toBe(0);
  });

  it("does not invent roll control when no aileron-like surface exists", () => {
    const noControlModel: FlightModel = {
      ...model,
      surfaces: model.surfaces.filter((surface) => surface.control === "none"),
      propulsors: [],
      maximumTotalThrustN: 0,
      maximumPowerW: 0
    };
    const initial = createInitialFlightState(noControlModel, "cruise");
    const next = stepInteractiveFlight(
      noControlModel,
      initial,
      { ...hoverPilot, throttle: 0, roll: 1, tiltRad: 0 },
      "manual",
      automation,
      [0, 0, 0],
      0.02
    );
    expect(next.rigidBody.angularRateBodyRadS[0]).toBeCloseTo(0, 12);
  });

  it("creates roll only from the real left and right aileron forces", () => {
    const initial = createInitialFlightState({ ...model, propulsors: [] }, "cruise");
    const next = stepInteractiveFlight(
      { ...model, propulsors: [], maximumTotalThrustN: 0, maximumPowerW: 0 },
      initial,
      { ...hoverPilot, throttle: 0, roll: 0.7, tiltRad: 0 },
      "manual",
      automation,
      [0, 0, 0],
      0.02
    );
    expect(Math.abs(next.rigidBody.angularRateBodyRadS[0])).toBeGreaterThan(0.0001);
  });

  it("turns uneven individual propeller power into an offset force moment", () => {
    const initial = createInitialFlightState(model, "hover");
    const next = stepInteractiveFlight(
      model,
      initial,
      {
        ...hoverPilot,
        propellerControl: "individual",
        propellerThrottles: { "left-propulsor": 1, "right-propulsor": 0 }
      },
      "manual",
      automation,
      [0, 0, 0],
      0.02
    );
    expect(Math.abs(next.rigidBody.angularRateBodyRadS[0])).toBeGreaterThan(0.001);
    expect(next.diagnostics.propulsorLoads.map((item) => item.throttle)).toEqual([1, 0]);
  });

  it("uses panel size and location for mesh-like pressure drag and moment", () => {
    const initial = createInitialFlightState(model, "cruise");
    const controls = { ...initial.appliedControls, throttle: 0, tiltRad: 0 };
    const panel = {
      componentId: "mesh-part",
      name: "Uneven imported body",
      positionBodyM: [0, 0.6, 0] as const,
      normalBody: [1, 0, 0] as const,
      areaM2: 0.5,
      pressureCoefficient: 1,
      skinFrictionCoefficient: 0,
      source: "mesh" as const
    };
    const small = aerodynamicAndPropulsiveLoads(
      { ...model, surfaces: [], propulsors: [], panels: [panel] },
      initial,
      controls,
      [0, 0, 0]
    );
    const large = aerodynamicAndPropulsiveLoads(
      { ...model, surfaces: [], propulsors: [], panels: [{ ...panel, areaM2: 1 }] },
      initial,
      controls,
      [0, 0, 0]
    );
    expect(large.diagnostics.dragN).toBeCloseTo(small.diagnostics.dragN * 2, 10);
    expect(small.diagnostics.dragCoefficient).toBeCloseTo(0.5 / model.wingAreaM2, 10);
    expect(large.diagnostics.dragCoefficient).toBeCloseTo(1 / model.wingAreaM2, 10);
    expect(Math.abs(small.momentBodyNm[2])).toBeGreaterThan(0);
  });

  it("uses the actual surrounding wind in every local air load", () => {
    const initial = createInitialFlightState(model, "cruise");
    const controls = { ...initial.appliedControls, throttle: 0, tiltRad: 0 };
    const calm = aerodynamicAndPropulsiveLoads(
      { ...model, propulsors: [] },
      initial,
      controls,
      [0, 0, 0]
    );
    const tailwind = aerodynamicAndPropulsiveLoads(
      { ...model, propulsors: [] },
      initial,
      controls,
      [10, 0, 0]
    );

    expect(tailwind.diagnostics.airspeedMS).toBeGreaterThan(11.9);
    expect(tailwind.diagnostics.airspeedMS).toBeLessThan(12.1);
    expect(tailwind.diagnostics.dragN).toBeLessThan(calm.diagnostics.dragN);
    expect(tailwind.diagnostics.surfaceLoads[0]?.dynamicPressurePa).toBeLessThan(
      calm.diagnostics.surfaceLoads[0]?.dynamicPressurePa ?? 0
    );
  });
});

describe("Kestrel procedural presentation", () => {
  it("uses mirrored inner roots, outer tips, equal dimensions, and symmetric dihedral", () => {
    const wings = kestrelProject.vehicle.components.filter(
      (component) => component.type === "wing"
    );
    const port = wings.find((component) => component.name === "Port wing");
    const starboard = wings.find((component) => component.name === "Starboard wing");
    expect(port).toBeDefined();
    expect(starboard).toBeDefined();
    if (port === undefined || starboard === undefined) return;
    const portStations = halfSurfaceRootTipBodyY(
      port.transform.translationM[1],
      port.geometry.boundingBoxM[1]
    );
    const starboardStations = halfSurfaceRootTipBodyY(
      starboard.transform.translationM[1],
      starboard.geometry.boundingBoxM[1]
    );
    expect(portStations.rootBodyYM).toBeCloseTo(-starboardStations.rootBodyYM, 12);
    expect(portStations.tipBodyYM).toBeCloseTo(-starboardStations.tipBodyYM, 12);
    expect(Math.abs(portStations.rootBodyYM)).toBeLessThan(Math.abs(portStations.tipBodyYM));
    expect(port.geometry.boundingBoxM).toEqual(starboard.geometry.boundingBoxM);
    expect(port.transform.rotationRad[0]).toBeCloseTo(-starboard.transform.rotationRad[0], 12);
    expect(port.transform.rotationRad[1]).toBeCloseTo(starboard.transform.rotationRad[1], 12);
  });
});
