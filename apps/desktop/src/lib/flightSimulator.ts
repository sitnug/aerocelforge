import {
  bodyToNed,
  nedToBody,
  stepSixDof,
  type Quaternion,
  type RigidBodyInput,
  type SixDofState
} from "@aerocel/flight-dynamics";
import {
  cross3,
  dot3,
  magnitude3,
  normalize3,
  scale3,
  subtract3,
  type Vector3
} from "@aerocel/math-core";
import {
  aerodynamicPanelLoad,
  type AerodynamicPanel,
  type AerodynamicSurface,
  type FlightPropulsor
} from "./aircraftPhysics";

const GRAVITY_M_S2 = 9.80665;
const DEG_TO_RAD = Math.PI / 180;

export type FlightMode = "manual" | "stabilize" | "altitude_hold" | "program" | "return_home";

export type FlightPreset = "hover" | "cruise";

export interface FlightModel {
  readonly massKg: number;
  readonly inertiaBodyKgM2: RigidBodyInput["inertiaBodyKgM2"];
  readonly centerOfGravityBodyM: readonly [number, number, number];
  readonly densityKgM3: number;
  readonly wingAreaM2: number;
  readonly wingSpanM: number;
  readonly meanChordM: number;
  readonly liftSlopePerRad: number;
  readonly zeroLiftAngleRad: number;
  readonly maximumLiftCoefficient: number;
  readonly minimumLiftCoefficient: number;
  readonly zeroLiftDragCoefficient: number;
  readonly inducedDragFactor: number;
  readonly sideForceSlopePerRad: number;
  readonly maximumTotalThrustN: number;
  readonly maximumPowerW: number;
  readonly batteryEnergyWh: number;
  readonly nominalVoltageV: number;
  readonly surfaces: readonly AerodynamicSurface[];
  readonly panels: readonly AerodynamicPanel[];
  readonly propulsors: readonly FlightPropulsor[];
}

export interface PilotInput {
  readonly throttle: number;
  readonly roll: number;
  readonly pitch: number;
  readonly yaw: number;
  readonly flaps: number;
  readonly tiltRad: number;
  readonly propellerControl: "aircraft" | "individual";
  readonly propellerThrottles: Readonly<Record<string, number>>;
}

export interface FlightWaypoint {
  readonly northM: number;
  readonly eastM: number;
  readonly altitudeM: number;
}

export interface FlightProgram {
  readonly targetAltitudeM: number;
  readonly targetAirspeedMS: number;
  readonly targetHeadingRad: number;
  readonly waypoints: readonly FlightWaypoint[];
  readonly landAtEnd: boolean;
  readonly failsafe: "return_home" | "land";
}

export interface ProgramCompileResult {
  readonly program: FlightProgram | null;
  readonly diagnostics: readonly string[];
}

export interface AutomationSettings {
  readonly targetAltitudeM: number;
  readonly targetAirspeedMS: number;
  readonly targetHeadingRad: number;
  readonly maximumBankRad: number;
  readonly program: FlightProgram | null;
}

export interface AppliedFlightControls extends PilotInput {
  readonly source: "pilot" | "stability" | "autopilot" | "failsafe";
}

export interface FlightStepDiagnostics {
  readonly airspeedMS: number;
  readonly angleOfAttackRad: number;
  readonly sideslipRad: number;
  readonly liftCoefficient: number;
  readonly dragCoefficient: number;
  readonly liftN: number;
  readonly dragN: number;
  readonly thrustN: number;
  readonly powerW: number;
  readonly currentA: number;
  readonly loadFactor: number;
  readonly surfaceLoads: readonly SurfaceLoadDiagnostic[];
  readonly propulsorLoads: readonly PropulsorLoadDiagnostic[];
}

export interface SurfaceLoadDiagnostic {
  readonly componentId: string;
  readonly name: string;
  readonly dynamicPressurePa: number;
  readonly liftN: number;
  readonly dragN: number;
  readonly sideForceN: number;
  readonly angleOfAttackRad: number;
}

export interface PropulsorLoadDiagnostic {
  readonly id: string;
  readonly name: string;
  readonly throttle: number;
  readonly thrustN: number;
}

export interface InteractiveFlightState {
  readonly rigidBody: SixDofState;
  readonly phase: "ready" | "flying" | "landed" | "crashed" | "battery_depleted";
  readonly motorTiltRad: number;
  readonly batteryRemainingWh: number;
  readonly distanceTravelledM: number;
  readonly activeWaypointIndex: number;
  readonly appliedControls: AppliedFlightControls;
  readonly diagnostics: FlightStepDiagnostics;
  readonly trailNedM: readonly (readonly [number, number, number])[];
  readonly lastTrailTimeS: number;
}

export interface FlightTelemetry extends FlightStepDiagnostics {
  readonly timeS: number;
  readonly altitudeM: number;
  readonly northM: number;
  readonly eastM: number;
  readonly verticalSpeedMS: number;
  readonly groundSpeedMS: number;
  readonly rollRad: number;
  readonly pitchRad: number;
  readonly headingRad: number;
  readonly batteryPercent: number;
  readonly activeWaypointIndex: number;
  readonly phase: InteractiveFlightState["phase"];
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

const wrapAngle = (angleRad: number): number => Math.atan2(Math.sin(angleRad), Math.cos(angleRad));

const magnitude = (vector: readonly [number, number, number]): number =>
  Math.hypot(vector[0], vector[1], vector[2]);

function numberFromToken(
  token: string | undefined,
  label: string,
  lineNumber: number,
  minimum: number,
  maximum: number,
  diagnostics: string[]
): number | null {
  const value = Number(token);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    diagnostics.push(`Line ${lineNumber}: ${label} must be between ${minimum} and ${maximum}`);
    return null;
  }
  return value;
}

export function compileFlightProgram(source: string): ProgramCompileResult {
  let targetAltitudeM = 40;
  let targetAirspeedMS = 20;
  let targetHeadingRad = 0;
  let landAtEnd = false;
  let failsafe: FlightProgram["failsafe"] = "return_home";
  const waypoints: FlightWaypoint[] = [];
  const diagnostics: string[] = [];

  source.split(/\r?\n/u).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.replace(/#.*/u, "").trim();
    if (line.length === 0) return;
    const [command = "", ...tokens] = line.split(/\s+/u);
    switch (command.toUpperCase()) {
      case "ALTITUDE": {
        const value = numberFromToken(tokens[0], "altitude", lineNumber, 0, 5_000, diagnostics);
        if (value !== null) targetAltitudeM = value;
        break;
      }
      case "AIRSPEED": {
        const value = numberFromToken(tokens[0], "airspeed", lineNumber, 0, 100, diagnostics);
        if (value !== null) targetAirspeedMS = value;
        break;
      }
      case "HEADING": {
        const value = numberFromToken(tokens[0], "heading", lineNumber, 0, 360, diagnostics);
        if (value !== null) targetHeadingRad = value * DEG_TO_RAD;
        break;
      }
      case "WAYPOINT": {
        const northM = numberFromToken(
          tokens[0],
          "north",
          lineNumber,
          -100_000,
          100_000,
          diagnostics
        );
        const eastM = numberFromToken(
          tokens[1],
          "east",
          lineNumber,
          -100_000,
          100_000,
          diagnostics
        );
        const altitudeM = numberFromToken(tokens[2], "altitude", lineNumber, 0, 5_000, diagnostics);
        if (northM !== null && eastM !== null && altitudeM !== null) {
          waypoints.push({ northM, eastM, altitudeM });
        }
        break;
      }
      case "LAND":
        landAtEnd = true;
        break;
      case "FAILSAFE": {
        const selection = tokens[0]?.toUpperCase();
        if (selection === "RETURN_HOME") failsafe = "return_home";
        else if (selection === "LAND") failsafe = "land";
        else diagnostics.push(`Line ${lineNumber}: FAILSAFE must be RETURN_HOME or LAND`);
        break;
      }
      default:
        diagnostics.push(`Line ${lineNumber}: unknown command ${command}`);
    }
  });

  if (waypoints.length > 50) diagnostics.push("Programs may contain at most 50 waypoints");
  return {
    program:
      diagnostics.length === 0
        ? {
            targetAltitudeM,
            targetAirspeedMS,
            targetHeadingRad,
            waypoints,
            landAtEnd,
            failsafe
          }
        : null,
    diagnostics
  };
}

export function quaternionToEuler(quaternion: Quaternion): {
  readonly rollRad: number;
  readonly pitchRad: number;
  readonly yawRad: number;
} {
  const [w, x, y, z] = quaternion;
  return {
    rollRad: Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)),
    pitchRad: Math.asin(clamp(2 * (w * y - z * x), -1, 1)),
    yawRad: Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
  };
}

const zeroDiagnostics: FlightStepDiagnostics = {
  airspeedMS: 0,
  angleOfAttackRad: 0,
  sideslipRad: 0,
  liftCoefficient: 0,
  dragCoefficient: 0,
  liftN: 0,
  dragN: 0,
  thrustN: 0,
  powerW: 0,
  currentA: 0,
  loadFactor: 1,
  surfaceLoads: [],
  propulsorLoads: []
};

export function createInitialFlightState(
  model: FlightModel,
  preset: FlightPreset
): InteractiveFlightState {
  if (model.massKg <= 0 || model.batteryEnergyWh <= 0) {
    throw new Error("Interactive flight model requires positive mass and battery energy");
  }
  const cruisePitchRad = 4 * DEG_TO_RAD;
  const rigidBody: SixDofState =
    preset === "hover"
      ? {
          timeS: 0,
          positionNedM: [0, 0, -30],
          velocityBodyMS: [0, 0, 0],
          attitudeBodyToNed: [1, 0, 0, 0],
          angularRateBodyRadS: [0, 0, 0]
        }
      : {
          timeS: 0,
          positionNedM: [0, 0, -40],
          velocityBodyMS: [22, 0, 0],
          attitudeBodyToNed: [Math.cos(cruisePitchRad / 2), 0, Math.sin(cruisePitchRad / 2), 0],
          angularRateBodyRadS: [0, 0, 0]
        };
  return {
    rigidBody,
    phase: "ready",
    motorTiltRad: preset === "hover" ? Math.PI / 2 : 0,
    batteryRemainingWh: model.batteryEnergyWh,
    distanceTravelledM: 0,
    activeWaypointIndex: 0,
    appliedControls: {
      throttle:
        preset === "hover" && model.maximumTotalThrustN > 0
          ? (model.massKg * GRAVITY_M_S2) / model.maximumTotalThrustN
          : 0,
      roll: 0,
      pitch: 0,
      yaw: 0,
      flaps: 0,
      tiltRad: preset === "hover" ? Math.PI / 2 : 0,
      propellerControl: "aircraft",
      propellerThrottles: {},
      source: "pilot"
    },
    diagnostics: zeroDiagnostics,
    trailNedM: [rigidBody.positionNedM],
    lastTrailTimeS: 0
  };
}

function targetForMode(
  state: InteractiveFlightState,
  mode: FlightMode,
  automation: AutomationSettings
): {
  readonly altitudeM: number;
  readonly airspeedMS: number;
  readonly headingRad: number;
  readonly waypointIndex: number;
  readonly landing: boolean;
} {
  let altitudeM = automation.targetAltitudeM;
  let airspeedMS = automation.targetAirspeedMS;
  let headingRad = automation.targetHeadingRad;
  let waypointIndex = state.activeWaypointIndex;
  let landing = false;
  const position = state.rigidBody.positionNedM;

  if (mode === "return_home") {
    headingRad = Math.atan2(-position[1], -position[0]);
    altitudeM = Math.max(25, automation.targetAltitudeM);
    if (Math.hypot(position[0], position[1]) < 10) {
      airspeedMS = 0;
      altitudeM = 1.5;
      landing = true;
    }
  }

  if (mode === "program" && automation.program !== null) {
    const program = automation.program;
    altitudeM = program.targetAltitudeM;
    airspeedMS = program.targetAirspeedMS;
    headingRad = program.targetHeadingRad;
    const waypoint = program.waypoints[waypointIndex];
    if (waypoint !== undefined) {
      const northError = waypoint.northM - position[0];
      const eastError = waypoint.eastM - position[1];
      if (Math.hypot(northError, eastError) < 8 && waypointIndex < program.waypoints.length - 1) {
        waypointIndex += 1;
      }
      const activeWaypoint = program.waypoints[waypointIndex] ?? waypoint;
      headingRad = Math.atan2(
        activeWaypoint.eastM - position[1],
        activeWaypoint.northM - position[0]
      );
      altitudeM = activeWaypoint.altitudeM;
      if (
        waypointIndex === program.waypoints.length - 1 &&
        Math.hypot(activeWaypoint.northM - position[0], activeWaypoint.eastM - position[1]) < 8 &&
        program.landAtEnd
      ) {
        altitudeM = 0;
        airspeedMS = 0;
        landing = true;
      }
    } else if (program.landAtEnd) {
      altitudeM = 0;
      airspeedMS = 0;
      landing = true;
    }
  }
  return { altitudeM, airspeedMS, headingRad, waypointIndex, landing };
}

function resolveControls(
  model: FlightModel,
  state: InteractiveFlightState,
  pilot: PilotInput,
  requestedMode: FlightMode,
  automation: AutomationSettings
): { readonly controls: AppliedFlightControls; readonly waypointIndex: number } {
  const attitude = quaternionToEuler(state.rigidBody.attitudeBodyToNed);
  const velocityNed = bodyToNed(state.rigidBody.velocityBodyMS, state.rigidBody.attitudeBodyToNed);
  const altitudeM = -state.rigidBody.positionNedM[2];
  const batteryPercent = (100 * state.batteryRemainingWh) / model.batteryEnergyWh;
  let mode = requestedMode;
  let source: AppliedFlightControls["source"] = "autopilot";
  let failsafeLanding = false;
  if (batteryPercent <= 10 && requestedMode !== "manual") {
    failsafeLanding = automation.program?.failsafe === "land";
    mode = failsafeLanding ? "altitude_hold" : "return_home";
    source = "failsafe";
  }

  if (mode === "manual") {
    return {
      controls: {
        throttle: clamp(pilot.throttle, 0, 1),
        roll: clamp(pilot.roll, -1, 1),
        pitch: clamp(pilot.pitch, -1, 1),
        yaw: clamp(pilot.yaw, -1, 1),
        flaps: clamp(pilot.flaps, 0, 1),
        tiltRad: clamp(pilot.tiltRad, 0, Math.PI / 2),
        propellerControl: pilot.propellerControl,
        propellerThrottles: pilot.propellerThrottles,
        source: "pilot"
      },
      waypointIndex: state.activeWaypointIndex
    };
  }

  if (mode === "stabilize") {
    const targetRoll = pilot.roll * automation.maximumBankRad;
    const targetPitch = pilot.pitch * 20 * DEG_TO_RAD;
    return {
      controls: {
        throttle: clamp(pilot.throttle, 0, 1),
        roll: clamp(
          (targetRoll - attitude.rollRad) * 2.5 - state.rigidBody.angularRateBodyRadS[0] * 0.35,
          -1,
          1
        ),
        pitch: clamp(
          (targetPitch - attitude.pitchRad) * 2.4 - state.rigidBody.angularRateBodyRadS[1] * 0.35,
          -1,
          1
        ),
        yaw: clamp(pilot.yaw - state.rigidBody.angularRateBodyRadS[2] * 0.3, -1, 1),
        flaps: clamp(pilot.flaps, 0, 1),
        tiltRad: clamp(pilot.tiltRad, 0, Math.PI / 2),
        propellerControl: pilot.propellerControl,
        propellerThrottles: pilot.propellerThrottles,
        source: "stability"
      },
      waypointIndex: state.activeWaypointIndex
    };
  }

  const configuredTarget = targetForMode(state, mode, automation);
  const target = failsafeLanding
    ? { ...configuredTarget, altitudeM: 0, airspeedMS: 0, landing: true }
    : configuredTarget;
  const headingError = wrapAngle(target.headingRad - attitude.yawRad);
  const targetRoll = clamp(
    headingError * 0.85,
    -automation.maximumBankRad,
    automation.maximumBankRad
  );
  const altitudeError = target.altitudeM - altitudeM;
  const targetPitch = clamp(
    altitudeError * 0.035 + velocityNed[2] * 0.08,
    -18 * DEG_TO_RAD,
    18 * DEG_TO_RAD
  );
  const groundSpeedMS = Math.hypot(velocityNed[0], velocityNed[1]);
  const desiredTilt =
    target.airspeedMS < 2
      ? Math.PI / 2
      : clamp(
          (1 - (groundSpeedMS + 4) / Math.max(target.airspeedMS, 1)) * (Math.PI / 2),
          0,
          Math.PI / 2
        );
  const hoverThrottle =
    model.maximumTotalThrustN > 0 ? (model.massKg * GRAVITY_M_S2) / model.maximumTotalThrustN : 0;
  const verticalSupport = Math.max(0.35, Math.sin(desiredTilt));
  const speedError = target.airspeedMS - groundSpeedMS;
  const throttle = target.landing
    ? clamp(hoverThrottle + altitudeError * 0.025 + velocityNed[2] * 0.08, 0.15, 0.82)
    : clamp(
        hoverThrottle / verticalSupport +
          altitudeError * 0.018 +
          velocityNed[2] * 0.055 +
          speedError * 0.012,
        0,
        1
      );
  return {
    controls: {
      throttle,
      roll: clamp(
        (targetRoll - attitude.rollRad) * 2.8 - state.rigidBody.angularRateBodyRadS[0] * 0.4,
        -1,
        1
      ),
      pitch: clamp(
        (targetPitch - attitude.pitchRad) * 2.6 - state.rigidBody.angularRateBodyRadS[1] * 0.4,
        -1,
        1
      ),
      yaw: clamp(headingError * 0.6 - state.rigidBody.angularRateBodyRadS[2] * 0.35, -1, 1),
      flaps: clamp(pilot.flaps, 0, 1),
      tiltRad: desiredTilt,
      propellerControl: "aircraft",
      propellerThrottles: {},
      source
    },
    waypointIndex: target.waypointIndex
  };
}

const addVector = (left: Vector3, right: Vector3): [number, number, number] => [
  left[0] + right[0],
  left[1] + right[1],
  left[2] + right[2]
];

function safeUnit(vector: Vector3): [number, number, number] {
  return magnitude3(vector) <= 1e-9 ? [0, 0, 0] : normalize3(vector);
}

function localAirVelocity(
  airVelocityBody: Vector3,
  angularRateBodyRadS: Vector3,
  positionBodyM: Vector3
): [number, number, number] {
  return addVector(airVelocityBody, cross3(angularRateBodyRadS, positionBodyM));
}

function postStallLiftCoefficient(angleOfAttackRad: number, surface: AerodynamicSurface): number {
  const linear = surface.liftSlopePerRad * (angleOfAttackRad - surface.zeroLiftAngleRad);
  const clippedLinear = clamp(
    linear,
    -surface.maximumLiftCoefficient,
    surface.maximumLiftCoefficient
  );
  const absoluteAngle = Math.abs(angleOfAttackRad - surface.zeroLiftAngleRad);
  if (absoluteAngle <= surface.stallAngleRad) return clippedLinear;
  const liftAtStall = Math.min(
    surface.maximumLiftCoefficient,
    surface.liftSlopePerRad * surface.stallAngleRad
  );
  const decay = clamp(
    1 - (absoluteAngle - surface.stallAngleRad) / (Math.PI / 2 - surface.stallAngleRad),
    0.18,
    1
  );
  return Math.sign(linear) * liftAtStall * decay;
}

function surfaceCommand(
  surface: Pick<AerodynamicSurface, "control" | "controlSign" | "positionBodyM">,
  controls: AppliedFlightControls
): number {
  if (surface.control === "roll") return controls.roll * surface.controlSign;
  if (surface.control === "pitch") return controls.pitch * surface.controlSign;
  if (surface.control === "yaw") return controls.yaw * surface.controlSign;
  if (surface.control === "flap" || surface.control === "brake") return controls.flaps;
  const sideSign = surface.positionBodyM[1] < 0 ? -1 : 1;
  const rollSign = -sideSign;
  const pitchSign = surface.positionBodyM[0] < 0 ? -1 : 1;
  if (surface.control === "elevon") {
    return clamp(controls.roll * rollSign + controls.pitch * pitchSign, -1, 1);
  }
  if (surface.control === "flaperon") {
    return clamp(controls.roll * rollSign + controls.flaps, -1, 1);
  }
  return 0;
}

function propulsorThrottle(
  propulsor: FlightPropulsor,
  controls: AppliedFlightControls,
  propulsors: readonly FlightPropulsor[]
): number {
  if (controls.propellerControl === "individual") {
    return clamp(controls.propellerThrottles[propulsor.id] ?? 0, 0, 1);
  }
  const maximumLateralOffset = Math.max(
    0.1,
    ...propulsors.map((item) => Math.abs(item.positionBodyM[1]))
  );
  const maximumLongitudinalOffset = Math.max(
    0.1,
    ...propulsors.map((item) => Math.abs(item.positionBodyM[0]))
  );
  const rollMix =
    -controls.roll *
    (propulsor.positionBodyM[1] / maximumLateralOffset) *
    Math.sin(controls.tiltRad);
  const pitchMix =
    controls.pitch *
    (propulsor.positionBodyM[0] / maximumLongitudinalOffset) *
    Math.sin(controls.tiltRad);
  const yawMix = controls.yaw * (propulsor.rotation === "CW" ? -1 : 1) * 0.12;
  return clamp(controls.throttle + rollMix * 0.22 + pitchMix * 0.22 + yawMix, 0, 1);
}

export function aerodynamicAndPropulsiveLoads(
  model: FlightModel,
  state: InteractiveFlightState,
  controls: AppliedFlightControls,
  windNedMS: readonly [number, number, number]
): {
  readonly forceBodyN: RigidBodyInput["forceBodyN"];
  readonly momentBodyNm: RigidBodyInput["momentBodyNm"];
  readonly diagnostics: FlightStepDiagnostics;
} {
  const windBody = nedToBody(windNedMS, state.rigidBody.attitudeBodyToNed);
  const airVelocityBody = [
    state.rigidBody.velocityBodyMS[0] - windBody[0],
    state.rigidBody.velocityBodyMS[1] - windBody[1],
    state.rigidBody.velocityBodyMS[2] - windBody[2]
  ] as const;
  const airspeedMS = magnitude(airVelocityBody);
  const angleOfAttackRad =
    airspeedMS > 0.25 ? Math.atan2(airVelocityBody[2], airVelocityBody[0]) : 0;
  const sideslipRad =
    airspeedMS > 0.25 ? Math.asin(clamp(airVelocityBody[1] / airspeedMS, -1, 1)) : 0;
  let forceBodyN: [number, number, number] = [0, 0, 0];
  let momentBodyNm: [number, number, number] = [0, 0, 0];
  let liftN = 0;
  let dragN = 0;
  const surfaceLoads: SurfaceLoadDiagnostic[] = [];

  for (const surface of model.surfaces) {
    const momentArm = subtract3(surface.positionBodyM, model.centerOfGravityBodyM);
    const localVelocity = localAirVelocity(
      airVelocityBody,
      state.rigidBody.angularRateBodyRadS,
      momentArm
    );
    const localSpeed = magnitude3(localVelocity);
    if (localSpeed <= 0.15) continue;
    const localDirection = safeUnit(localVelocity);
    const localDynamicPressurePa = 0.5 * model.densityKgM3 * localSpeed ** 2;
    const chordSpeed = dot3(localVelocity, surface.chordDirectionBody);
    const normalDirection = safeUnit(cross3(surface.chordDirectionBody, surface.spanDirectionBody));
    const normalSpeed = dot3(localVelocity, normalDirection);
    const geometricAngleRad = Math.atan2(normalSpeed, chordSpeed);
    const command = surfaceCommand(surface, controls);
    const effectiveAngleRad =
      geometricAngleRad +
      (surface.control === "brake" ? 0 : command * surface.controlEffectivenessRad);
    const liftCoefficient =
      postStallLiftCoefficient(effectiveAngleRad, surface) *
      (surface.control === "brake" ? 1 - 0.75 * Math.abs(command) : 1);
    const dragCoefficient =
      surface.baseDragCoefficient +
      surface.inducedDragFactor * liftCoefficient ** 2 +
      (surface.control === "brake" ? 0.35 * Math.abs(command) : 0);
    const surfaceLiftN = localDynamicPressurePa * surface.areaM2 * liftCoefficient;
    const surfaceDragN = localDynamicPressurePa * surface.areaM2 * dragCoefficient;
    const liftDirection = safeUnit(cross3(surface.spanDirectionBody, localDirection));
    const surfaceForce = addVector(
      scale3(liftDirection, surfaceLiftN),
      scale3(localDirection, -surfaceDragN)
    );
    forceBodyN = addVector(forceBodyN, surfaceForce);
    momentBodyNm = addVector(momentBodyNm, cross3(momentArm, surfaceForce));
    const upwardLift = Math.max(0, -surfaceForce[2]);
    const lateralForce = Math.abs(surfaceForce[1]);
    liftN += upwardLift;
    dragN += Math.max(0, -dot3(surfaceForce, localDirection));
    surfaceLoads.push({
      componentId: surface.componentId,
      name: surface.name,
      dynamicPressurePa: localDynamicPressurePa,
      liftN: upwardLift,
      dragN: surfaceDragN,
      sideForceN: lateralForce,
      angleOfAttackRad: effectiveAngleRad
    });
  }

  const panelLoads = new Map<string, SurfaceLoadDiagnostic>();
  for (const panel of model.panels) {
    const momentArm = subtract3(panel.positionBodyM, model.centerOfGravityBodyM);
    const localVelocity = localAirVelocity(
      airVelocityBody,
      state.rigidBody.angularRateBodyRadS,
      momentArm
    );
    const localSpeed = magnitude3(localVelocity);
    if (localSpeed <= 0.15) continue;
    const localDirection = safeUnit(localVelocity);
    const panelLoad = aerodynamicPanelLoad(
      panel,
      localVelocity,
      model.densityKgM3,
      surfaceCommand(panel, controls)
    );
    const panelForce = panelLoad.forceBodyN;
    forceBodyN = addVector(forceBodyN, panelForce);
    momentBodyNm = addVector(momentBodyNm, cross3(momentArm, panelForce));
    const panelDragN = Math.max(0, -dot3(panelForce, localDirection));
    dragN += panelDragN;
    liftN += Math.max(0, -panelForce[2]);
    const previous = panelLoads.get(panel.componentId);
    panelLoads.set(panel.componentId, {
      componentId: panel.componentId,
      name: panel.name,
      dynamicPressurePa: panelLoad.dynamicPressurePa,
      liftN: (previous?.liftN ?? 0) + Math.max(0, -panelForce[2]),
      dragN: (previous?.dragN ?? 0) + panelDragN,
      sideForceN: (previous?.sideForceN ?? 0) + Math.abs(panelForce[1]),
      angleOfAttackRad: panelLoad.incidenceAngleRad
    });
  }
  surfaceLoads.push(...panelLoads.values());

  let thrustN = 0;
  let powerW = 0;
  const propulsorLoads: PropulsorLoadDiagnostic[] = [];
  for (const propulsor of model.propulsors) {
    const momentArm = subtract3(propulsor.positionBodyM, model.centerOfGravityBodyM);
    const throttle = propulsorThrottle(propulsor, controls, model.propulsors);
    const tiltedAxis = safeUnit([
      propulsor.axisBody[0] * Math.cos(state.motorTiltRad) -
        propulsor.axisBody[2] * Math.sin(state.motorTiltRad),
      propulsor.axisBody[1],
      propulsor.axisBody[0] * -Math.sin(state.motorTiltRad) +
        propulsor.axisBody[2] * Math.cos(state.motorTiltRad)
    ]);
    const unitThrustN = throttle * propulsor.maximumThrustN;
    const thrustForce = scale3(tiltedAxis, unitThrustN);
    const offsetMoment = cross3(momentArm, thrustForce);
    const reactionTorqueNm =
      unitThrustN * propulsor.diameterM * 0.018 * (propulsor.rotation === "CW" ? -1 : 1);
    forceBodyN = addVector(forceBodyN, thrustForce);
    momentBodyNm = addVector(
      momentBodyNm,
      addVector(offsetMoment, scale3(tiltedAxis, reactionTorqueNm))
    );
    thrustN += unitThrustN;
    powerW += propulsor.maximumPowerW * throttle ** 1.5;
    propulsorLoads.push({ id: propulsor.id, name: propulsor.name, throttle, thrustN: unitThrustN });
  }
  powerW = Math.min(powerW, model.maximumPowerW);

  const referenceForceN =
    0.5 * model.densityKgM3 * airspeedMS ** 2 * Math.max(model.wingAreaM2, 1e-9);
  const liftCoefficient = referenceForceN > 1e-9 ? liftN / referenceForceN : 0;
  const dragCoefficient = referenceForceN > 1e-9 ? dragN / referenceForceN : 0;
  return {
    forceBodyN,
    momentBodyNm,
    diagnostics: {
      airspeedMS,
      angleOfAttackRad,
      sideslipRad,
      liftCoefficient,
      dragCoefficient,
      liftN,
      dragN,
      thrustN,
      powerW,
      currentA: powerW / model.nominalVoltageV,
      loadFactor: Math.hypot(forceBodyN[1], forceBodyN[2]) / (model.massKg * GRAVITY_M_S2),
      surfaceLoads,
      propulsorLoads
    }
  };
}

export function stepInteractiveFlight(
  model: FlightModel,
  state: InteractiveFlightState,
  pilot: PilotInput,
  mode: FlightMode,
  automation: AutomationSettings,
  windNedMS: readonly [number, number, number],
  stepS: number
): InteractiveFlightState {
  if (!Number.isFinite(stepS) || stepS <= 0 || stepS > 0.05) {
    throw new Error("Interactive flight step must be in the range (0, 0.05] seconds");
  }
  if (state.phase === "crashed" || state.phase === "landed" || state.phase === "battery_depleted") {
    return state;
  }
  const resolved = resolveControls(model, state, pilot, mode, automation);
  const maximumTiltStep = 1.2 * stepS;
  const motorTiltRad =
    state.motorTiltRad +
    clamp(resolved.controls.tiltRad - state.motorTiltRad, -maximumTiltStep, maximumTiltStep);
  const stateWithTilt = { ...state, motorTiltRad };
  const loads = aerodynamicAndPropulsiveLoads(model, stateWithTilt, resolved.controls, windNedMS);
  let rigidBody = stepSixDof(
    state.rigidBody,
    {
      massKg: model.massKg,
      inertiaBodyKgM2: model.inertiaBodyKgM2,
      forceBodyN: loads.forceBodyN,
      momentBodyNm: loads.momentBodyNm
    },
    stepS
  );
  const previousPosition = state.rigidBody.positionNedM;
  const distanceTravelledM =
    state.distanceTravelledM +
    Math.hypot(
      rigidBody.positionNedM[0] - previousPosition[0],
      rigidBody.positionNedM[1] - previousPosition[1],
      rigidBody.positionNedM[2] - previousPosition[2]
    );
  const batteryRemainingWh = Math.max(
    0,
    state.batteryRemainingWh - (loads.diagnostics.powerW * stepS) / 3_600
  );
  let phase: InteractiveFlightState["phase"] = "flying";
  if (batteryRemainingWh <= 0) phase = "battery_depleted";
  if (rigidBody.positionNedM[2] >= 0) {
    const velocityNed = bodyToNed(rigidBody.velocityBodyMS, rigidBody.attitudeBodyToNed);
    const gentleContact =
      Math.hypot(velocityNed[0], velocityNed[1]) < 4 && Math.abs(velocityNed[2]) < 2.5;
    phase = gentleContact ? "landed" : "crashed";
    rigidBody = {
      ...rigidBody,
      positionNedM: [rigidBody.positionNedM[0], rigidBody.positionNedM[1], 0],
      velocityBodyMS: [0, 0, 0],
      angularRateBodyRadS: [0, 0, 0]
    };
  }

  const shouldSampleTrail = rigidBody.timeS - state.lastTrailTimeS >= 0.2;
  const trailNedM = shouldSampleTrail
    ? [...state.trailNedM, rigidBody.positionNedM].slice(-220)
    : state.trailNedM;
  return {
    rigidBody,
    phase,
    motorTiltRad,
    batteryRemainingWh,
    distanceTravelledM,
    activeWaypointIndex: resolved.waypointIndex,
    appliedControls: resolved.controls,
    diagnostics: loads.diagnostics,
    trailNedM,
    lastTrailTimeS: shouldSampleTrail ? rigidBody.timeS : state.lastTrailTimeS
  };
}

export function deriveFlightTelemetry(
  model: FlightModel,
  state: InteractiveFlightState
): FlightTelemetry {
  const attitude = quaternionToEuler(state.rigidBody.attitudeBodyToNed);
  const velocityNed = bodyToNed(state.rigidBody.velocityBodyMS, state.rigidBody.attitudeBodyToNed);
  return {
    ...state.diagnostics,
    timeS: state.rigidBody.timeS,
    altitudeM: Math.max(0, -state.rigidBody.positionNedM[2]),
    northM: state.rigidBody.positionNedM[0],
    eastM: state.rigidBody.positionNedM[1],
    verticalSpeedMS: -velocityNed[2],
    groundSpeedMS: Math.hypot(velocityNed[0], velocityNed[1]),
    rollRad: attitude.rollRad,
    pitchRad: attitude.pitchRad,
    headingRad: ((attitude.yawRad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
    batteryPercent: clamp((100 * state.batteryRemainingWh) / model.batteryEnergyWh, 0, 100),
    activeWaypointIndex: state.activeWaypointIndex,
    phase: state.phase
  };
}
