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
import {
  combineMassProperties,
  type CombinedMassProperties,
  type TriangleMesh
} from "@aerocel/geometry-core";
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
import {
  deriveAircraftPhysics,
  estimateGeometryAerodynamicLoads,
  estimateGeometryDrag,
  type GeometryDragEstimate
} from "./aircraftPhysics";
import { configuredMotorThrustN } from "./componentProperties";

export interface RapidAnalysis {
  readonly aerodynamicSource: "geometry_surface_panels" | "component_buildup";
  readonly mass: CombinedMassProperties;
  readonly atmosphere: ReturnType<typeof isaAtmosphere>;
  readonly geometryDrag: GeometryDragEstimate;
  readonly zeroLiftGeometryDrag: GeometryDragEstimate;
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
  readonly propellers: readonly {
    readonly unitId: string;
    readonly result: BemtResult;
  }[];
  readonly battery: BatteryOperatingPoint;
  readonly slipstream: SlipstreamResult;
  readonly transition: TransitionResult;
  readonly optimization: readonly DesignEvaluation[];
  readonly pareto: readonly DesignEvaluation[];
}

export interface AnalysisOptions {
  readonly airspeedMS: number;
  readonly angleOfAttackDeg: number;
  readonly additionalDragCounts: number;
  readonly propellerRpm: number;
  readonly failedMotorFraction: number;
  readonly jammedTiltDeg: number | null;
}

export const defaultAnalysisOptions: AnalysisOptions = {
  airspeedMS: 22,
  angleOfAttackDeg: 4,
  additionalDragCounts: 0,
  propellerRpm: 6_800,
  failedMotorFraction: 0,
  jammedTiltDeg: null
};

const inputForAero = (
  project: AerocelProject,
  airspeedMS: number,
  angleOfAttackDeg: number,
  additionalDragCounts: number,
  geometryBaseDragCoefficient: number
) => ({
  wingAreaM2: project.vehicle.reference.areaM2,
  wingSpanM: project.vehicle.reference.spanM,
  meanChordM: project.vehicle.reference.chordM,
  airspeedMS,
  angleOfAttackRad: (angleOfAttackDeg * Math.PI) / 180,
  sideslipRad: 0,
  altitudeM: project.environment.altitudeM,
  zeroLiftAngleRad: (-2 * Math.PI) / 180,
  sectionLiftSlopePerRad: 2 * Math.PI,
  oswaldEfficiency: 0.82,
  zeroLiftDragCoefficient: geometryBaseDragCoefficient,
  additionalDragCoefficient: additionalDragCounts / 10_000,
  pitchingMomentZero: 0.015,
  pitchingMomentSlopePerRad: -0.72,
  sideForceSlopePerRad: -0.8,
  stallAnglePositiveRad: (13 * Math.PI) / 180,
  maximumLiftCoefficient: 1.35
});

const withGeometryDragValidity = (result: AnalyticalAeroResult): AnalyticalAeroResult => ({
  ...result,
  validity: result.validity.map((item) =>
    item.startsWith("Zero-lift drag is an aggregate input")
      ? "Base drag is geometry-derived from profile and body panels; it is not calibrated CFD or wind-tunnel data"
      : item
  )
});

function withGeometrySurfaceLoads(
  result: AnalyticalAeroResult,
  loads: ReturnType<typeof estimateGeometryAerodynamicLoads>,
  zeroLiftDragCoefficient: number,
  additionalDragCoefficient: number,
  referenceAreaM2: number,
  referenceSpanM: number,
  referenceChordM: number,
  liftSlopePerRad: number,
  angleOfAttackRad: number
): AnalyticalAeroResult {
  const cl = loads.liftCoefficient;
  const cd = loads.dragCoefficient + additionalDragCoefficient;
  const dynamicPressurePa = result.dynamicPressurePa;
  const inducedDragCoefficient = Math.max(0, loads.dragCoefficient - zeroLiftDragCoefficient);
  return {
    ...result,
    coefficients: {
      cl,
      cd,
      cy: loads.sideForceCoefficient,
      roll: loads.rollMomentCoefficient,
      cm: loads.pitchMomentCoefficient,
      cn: loads.yawMomentCoefficient
    },
    forcesN: {
      lift: dynamicPressurePa * referenceAreaM2 * cl,
      drag: dynamicPressurePa * referenceAreaM2 * cd,
      side: dynamicPressurePa * referenceAreaM2 * loads.sideForceCoefficient
    },
    momentsNm: {
      roll: dynamicPressurePa * referenceAreaM2 * referenceSpanM * loads.rollMomentCoefficient,
      pitch: dynamicPressurePa * referenceAreaM2 * referenceChordM * loads.pitchMomentCoefficient,
      yaw: dynamicPressurePa * referenceAreaM2 * referenceSpanM * loads.yawMomentCoefficient
    },
    finiteWingLiftSlopePerRad: liftSlopePerRad,
    inducedDragCoefficient,
    dragBreakdown: {
      zeroLift: zeroLiftDragCoefficient,
      induced: inducedDragCoefficient,
      sideslip: 0,
      additional: additionalDragCoefficient,
      total: cd
    },
    stallMarginRad: (15 * Math.PI) / 180 - Math.abs(angleOfAttackRad),
    validity: [
      "Forces come from the imported triangle positions, sizes, and directions",
      "Each triangle uses its own local wind in Fly",
      "No airfoil name or lift table is required",
      "This quick model does not resolve the surrounding pressure field, wake, viscosity, or turbulence"
    ],
    warnings: [
      ...result.warnings.filter(
        (warning) =>
          !warning.includes("parabolic-polar") && !warning.includes("No explicit excrescence")
      ),
      "Geometry surface panels are a fast flight model, not CFD or test validation. Use a connected CFD solver and physical tests before engineering decisions."
    ]
  };
}

function solvePropeller(
  bladeCount: number,
  diameterM: number,
  pitchM: number,
  rpm: number,
  axialVelocityMS: number,
  densityKgM3: number,
  speedOfSoundMS: number,
  rotation: "CW" | "CCW"
): BemtResult {
  const radius = diameterM / 2;
  const referencePitchM = 0.18 * (diameterM / 0.43);
  const twistFor = (radiusFraction: number, referenceTwistRad: number): number => {
    const radialPosition = radius * radiusFraction;
    const pitchAngle = Math.atan2(pitchM, 2 * Math.PI * radialPosition);
    const referencePitchAngle = Math.atan2(referencePitchM, 2 * Math.PI * radialPosition);
    return referenceTwistRad + pitchAngle - referencePitchAngle;
  };
  return solveBemt({
    bladeCount,
    diameterM,
    hubRadiusM: radius * 0.18,
    rpm,
    axialVelocityMS,
    densityKgM3,
    speedOfSoundMS,
    rotation,
    stations: [
      {
        radiusM: radius * 0.19,
        chordM: radius * 0.18,
        twistRad: twistFor(0.19, 0.5),
        liftCurveSlopePerRad: 5.7,
        zeroLiftAngleRad: -0.03,
        cd0: 0.018,
        inducedDragFactor: 0.02
      },
      {
        radiusM: radius * 0.56,
        chordM: radius * 0.14,
        twistRad: twistFor(0.56, 0.33),
        liftCurveSlopePerRad: 5.7,
        zeroLiftAngleRad: -0.03,
        cd0: 0.016,
        inducedDragFactor: 0.02
      },
      {
        radiusM: radius * 0.98,
        chordM: radius * 0.08,
        twistRad: twistFor(0.98, 0.2),
        liftCurveSlopePerRad: 5.7,
        zeroLiftAngleRad: -0.03,
        cd0: 0.015,
        inducedDragFactor: 0.02
      }
    ]
  });
}

export function runRapidAnalysis(
  project: AerocelProject,
  options: AnalysisOptions,
  geometryAssets: ReadonlyMap<string, TriangleMesh> = new Map()
): RapidAnalysis {
  if (options.additionalDragCounts < 0 || !Number.isFinite(options.additionalDragCounts)) {
    throw new Error("Additional drag counts must be a finite non-negative value");
  }
  const aircraftPhysics = deriveAircraftPhysics(project, geometryAssets, new Map(), 2 * Math.PI);
  const dragAtAngle = (angleDeg: number): GeometryDragEstimate => {
    const angleRad = (angleDeg * Math.PI) / 180;
    return estimateGeometryDrag(aircraftPhysics, project.vehicle.reference.areaM2, [
      Math.cos(angleRad),
      0,
      Math.sin(angleRad)
    ]);
  };
  const zeroLiftGeometryDrag = dragAtAngle(0);
  const geometryDrag = dragAtAngle(options.angleOfAttackDeg);
  const aggregateZeroLiftDragCoefficient =
    zeroLiftGeometryDrag.totalBaseCoefficient + options.additionalDragCounts / 10_000;
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
  const usesGeometrySurfacePanels =
    aircraftPhysics.meshPanelCount > 0 && aircraftPhysics.surfaces.length === 0;
  const aerodynamicSource = usesGeometrySurfacePanels
    ? "geometry_surface_panels"
    : "component_buildup";
  const panelLoadsAtAngle = (angleDeg: number) => {
    const angleRad = (angleDeg * Math.PI) / 180;
    return estimateGeometryAerodynamicLoads(
      aircraftPhysics.panels,
      project.vehicle.reference.areaM2,
      project.vehicle.reference.spanM,
      project.vehicle.reference.chordM,
      mass.centerOfGravityM,
      [Math.cos(angleRad), 0, Math.sin(angleRad)]
    );
  };
  const slopeStepDeg = 1;
  const geometryLiftSlopePerRad = usesGeometrySurfacePanels
    ? Math.max(
        0.1,
        (panelLoadsAtAngle(slopeStepDeg).liftCoefficient -
          panelLoadsAtAngle(-slopeStepDeg).liftCoefficient) /
          ((2 * slopeStepDeg * Math.PI) / 180)
      )
    : 0;
  const preliminaryDesignPoint = withGeometryDragValidity(
    analyzeComponentBuildup(
      inputForAero(
        project,
        options.airspeedMS,
        options.angleOfAttackDeg,
        options.additionalDragCounts,
        geometryDrag.totalBaseCoefficient
      )
    )
  );
  const designPoint = usesGeometrySurfacePanels
    ? withGeometrySurfaceLoads(
        preliminaryDesignPoint,
        panelLoadsAtAngle(options.angleOfAttackDeg),
        zeroLiftGeometryDrag.totalBaseCoefficient,
        options.additionalDragCounts / 10_000,
        project.vehicle.reference.areaM2,
        project.vehicle.reference.spanM,
        project.vehicle.reference.chordM,
        geometryLiftSlopePerRad,
        (options.angleOfAttackDeg * Math.PI) / 180
      )
    : preliminaryDesignPoint;
  const polar = Array.from({ length: 23 }, (_, index) => -8 + index).map((alphaDeg) => {
    const result = analyzeComponentBuildup(
      inputForAero(
        project,
        options.airspeedMS,
        alphaDeg,
        options.additionalDragCounts,
        dragAtAngle(alphaDeg).totalBaseCoefficient
      )
    );
    if (usesGeometrySurfacePanels) {
      const loads = panelLoadsAtAngle(alphaDeg);
      return {
        alphaDeg,
        cl: loads.liftCoefficient,
        cd: loads.dragCoefficient + options.additionalDragCounts / 10_000,
        cm: loads.pitchMomentCoefficient
      };
    }
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
    zeroLiftDragCoefficient: aggregateZeroLiftDragCoefficient,
    inducedDragFactor
  });
  const trim = solveStraightLevelTrim({
    massKg: mass.massKg,
    densityKgM3: atmosphere.densityKgM3,
    airspeedMS: options.airspeedMS,
    wingAreaM2: project.vehicle.reference.areaM2,
    liftSlopePerRad: designPoint.finiteWingLiftSlopePerRad,
    zeroLiftAngleRad: (-2 * Math.PI) / 180,
    zeroLiftDragCoefficient: aggregateZeroLiftDragCoefficient,
    inducedDragFactor,
    maximumLiftCoefficient: 1.35
  });
  const axialVelocityMS = Math.max(0, options.airspeedMS * 0.25);
  const propellers = project.vehicle.propulsionUnits.map((unit) => ({
    unitId: unit.id,
    result: solvePropeller(
      unit.bladeCount,
      unit.diameterM,
      unit.pitchM,
      options.propellerRpm,
      axialVelocityMS,
      atmosphere.densityKgM3,
      atmosphere.speedOfSoundMS,
      unit.rotation
    )
  }));
  const propeller =
    propellers[0]?.result ??
    solvePropeller(
      2,
      0.43,
      0.18,
      options.propellerRpm,
      axialVelocityMS,
      atmosphere.densityKgM3,
      atmosphere.speedOfSoundMS,
      "CW"
    );
  const diameterM = project.vehicle.propulsionUnits[0]?.diameterM ?? 0.43;
  const totalShaftPowerW = propellers.reduce(
    (sum, item) => sum + Math.max(0, item.result.shaftPowerW),
    0
  );
  const estimatedMotorCurrentA = Math.min(120, Math.max(0, totalShaftPowerW / (22.2 * 0.86)));
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
  const estimatedTotalThrustN = project.vehicle.propulsionUnits.reduce((sum, unit) => {
    const result = propellers.find((item) => item.unitId === unit.id)?.result;
    return sum + (configuredMotorThrustN(project, unit.motorComponentId) ?? result?.thrustN ?? 0);
  }, 0);
  const maximumPowerW = project.vehicle.propulsionUnits.reduce(
    (sum, unit) => sum + unit.motor.maxPowerW,
    0
  );
  const transition = simulateTransition({
    massKg: mass.massKg,
    wingAreaM2: project.vehicle.reference.areaM2,
    densityKgM3: atmosphere.densityKgM3,
    maximumTotalThrustN: Math.max(0.001, estimatedTotalThrustN),
    maximumPowerW: Math.max(1, maximumPowerW),
    initialAltitudeM: 40,
    initialAirspeedMS: 0,
    durationS: 9,
    stepS: 0.05,
    tiltRateLimitRadS: 0.5,
    liftSlopePerRad: designPoint.finiteWingLiftSlopePerRad,
    assumedAngleOfAttackRad: (6 * Math.PI) / 180,
    maximumLiftCoefficient: 1.35,
    zeroLiftDragCoefficient: aggregateZeroLiftDragCoefficient,
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
      const optimumCl = Math.sqrt(aggregateZeroLiftDragCoefficient / designK);
      const maximumLiftToDrag =
        optimumCl / (aggregateZeroLiftDragCoefficient + designK * optimumCl ** 2);
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
    aerodynamicSource,
    mass,
    atmosphere,
    geometryDrag,
    zeroLiftGeometryDrag,
    designPoint,
    polar,
    glide,
    trim,
    propeller,
    propellers,
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
