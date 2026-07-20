import type { Matrix3, Vector3 } from "@aerocel/math-core";
import { add3, cross3, rk4Step, scale3, subtract3 } from "@aerocel/math-core";
import { STANDARD_GRAVITY_M_S2 } from "@aerocel/unit-system";

export type Quaternion = readonly [number, number, number, number];

export interface SixDofState {
  readonly timeS: number;
  readonly positionNedM: Vector3;
  readonly velocityBodyMS: Vector3;
  readonly attitudeBodyToNed: Quaternion;
  readonly angularRateBodyRadS: Vector3;
}

export interface RigidBodyInput {
  readonly massKg: number;
  readonly inertiaBodyKgM2: Matrix3;
  readonly forceBodyN: Vector3;
  readonly momentBodyNm: Vector3;
}

const multiplyMatrixVector = (matrix: Matrix3, vector: Vector3): [number, number, number] => [
  matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
  matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
  matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2]
];

function inverseMatrix3(matrix: Matrix3): Matrix3 {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(determinant) < 1e-12) throw new Error("Inertia tensor is singular");
  return [
    (e * i - f * h) / determinant,
    (c * h - b * i) / determinant,
    (b * f - c * e) / determinant,
    (f * g - d * i) / determinant,
    (a * i - c * g) / determinant,
    (c * d - a * f) / determinant,
    (d * h - e * g) / determinant,
    (b * g - a * h) / determinant,
    (a * e - b * d) / determinant
  ];
}

function validateInertiaTensor(matrix: Matrix3): void {
  if (!matrix.every(Number.isFinite)) throw new Error("Inertia tensor must contain finite values");
  const tolerance = 1e-10;
  if (
    Math.abs(matrix[1] - matrix[3]) > tolerance ||
    Math.abs(matrix[2] - matrix[6]) > tolerance ||
    Math.abs(matrix[5] - matrix[7]) > tolerance
  ) {
    throw new Error("Inertia tensor must be symmetric");
  }
  const firstMinor = matrix[0];
  const secondMinor = matrix[0] * matrix[4] - matrix[1] ** 2;
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (firstMinor <= 0 || secondMinor <= 0 || determinant <= 0) {
    throw new Error("Inertia tensor must be positive definite");
  }
}

export function normalizeQuaternion(quaternion: Quaternion): Quaternion {
  const magnitude = Math.sqrt(quaternion.reduce((sum, value) => sum + value ** 2, 0));
  if (magnitude <= Number.EPSILON) throw new Error("Attitude quaternion cannot be zero");
  return quaternion.map((value) => value / magnitude) as unknown as Quaternion;
}

export function bodyToNed(vector: Vector3, quaternion: Quaternion): Vector3 {
  const [w, x, y, z] = normalizeQuaternion(quaternion);
  return [
    (1 - 2 * (y * y + z * z)) * vector[0] +
      2 * (x * y - z * w) * vector[1] +
      2 * (x * z + y * w) * vector[2],
    2 * (x * y + z * w) * vector[0] +
      (1 - 2 * (x * x + z * z)) * vector[1] +
      2 * (y * z - x * w) * vector[2],
    2 * (x * z - y * w) * vector[0] +
      2 * (y * z + x * w) * vector[1] +
      (1 - 2 * (x * x + y * y)) * vector[2]
  ];
}

export function nedToBody(vector: Vector3, quaternion: Quaternion): Vector3 {
  const [w, x, y, z] = normalizeQuaternion(quaternion);
  return bodyToNed(vector, [w, -x, -y, -z]);
}

function stateToArray(state: SixDofState): readonly number[] {
  return [
    ...state.positionNedM,
    ...state.velocityBodyMS,
    ...state.attitudeBodyToNed,
    ...state.angularRateBodyRadS
  ];
}

function arrayToState(values: readonly number[], timeS: number): SixDofState {
  return {
    timeS,
    positionNedM: [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0],
    velocityBodyMS: [values[3] ?? 0, values[4] ?? 0, values[5] ?? 0],
    attitudeBodyToNed: normalizeQuaternion([
      values[6] ?? 1,
      values[7] ?? 0,
      values[8] ?? 0,
      values[9] ?? 0
    ]),
    angularRateBodyRadS: [values[10] ?? 0, values[11] ?? 0, values[12] ?? 0]
  };
}

export function rigidBodyDerivative(state: SixDofState, input: RigidBodyInput): readonly number[] {
  if (
    !Number.isFinite(input.massKg) ||
    input.massKg <= 0 ||
    !input.forceBodyN.every(Number.isFinite) ||
    !input.momentBodyNm.every(Number.isFinite)
  ) {
    throw new Error("Rigid-body mass, forces, and moments must be finite and physically valid");
  }
  validateInertiaTensor(input.inertiaBodyKgM2);
  const gravityBody = nedToBody([0, 0, STANDARD_GRAVITY_M_S2], state.attitudeBodyToNed);
  const accelerationBody = subtract3(
    add3(scale3(input.forceBodyN, 1 / input.massKg), gravityBody),
    cross3(state.angularRateBodyRadS, state.velocityBodyMS)
  );
  const positionRateNed = bodyToNed(state.velocityBodyMS, state.attitudeBodyToNed);
  const [w, x, y, z] = state.attitudeBodyToNed;
  const [p, q, r] = state.angularRateBodyRadS;
  const quaternionRate: Quaternion = [
    -0.5 * (x * p + y * q + z * r),
    0.5 * (w * p + y * r - z * q),
    0.5 * (w * q + z * p - x * r),
    0.5 * (w * r + x * q - y * p)
  ];
  const angularMomentum = multiplyMatrixVector(input.inertiaBodyKgM2, state.angularRateBodyRadS);
  const angularAcceleration = multiplyMatrixVector(
    inverseMatrix3(input.inertiaBodyKgM2),
    subtract3(input.momentBodyNm, cross3(state.angularRateBodyRadS, angularMomentum))
  );
  return [...positionRateNed, ...accelerationBody, ...quaternionRate, ...angularAcceleration];
}

export function stepSixDof(state: SixDofState, input: RigidBodyInput, stepS: number): SixDofState {
  if (stepS <= 0) throw new Error("Simulation time step must be positive");
  const values = stateToArray(state);
  const integrated = rk4Step(values, state.timeS, stepS, (candidate) =>
    rigidBodyDerivative(arrayToState(candidate, state.timeS), input)
  );
  return arrayToState(integrated, state.timeS + stepS);
}

export interface TrimInput {
  readonly massKg: number;
  readonly densityKgM3: number;
  readonly airspeedMS: number;
  readonly wingAreaM2: number;
  readonly liftSlopePerRad: number;
  readonly zeroLiftAngleRad: number;
  readonly zeroLiftDragCoefficient: number;
  readonly inducedDragFactor: number;
  readonly maximumLiftCoefficient: number;
}

export interface TrimResult {
  readonly angleOfAttackRad: number;
  readonly liftCoefficient: number;
  readonly dragCoefficient: number;
  readonly requiredThrustN: number;
  readonly converged: boolean;
  readonly warnings: readonly string[];
  readonly fidelity: "linear_longitudinal_trim";
}

export function solveStraightLevelTrim(input: TrimInput): TrimResult {
  const dynamicPressure = 0.5 * input.densityKgM3 * input.airspeedMS ** 2;
  if (
    !Object.values(input).every(Number.isFinite) ||
    input.massKg <= 0 ||
    dynamicPressure <= 0 ||
    input.wingAreaM2 <= 0 ||
    input.liftSlopePerRad <= 0 ||
    input.zeroLiftDragCoefficient < 0 ||
    input.inducedDragFactor < 0 ||
    input.maximumLiftCoefficient <= 0
  ) {
    throw new Error(
      "Trim requires finite, physically valid mass, flow, polar, and geometry inputs"
    );
  }
  const liftCoefficient =
    (input.massKg * STANDARD_GRAVITY_M_S2) / (dynamicPressure * input.wingAreaM2);
  const angleOfAttackRad = input.zeroLiftAngleRad + liftCoefficient / input.liftSlopePerRad;
  const dragCoefficient =
    input.zeroLiftDragCoefficient + input.inducedDragFactor * liftCoefficient ** 2;
  const warnings: string[] = [];
  const converged = liftCoefficient <= input.maximumLiftCoefficient;
  if (!converged)
    warnings.push("Required lift coefficient exceeds the configured attached-flow maximum");
  return {
    angleOfAttackRad,
    liftCoefficient,
    dragCoefficient,
    requiredThrustN: dynamicPressure * input.wingAreaM2 * dragCoefficient,
    converged,
    warnings,
    fidelity: "linear_longitudinal_trim"
  };
}

export interface TransitionSchedulePoint {
  readonly timeS: number;
  readonly tiltRad: number;
  readonly thrustFraction: number;
}

export interface TransitionInput {
  readonly massKg: number;
  readonly wingAreaM2: number;
  readonly densityKgM3: number;
  readonly maximumTotalThrustN: number;
  readonly maximumPowerW: number;
  readonly initialAltitudeM: number;
  readonly initialAirspeedMS: number;
  readonly durationS: number;
  readonly stepS: number;
  readonly tiltRateLimitRadS: number;
  readonly liftSlopePerRad: number;
  readonly assumedAngleOfAttackRad: number;
  readonly maximumLiftCoefficient: number;
  readonly zeroLiftDragCoefficient: number;
  readonly inducedDragFactor: number;
  readonly schedule: readonly TransitionSchedulePoint[];
  readonly failedMotorFraction?: number;
  readonly jammedTiltRad?: number;
}

export interface TransitionPoint {
  readonly timeS: number;
  readonly altitudeM: number;
  readonly airspeedMS: number;
  readonly verticalSpeedMS: number;
  readonly tiltRad: number;
  readonly thrustN: number;
  readonly liftN: number;
  readonly dragN: number;
  readonly powerW: number;
  readonly stallMargin: number;
}

export interface TransitionResult {
  readonly points: readonly TransitionPoint[];
  readonly minimumAltitudeM: number;
  readonly altitudeLossM: number;
  readonly finalAirspeedMS: number;
  readonly peakPowerW: number;
  readonly completed: boolean;
  readonly failures: readonly string[];
  readonly fidelity: "reduced_order_transition";
  readonly quality: "preliminary";
}

function interpolateSchedule(
  schedule: readonly TransitionSchedulePoint[],
  timeS: number
): TransitionSchedulePoint {
  const ordered = [...schedule].sort((left, right) => left.timeS - right.timeS);
  if (ordered.length < 2) throw new Error("Transition schedule requires at least two points");
  const first = ordered[0] as TransitionSchedulePoint;
  const last = ordered.at(-1) as TransitionSchedulePoint;
  if (timeS <= first.timeS) return first;
  if (timeS >= last.timeS) return last;
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const left = ordered[index] as TransitionSchedulePoint;
    const right = ordered[index + 1] as TransitionSchedulePoint;
    if (timeS >= left.timeS && timeS <= right.timeS) {
      const fraction = (timeS - left.timeS) / (right.timeS - left.timeS);
      return {
        timeS,
        tiltRad: left.tiltRad + (right.tiltRad - left.tiltRad) * fraction,
        thrustFraction:
          left.thrustFraction + (right.thrustFraction - left.thrustFraction) * fraction
      };
    }
  }
  return last;
}

export function simulateTransition(input: TransitionInput): TransitionResult {
  const scalarInputs = [
    input.massKg,
    input.wingAreaM2,
    input.densityKgM3,
    input.maximumTotalThrustN,
    input.maximumPowerW,
    input.initialAltitudeM,
    input.initialAirspeedMS,
    input.durationS,
    input.stepS,
    input.tiltRateLimitRadS,
    input.liftSlopePerRad,
    input.assumedAngleOfAttackRad,
    input.maximumLiftCoefficient,
    input.zeroLiftDragCoefficient,
    input.inducedDragFactor,
    input.failedMotorFraction,
    input.jammedTiltRad
  ].filter((value): value is number => value !== undefined);
  const orderedSchedule = [...input.schedule].sort((left, right) => left.timeS - right.timeS);
  if (
    !scalarInputs.every(Number.isFinite) ||
    input.massKg <= 0 ||
    input.wingAreaM2 <= 0 ||
    input.densityKgM3 <= 0 ||
    input.stepS <= 0 ||
    input.durationS <= 0 ||
    input.maximumTotalThrustN < 0 ||
    input.maximumPowerW < 0 ||
    input.initialAirspeedMS < 0 ||
    input.tiltRateLimitRadS <= 0 ||
    input.liftSlopePerRad <= 0 ||
    input.maximumLiftCoefficient <= 0 ||
    input.zeroLiftDragCoefficient < 0 ||
    input.inducedDragFactor < 0 ||
    (input.failedMotorFraction !== undefined &&
      (input.failedMotorFraction < 0 || input.failedMotorFraction > 1)) ||
    (input.jammedTiltRad !== undefined &&
      (input.jammedTiltRad < 0 || input.jammedTiltRad > Math.PI / 2))
  ) {
    throw new Error("Transition inputs must be finite and physically valid");
  }
  if (
    orderedSchedule.length < 2 ||
    orderedSchedule.some(
      (point, index) =>
        !Object.values(point).every(Number.isFinite) ||
        point.tiltRad < 0 ||
        point.tiltRad > Math.PI / 2 ||
        point.thrustFraction < 0 ||
        point.thrustFraction > 1 ||
        (index > 0 && point.timeS <= (orderedSchedule[index - 1]?.timeS ?? point.timeS))
    ) ||
    (orderedSchedule[0]?.timeS ?? Infinity) > 0 ||
    (orderedSchedule.at(-1)?.timeS ?? -Infinity) < input.durationS
  ) {
    throw new Error("Transition schedule must be finite, strictly increasing, and cover the run");
  }
  let altitudeM = input.initialAltitudeM;
  let airspeedMS = input.initialAirspeedMS;
  let verticalSpeedMS = 0;
  let tiltRad = input.jammedTiltRad ?? interpolateSchedule(orderedSchedule, 0).tiltRad;
  let minimumAltitudeM = altitudeM;
  let peakPowerW = 0;
  const points: TransitionPoint[] = [];
  const motorAvailability = 1 - Math.min(1, Math.max(0, input.failedMotorFraction ?? 0));

  let timeS = 0;
  while (true) {
    const command = interpolateSchedule(orderedSchedule, timeS);
    const thrustN =
      input.maximumTotalThrustN *
      Math.min(1, Math.max(0, command.thrustFraction)) *
      motorAvailability;
    const dynamicPressure = 0.5 * input.densityKgM3 * airspeedMS ** 2;
    const unclippedCl = input.liftSlopePerRad * input.assumedAngleOfAttackRad;
    const cl = Math.min(
      input.maximumLiftCoefficient,
      Math.max(-input.maximumLiftCoefficient, unclippedCl)
    );
    const cd = input.zeroLiftDragCoefficient + input.inducedDragFactor * cl ** 2;
    const liftN = dynamicPressure * input.wingAreaM2 * cl;
    const dragN = dynamicPressure * input.wingAreaM2 * cd;
    const forwardThrustN = thrustN * Math.cos(tiltRad);
    const upwardThrustN = thrustN * Math.sin(tiltRad);
    const horizontalAccelerationMS2 = (forwardThrustN - dragN) / input.massKg;
    const verticalAccelerationMS2 =
      (upwardThrustN + liftN - input.massKg * STANDARD_GRAVITY_M_S2) / input.massKg;
    const powerW =
      input.maximumTotalThrustN > 0
        ? input.maximumPowerW * (thrustN / input.maximumTotalThrustN) ** 1.5
        : 0;
    minimumAltitudeM = Math.min(minimumAltitudeM, altitudeM);
    peakPowerW = Math.max(peakPowerW, powerW);
    points.push({
      timeS,
      altitudeM,
      airspeedMS,
      verticalSpeedMS,
      tiltRad,
      thrustN,
      liftN,
      dragN,
      powerW,
      stallMargin: input.maximumLiftCoefficient - Math.abs(unclippedCl)
    });

    if (timeS >= input.durationS) break;
    const integrationStepS = Math.min(input.stepS, input.durationS - timeS);
    airspeedMS = Math.max(0, airspeedMS + horizontalAccelerationMS2 * integrationStepS);
    verticalSpeedMS += verticalAccelerationMS2 * integrationStepS;
    altitudeM += verticalSpeedMS * integrationStepS;
    minimumAltitudeM = Math.min(minimumAltitudeM, altitudeM);

    const nextTimeS = timeS + integrationStepS;
    const nextCommand = interpolateSchedule(orderedSchedule, nextTimeS);
    const desiredTilt = input.jammedTiltRad ?? nextCommand.tiltRad;
    const maximumTiltStep = input.tiltRateLimitRadS * integrationStepS;
    tiltRad += Math.max(-maximumTiltStep, Math.min(maximumTiltStep, desiredTilt - tiltRad));
    timeS = nextTimeS;
  }

  const failures: string[] = [];
  if (minimumAltitudeM <= 0) failures.push("Ground contact occurred before transition completion");
  if (input.failedMotorFraction !== undefined && input.failedMotorFraction > 0) {
    failures.push(
      `${(input.failedMotorFraction * 100).toFixed(0)}% of nominal thrust was unavailable`
    );
  }
  if (input.jammedTiltRad !== undefined)
    failures.push("Tilt mechanism remained at its jammed angle");
  if (points.some((point) => point.stallMargin < 0)) {
    failures.push("The assumed wing angle exceeded a positive or negative attached-flow CL limit");
  }

  return {
    points,
    minimumAltitudeM,
    altitudeLossM: input.initialAltitudeM - minimumAltitudeM,
    finalAirspeedMS: airspeedMS,
    peakPowerW,
    completed: failures.length === 0,
    failures,
    fidelity: "reduced_order_transition",
    quality: "preliminary"
  };
}

export interface SensorNoiseInput {
  readonly truth: number;
  readonly bias: number;
  readonly noiseStandardDeviation: number;
  readonly saturationMinimum: number;
  readonly saturationMaximum: number;
  readonly seed: number;
  readonly sampleIndex: number;
}

function deterministicUniform(seed: number): number {
  let value = seed | 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 4_294_967_296;
}

export function simulateSensorSample(input: SensorNoiseInput): number {
  const first = Math.max(1e-12, deterministicUniform(input.seed + input.sampleIndex * 2));
  const second = deterministicUniform(input.seed + input.sampleIndex * 2 + 1);
  const gaussian = Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
  const value = input.truth + input.bias + gaussian * input.noiseStandardDeviation;
  return Math.min(input.saturationMaximum, Math.max(input.saturationMinimum, value));
}
