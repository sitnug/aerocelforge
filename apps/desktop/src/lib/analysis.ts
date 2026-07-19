import {
  analyzeComponentBuildup,
  calculateGlideEnvelope,
  isaAtmosphere,
  type AnalyticalAeroResult,
  type GlideEnvelope
} from "@aerocel/aero-models";
import {
  simulateTransition,
  solveStraightLevelTrim,
  type TransitionResult
} from "@aerocel/flight-dynamics";
import { combineMassProperties, type CombinedMassProperties } from "@aerocel/geometry-core";
import { gridSearch, paretoFront, type DesignEvaluation } from "@aerocel/optimization";
import {
  evaluateBattery,
  estimateSlipstream,
  solveBemt,
  type BatteryOperatingPoint,
  type BemtResult,
  type SlipstreamResult
} from "@aerocel/propulsion-models";
import type { AerocelProject } from "@aerocel/simulation-schema";

export interface RapidAnalysis {
  readonly mass: CombinedMassProperties;
  readonly atmosphere: ReturnType<typeof isaAtmosphere>;
  readonly designPoint: AnalyticalAeroResult;
  readonly polar: readonly {
    readonly alphaDeg: number;
    readonly cl: number;
    readonly cd: number;
    readonly cm: number;
  }[];
  readonly glide: GlideEnvelope;
  readonly trim: ReturnType<typeof solveStraightLevelTrim>;
  readonly propeller: BemtResult;
  readonly battery: BatteryOperatingPoint;
  readonly slipstream: SlipstreamResult;
  readonly transition: TransitionResult;
  readonly optimization: readonly DesignEvaluation[];
  readonly pareto: readonly DesignEvaluation[];
}

export interface AnalysisOptions {
  readonly airspeedMS: number;
  readonly angleOfAttackDeg: number;
  readonly propellerRpm: number;
  readonly failedMotorFraction: number;
  readonly jammedTiltDeg: number | null;
}

export const defaultAnalysisOptions: AnalysisOptions = {
  airspeedMS: 22,
  angleOfAttackDeg: 4,
  propellerRpm: 6_800,
  failedMotorFraction: 0,
  jammedTiltDeg: null
};

const inputForAero = (project: AerocelProject, airspeedMS: number, angleOfAttackDeg: number) => ({
  wingAreaM2: project.vehicle.reference.areaM2,
  wingSpanM: project.vehicle.reference.spanM,
  meanChordM: project.vehicle.reference.chordM,
  massKg: project.vehicle.components.reduce(
    (sum, component) => sum + (component.mass?.valueKg ?? 0),
    0
  ),
  airspeedMS,
  angleOfAttackRad: (angleOfAttackDeg * Math.PI) / 180,
  sideslipRad: 0,
  altitudeM: project.environment.altitudeM,
  zeroLiftAngleRad: (-2 * Math.PI) / 180,
  sectionLiftSlopePerRad: 2 * Math.PI,
  oswaldEfficiency: 0.82,
  zeroLiftDragCoefficient: 0.034,
  pitchingMomentZero: 0.015,
  pitchingMomentSlopePerRad: -0.72,
  sideForceSlopePerRad: -0.8,
  stallAnglePositiveRad: (13 * Math.PI) / 180,
  maximumLiftCoefficient: 1.35
});

export function runRapidAnalysis(project: AerocelProject, options: AnalysisOptions): RapidAnalysis {
  const masses = project.vehicle.components.flatMap((component) =>
    component.mass === null
      ? []
      : [
          {
            id: component.id,
            massKg: component.mass.valueKg,
            positionM: [
              component.transform.translationM[0] + component.mass.cgLocalM[0],
              component.transform.translationM[1] + component.mass.cgLocalM[1],
              component.transform.translationM[2] + component.mass.cgLocalM[2]
            ] as const,
            inertiaAtCgKgM2: component.mass.inertiaKgM2,
            uncertaintyKg: component.mass.uncertaintyKg
          }
        ]
  );
  const mass = combineMassProperties(masses);
  const atmosphere = isaAtmosphere(
    project.environment.altitudeM,
    project.environment.temperatureK ?? undefined
  );
  const designPoint = analyzeComponentBuildup(
    inputForAero(project, options.airspeedMS, options.angleOfAttackDeg)
  );
  const polar = Array.from({ length: 23 }, (_, index) => -8 + index).map((alphaDeg) => {
    const result = analyzeComponentBuildup(inputForAero(project, options.airspeedMS, alphaDeg));
    return {
      alphaDeg,
      cl: result.coefficients.cl,
      cd: result.coefficients.cd,
      cm: result.coefficients.cm
    };
  });
  const aspectRatio = project.vehicle.reference.spanM ** 2 / project.vehicle.reference.areaM2;
  const inducedDragFactor = 1 / (Math.PI * 0.82 * aspectRatio);
  const glide = calculateGlideEnvelope({
    massKg: mass.massKg,
    wingAreaM2: project.vehicle.reference.areaM2,
    densityKgM3: atmosphere.densityKgM3,
    maximumLiftCoefficient: 1.35,
    zeroLiftDragCoefficient: 0.034,
    inducedDragFactor
  });
  const trim = solveStraightLevelTrim({
    massKg: mass.massKg,
    densityKgM3: atmosphere.densityKgM3,
    airspeedMS: options.airspeedMS,
    wingAreaM2: project.vehicle.reference.areaM2,
    liftSlopePerRad: designPoint.finiteWingLiftSlopePerRad,
    zeroLiftAngleRad: (-2 * Math.PI) / 180,
    zeroLiftDragCoefficient: 0.034,
    inducedDragFactor,
    maximumLiftCoefficient: 1.35
  });
  const diameterM = project.vehicle.propulsionUnits[0]?.diameterM ?? 0.43;
  const radius = diameterM / 2;
  const propeller = solveBemt({
    bladeCount: 2,
    diameterM,
    hubRadiusM: radius * 0.18,
    rpm: options.propellerRpm,
    axialVelocityMS: Math.max(0, options.airspeedMS * 0.25),
    densityKgM3: atmosphere.densityKgM3,
    speedOfSoundMS: atmosphere.speedOfSoundMS,
    rotation: "CW",
    stations: [
      {
        radiusM: radius * 0.19,
        chordM: radius * 0.18,
        twistRad: 0.5,
        liftCurveSlopePerRad: 5.7,
        zeroLiftAngleRad: -0.03,
        cd0: 0.018,
        inducedDragFactor: 0.02
      },
      {
        radiusM: radius * 0.56,
        chordM: radius * 0.14,
        twistRad: 0.33,
        liftCurveSlopePerRad: 5.7,
        zeroLiftAngleRad: -0.03,
        cd0: 0.016,
        inducedDragFactor: 0.02
      },
      {
        radiusM: radius * 0.98,
        chordM: radius * 0.08,
        twistRad: 0.2,
        liftCurveSlopePerRad: 5.7,
        zeroLiftAngleRad: -0.03,
        cd0: 0.015,
        inducedDragFactor: 0.02
      }
    ]
  });
  const estimatedMotorCurrentA = Math.min(
    120,
    Math.max(0, (propeller.shaftPowerW * 3) / (22.2 * 0.86))
  );
  const batteryInput = project.vehicle.batteries[0];
  if (batteryInput === undefined) throw new Error("Rapid analysis requires a configured battery");
  const battery = evaluateBattery(
    {
      series: batteryInput.series,
      parallel: batteryInput.parallel,
      cellOpenCircuitVoltageV: batteryInput.cellOpenCircuitVoltageV,
      cellInternalResistanceOhm: batteryInput.cellInternalResistanceOhm,
      stateOfCharge: batteryInput.stateOfCharge,
      capacityAh: batteryInput.capacityAh,
      maximumContinuousCurrentA: batteryInput.maxContinuousCurrentA
    },
    estimatedMotorCurrentA,
    batteryInput.series * 3.2
  );
  const slipstream = estimateSlipstream(
    Math.max(0, propeller.thrustN),
    diameterM,
    atmosphere.densityKgM3,
    Math.max(0, options.airspeedMS * 0.25)
  );
  const transition = simulateTransition({
    massKg: mass.massKg,
    wingAreaM2: project.vehicle.reference.areaM2,
    densityKgM3: atmosphere.densityKgM3,
    maximumTotalThrustN: mass.massKg * 9.80665 * 1.55,
    maximumPowerW: 3_900,
    initialAltitudeM: 40,
    initialAirspeedMS: 0,
    durationS: 9,
    stepS: 0.05,
    tiltRateLimitRadS: 0.5,
    liftSlopePerRad: designPoint.finiteWingLiftSlopePerRad,
    assumedAngleOfAttackRad: (6 * Math.PI) / 180,
    maximumLiftCoefficient: 1.35,
    zeroLiftDragCoefficient: 0.034,
    inducedDragFactor,
    failedMotorFraction: options.failedMotorFraction,
    ...(options.jammedTiltDeg === null
      ? {}
      : { jammedTiltRad: (options.jammedTiltDeg * Math.PI) / 180 }),
    schedule: [
      { timeS: 0, tiltRad: Math.PI / 2, thrustFraction: 0.7 },
      { timeS: 2, tiltRad: (75 * Math.PI) / 180, thrustFraction: 0.76 },
      { timeS: 6, tiltRad: (25 * Math.PI) / 180, thrustFraction: 0.68 },
      { timeS: 9, tiltRad: 0, thrustFraction: 0.56 }
    ]
  });
  const optimization = gridSearch(
    [
      { name: "spanM", minimum: 2.1, maximum: 2.7, steps: 7 },
      { name: "batteryKg", minimum: 1.8, maximum: 2.8, steps: 6 }
    ],
    (parameters) => {
      const spanM = parameters.spanM ?? 2.4;
      const batteryKg = parameters.batteryKg ?? 2.25;
      const designMass = mass.massKg - 2.25 + batteryKg + Math.max(0, spanM - 2.4) * 0.7;
      const designAspectRatio = spanM ** 2 / project.vehicle.reference.areaM2;
      const designK = 1 / (Math.PI * 0.82 * designAspectRatio);
      const optimumCl = Math.sqrt(0.034 / designK);
      const maximumLiftToDrag = optimumCl / (0.034 + designK * optimumCl ** 2);
      const energyWh = batteryKg * 175;
      return {
        parameters,
        objectives: {
          enduranceMin: (energyWh / 680) * 60,
          liftToDrag: maximumLiftToDrag,
          massKg: designMass
        },
        constraints: { spanM, massKg: designMass },
        feasible: spanM <= 2.65 && designMass <= 9.1,
        fidelity: "A1_reduced_order"
      };
    }
  );
  return {
    mass,
    atmosphere,
    designPoint,
    polar,
    glide,
    trim,
    propeller,
    battery,
    slipstream,
    transition,
    optimization,
    pareto: paretoFront(optimization, {
      enduranceMin: "maximize",
      liftToDrag: "maximize",
      massKg: "minimize"
    })
  };
}
