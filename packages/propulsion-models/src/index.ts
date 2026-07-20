import type { Vector3 } from "@aerocel/math-core";
import { cross3, scale3 } from "@aerocel/math-core";

export interface P0ThrustState {
  readonly thrustN: number;
  readonly torqueNm: number;
}

export function stepSimpleThrustSource(
  state: P0ThrustState,
  command: number,
  maximumThrustN: number,
  maximumTorqueNm: number,
  responseTimeS: number,
  stepS: number
): P0ThrustState {
  if (maximumThrustN < 0 || maximumTorqueNm < 0 || responseTimeS <= 0 || stepS <= 0) {
    throw new Error("P0 source limits and time values must be valid and positive");
  }
  const boundedCommand = Math.min(1, Math.max(0, command));
  const blend = 1 - Math.exp(-stepS / responseTimeS);
  return {
    thrustN: state.thrustN + (boundedCommand * maximumThrustN - state.thrustN) * blend,
    torqueNm: state.torqueNm + (boundedCommand * maximumTorqueNm - state.torqueNm) * blend
  };
}

export interface ManufacturerSample {
  readonly command: number;
  readonly rpm: number;
  readonly thrustN: number;
  readonly torqueNm: number;
  readonly currentA: number;
}

export interface InterpolatedManufacturerPoint extends ManufacturerSample {
  readonly provenance: "interpolated" | "extrapolated";
}

export function interpolateManufacturerData(
  samples: readonly ManufacturerSample[],
  command: number
): InterpolatedManufacturerPoint {
  if (samples.length < 2) throw new Error("At least two manufacturer samples are required");
  const sorted = [...samples].sort((left, right) => left.command - right.command);
  const lowerBound = sorted[0];
  const upperBound = sorted.at(-1);
  if (lowerBound === undefined || upperBound === undefined)
    throw new Error("Manufacturer data is empty");
  const extrapolated = command < lowerBound.command || command > upperBound.command;
  let lower = lowerBound;
  let upper = upperBound;
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    if (
      current !== undefined &&
      next !== undefined &&
      command >= current.command &&
      command <= next.command
    ) {
      lower = current;
      upper = next;
      break;
    }
  }
  if (command < lowerBound.command) {
    lower = sorted[0] as ManufacturerSample;
    upper = sorted[1] as ManufacturerSample;
  } else if (command > upperBound.command) {
    lower = sorted.at(-2) as ManufacturerSample;
    upper = upperBound;
  }
  const span = upper.command - lower.command;
  if (Math.abs(span) <= Number.EPSILON)
    throw new Error("Manufacturer command samples must be unique");
  const fraction = (command - lower.command) / span;
  const interpolate = (left: number, right: number): number => left + (right - left) * fraction;
  return {
    command,
    rpm: interpolate(lower.rpm, upper.rpm),
    thrustN: interpolate(lower.thrustN, upper.thrustN),
    torqueNm: interpolate(lower.torqueNm, upper.torqueNm),
    currentA: interpolate(lower.currentA, upper.currentA),
    provenance: extrapolated ? "extrapolated" : "interpolated"
  };
}

export interface BladeStation {
  readonly radiusM: number;
  readonly chordM: number;
  readonly twistRad: number;
  readonly liftCurveSlopePerRad: number;
  readonly zeroLiftAngleRad: number;
  readonly cd0: number;
  readonly inducedDragFactor: number;
}

export interface BemtInput {
  readonly bladeCount: number;
  readonly diameterM: number;
  readonly hubRadiusM: number;
  readonly stations: readonly BladeStation[];
  readonly rpm: number;
  readonly axialVelocityMS: number;
  readonly densityKgM3: number;
  readonly speedOfSoundMS: number;
  readonly rotation: "CW" | "CCW";
}

export interface BemtResult {
  readonly thrustN: number;
  readonly torqueNm: number;
  readonly shaftPowerW: number;
  readonly advanceRatio: number;
  readonly coefficientThrust: number;
  readonly coefficientTorque: number;
  readonly coefficientPower: number;
  readonly propulsiveEfficiency: number | null;
  readonly inducedVelocityMS: number;
  readonly tipMach: number;
  readonly converged: boolean;
  readonly iterations: number;
  readonly warnings: readonly string[];
  readonly fidelity: "P2_BEMT";
}

export function solveBemt(input: BemtInput): BemtResult {
  if (input.bladeCount < 1 || input.diameterM <= 0 || input.rpm < 0 || input.densityKgM3 <= 0) {
    throw new Error("BEMT geometry, RPM, and density inputs are invalid");
  }
  const stations = [...input.stations].sort((left, right) => left.radiusM - right.radiusM);
  if (stations.length < 2) throw new Error("BEMT requires at least two radial stations");
  const radius = input.diameterM / 2;
  if (stations[0]?.radiusM !== undefined && stations[0].radiusM < input.hubRadiusM) {
    throw new Error("A blade station lies inside the hub radius");
  }
  if ((stations.at(-1)?.radiusM ?? Infinity) > radius) {
    throw new Error("A blade station lies outside the propeller radius");
  }

  const omega = (input.rpm * 2 * Math.PI) / 60;
  const diskArea = Math.PI * radius ** 2;
  let inducedVelocityMS = 0;
  let thrustN = 0;
  let torqueMagnitudeNm = 0;
  let converged = false;
  let iterations = 0;

  for (iterations = 1; iterations <= 80; iterations += 1) {
    thrustN = 0;
    torqueMagnitudeNm = 0;
    for (let index = 0; index < stations.length - 1; index += 1) {
      const inner = stations[index];
      const outer = stations[index + 1];
      if (inner === undefined || outer === undefined) continue;
      const radialWidth = outer.radiusM - inner.radiusM;
      if (radialWidth <= 0)
        throw new Error("BEMT radial stations must have unique increasing radii");
      const radialPosition = (inner.radiusM + outer.radiusM) / 2;
      const chordM = (inner.chordM + outer.chordM) / 2;
      const twistRad = (inner.twistRad + outer.twistRad) / 2;
      const liftSlope = (inner.liftCurveSlopePerRad + outer.liftCurveSlopePerRad) / 2;
      const zeroLift = (inner.zeroLiftAngleRad + outer.zeroLiftAngleRad) / 2;
      const cd0 = (inner.cd0 + outer.cd0) / 2;
      const inducedDrag = (inner.inducedDragFactor + outer.inducedDragFactor) / 2;
      const tangentialVelocity = omega * radialPosition;
      const axialVelocity = input.axialVelocityMS + inducedVelocityMS;
      const relativeSpeedSquared = tangentialVelocity ** 2 + axialVelocity ** 2;
      const inflowAngle = Math.atan2(axialVelocity, Math.max(tangentialVelocity, 1e-9));
      const angleOfAttack = twistRad - inflowAngle;
      const cl = Math.max(-1.6, Math.min(1.6, liftSlope * (angleOfAttack - zeroLift)));
      const cd = cd0 + inducedDrag * cl ** 2;
      const dynamicPressure = 0.5 * input.densityKgM3 * relativeSpeedSquared;
      const differentialLift = dynamicPressure * chordM * cl * radialWidth;
      const differentialDrag = dynamicPressure * chordM * cd * radialWidth;
      const sinePhi = Math.sin(Math.abs(inflowAngle));
      const tipExponent =
        sinePhi > 1e-6
          ? (-input.bladeCount / 2) * ((radius - radialPosition) / (radialPosition * sinePhi))
          : -100;
      const tipLoss = Math.max(0.05, (2 / Math.PI) * Math.acos(Math.min(1, Math.exp(tipExponent))));
      const differentialThrust =
        input.bladeCount *
        tipLoss *
        (differentialLift * Math.cos(inflowAngle) - differentialDrag * Math.sin(inflowAngle));
      const differentialTorque =
        input.bladeCount *
        tipLoss *
        radialPosition *
        (differentialLift * Math.sin(inflowAngle) + differentialDrag * Math.cos(inflowAngle));
      thrustN += differentialThrust;
      torqueMagnitudeNm += differentialTorque;
    }

    const discriminant = Math.max(
      0,
      input.axialVelocityMS ** 2 + (2 * Math.max(0, thrustN)) / (input.densityKgM3 * diskArea)
    );
    const momentumVelocity = (-input.axialVelocityMS + Math.sqrt(discriminant)) / 2;
    const updated = inducedVelocityMS * 0.65 + momentumVelocity * 0.35;
    if (Math.abs(updated - inducedVelocityMS) < 1e-5) {
      inducedVelocityMS = updated;
      converged = true;
      break;
    }
    inducedVelocityMS = updated;
  }

  const rotationsPerSecond = input.rpm / 60;
  const torqueSign = input.rotation === "CW" ? -1 : 1;
  const torqueNm = torqueMagnitudeNm * torqueSign;
  const shaftPowerW = torqueMagnitudeNm * omega;
  const denominatorThrust = input.densityKgM3 * rotationsPerSecond ** 2 * input.diameterM ** 4;
  const denominatorTorque = input.densityKgM3 * rotationsPerSecond ** 2 * input.diameterM ** 5;
  const coefficientThrust = rotationsPerSecond > 0 ? thrustN / denominatorThrust : 0;
  const coefficientTorque = rotationsPerSecond > 0 ? torqueMagnitudeNm / denominatorTorque : 0;
  const coefficientPower = 2 * Math.PI * coefficientTorque;
  const advanceRatio =
    rotationsPerSecond > 0 ? input.axialVelocityMS / (rotationsPerSecond * input.diameterM) : 0;
  const propulsiveEfficiency =
    shaftPowerW > 0 && input.axialVelocityMS > 0
      ? Math.max(0, (thrustN * input.axialVelocityMS) / shaftPowerW)
      : null;
  const tipMach =
    Math.sqrt((omega * radius) ** 2 + input.axialVelocityMS ** 2) / input.speedOfSoundMS;
  const warnings: string[] = [];
  if (!converged) warnings.push("Induced-velocity iteration did not converge within 80 iterations");
  if (tipMach > 0.75)
    warnings.push(
      "Tip Mach exceeds 0.75; this incompressible BEMT model is outside its preferred range"
    );
  if (Math.abs(advanceRatio) > 1.5)
    warnings.push("Advance ratio is outside the default validation envelope");

  return {
    thrustN,
    torqueNm,
    shaftPowerW,
    advanceRatio,
    coefficientThrust,
    coefficientTorque,
    coefficientPower,
    propulsiveEfficiency,
    inducedVelocityMS,
    tipMach,
    converged,
    iterations,
    warnings,
    fidelity: "P2_BEMT"
  };
}

export interface MotorInput {
  readonly kvRpmPerVolt: number;
  readonly windingResistanceOhm: number;
  readonly noLoadCurrentA: number;
  readonly maximumCurrentA: number;
  readonly escEfficiency: number;
}

export interface MotorOperatingPoint {
  readonly rpm: number;
  readonly currentA: number;
  readonly torqueNm: number;
  readonly electricalPowerW: number;
  readonly mechanicalPowerW: number;
  readonly efficiency: number;
  readonly currentLimited: boolean;
}

export function evaluateMotor(
  motor: MotorInput,
  busVoltageV: number,
  command: number,
  rpm: number
): MotorOperatingPoint {
  if (motor.kvRpmPerVolt <= 0 || motor.windingResistanceOhm <= 0 || busVoltageV < 0) {
    throw new Error("Motor electrical inputs are invalid");
  }
  const boundedCommand = Math.min(1, Math.max(0, command));
  const appliedVoltage = busVoltageV * boundedCommand * motor.escEfficiency;
  const backEmfV = rpm / motor.kvRpmPerVolt;
  const rawCurrentA = Math.max(0, (appliedVoltage - backEmfV) / motor.windingResistanceOhm);
  const currentA = Math.min(rawCurrentA, motor.maximumCurrentA);
  const torqueConstantNmA = 60 / (2 * Math.PI * motor.kvRpmPerVolt);
  const torqueNm = Math.max(0, (currentA - motor.noLoadCurrentA) * torqueConstantNmA);
  const mechanicalPowerW = torqueNm * ((rpm * 2 * Math.PI) / 60);
  const electricalPowerW = busVoltageV * currentA;
  return {
    rpm,
    currentA,
    torqueNm,
    electricalPowerW,
    mechanicalPowerW,
    efficiency: electricalPowerW > 0 ? Math.min(1, mechanicalPowerW / electricalPowerW) : 0,
    currentLimited: rawCurrentA > motor.maximumCurrentA
  };
}

export interface BatteryInput {
  readonly series: number;
  readonly parallel: number;
  readonly cellOpenCircuitVoltageV: number;
  readonly cellInternalResistanceOhm: number;
  readonly stateOfCharge: number;
  readonly capacityAh: number;
  readonly maximumContinuousCurrentA: number;
}

export interface BatteryOperatingPoint {
  readonly busVoltageV: number;
  readonly openCircuitVoltageV: number;
  readonly packResistanceOhm: number;
  readonly currentA: number;
  readonly powerW: number;
  readonly remainingEnergyWhApprox: number;
  readonly currentMarginA: number;
  readonly brownoutRisk: boolean;
  readonly fidelity: "equivalent_circuit";
}

export function evaluateBattery(
  battery: BatteryInput,
  loadCurrentA: number,
  minimumBusVoltageV: number
): BatteryOperatingPoint {
  if (battery.series < 1 || battery.parallel < 1 || battery.capacityAh <= 0 || loadCurrentA < 0) {
    throw new Error("Battery topology, capacity, and current must be valid");
  }
  const stateOfCharge = Math.min(1, Math.max(0, battery.stateOfCharge));
  const openCircuitVoltageV = battery.series * battery.cellOpenCircuitVoltageV;
  const packResistanceOhm = (battery.series * battery.cellInternalResistanceOhm) / battery.parallel;
  const busVoltageV = Math.max(0, openCircuitVoltageV - loadCurrentA * packResistanceOhm);
  return {
    busVoltageV,
    openCircuitVoltageV,
    packResistanceOhm,
    currentA: loadCurrentA,
    powerW: busVoltageV * loadCurrentA,
    remainingEnergyWhApprox:
      openCircuitVoltageV * battery.capacityAh * battery.parallel * stateOfCharge,
    currentMarginA: battery.maximumContinuousCurrentA - loadCurrentA,
    brownoutRisk: busVoltageV < minimumBusVoltageV,
    fidelity: "equivalent_circuit"
  };
}

export interface SlipstreamResult {
  readonly diskVelocityMS: number;
  readonly farWakeVelocityMS: number;
  readonly contractionRatio: number;
  readonly dynamicPressureMultiplier: number;
  readonly fidelity: "momentum_theory";
}

export function estimateSlipstream(
  thrustN: number,
  diameterM: number,
  densityKgM3: number,
  freeStreamVelocityMS: number
): SlipstreamResult {
  if (diameterM <= 0 || densityKgM3 <= 0 || thrustN < 0) {
    throw new Error("Slipstream input is outside the momentum-theory domain");
  }
  const diskArea = Math.PI * (diameterM / 2) ** 2;
  const inducedVelocity =
    (-freeStreamVelocityMS +
      Math.sqrt(freeStreamVelocityMS ** 2 + (2 * thrustN) / (densityKgM3 * diskArea))) /
    2;
  const diskVelocityMS = freeStreamVelocityMS + inducedVelocity;
  const farWakeVelocityMS = freeStreamVelocityMS + 2 * inducedVelocity;
  return {
    diskVelocityMS,
    farWakeVelocityMS,
    contractionRatio: diskVelocityMS > 0 ? Math.sqrt(diskVelocityMS / farWakeVelocityMS) : 1,
    dynamicPressureMultiplier:
      freeStreamVelocityMS > 0 ? (diskVelocityMS / freeStreamVelocityMS) ** 2 : Infinity,
    fidelity: "momentum_theory"
  };
}

export function gyroscopicMoment(
  bodyAngularRateRadS: Vector3,
  rotorAxisBody: Vector3,
  rotorAngularMomentumKgM2S: number,
  rotation: "CW" | "CCW"
): Vector3 {
  const sign = rotation === "CW" ? -1 : 1;
  const angularMomentum = scale3(rotorAxisBody, rotorAngularMomentumKgM2S * sign);
  return cross3(bodyAngularRateRadS, angularMomentum);
}
