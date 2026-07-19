import { SEA_LEVEL_PRESSURE_PA, STANDARD_GRAVITY_M_S2 } from "@aerocel/unit-system";

const AIR_GAS_CONSTANT_J_KG_K = 287.05287;
const AIR_HEAT_CAPACITY_RATIO = 1.4;
const TROPOSPHERE_LAPSE_K_M = -0.0065;
const SEA_LEVEL_TEMPERATURE_K = 288.15;
const SUTHERLAND_REFERENCE_VISCOSITY_PA_S = 1.716e-5;
const SUTHERLAND_REFERENCE_TEMPERATURE_K = 273.15;
const SUTHERLAND_CONSTANT_K = 110.4;

export interface AtmosphereState {
  readonly altitudeM: number;
  readonly temperatureK: number;
  readonly pressurePa: number;
  readonly densityKgM3: number;
  readonly dynamicViscosityPaS: number;
  readonly speedOfSoundMS: number;
  readonly model: "ISA_1976_troposphere";
  readonly warnings: readonly string[];
}

export function isaAtmosphere(altitudeM: number, temperatureOverrideK?: number): AtmosphereState {
  if (altitudeM < -500 || altitudeM > 11_000) {
    throw new Error("This ISA implementation is limited to -500 m through 11,000 m");
  }
  const standardTemperatureK = SEA_LEVEL_TEMPERATURE_K + TROPOSPHERE_LAPSE_K_M * altitudeM;
  const temperatureK = temperatureOverrideK ?? standardTemperatureK;
  if (temperatureK <= 0) throw new Error("Atmospheric temperature must be above absolute zero");
  const exponent = -STANDARD_GRAVITY_M_S2 / (TROPOSPHERE_LAPSE_K_M * AIR_GAS_CONSTANT_J_KG_K);
  const pressurePa =
    SEA_LEVEL_PRESSURE_PA * (standardTemperatureK / SEA_LEVEL_TEMPERATURE_K) ** exponent;
  const densityKgM3 = pressurePa / (AIR_GAS_CONSTANT_J_KG_K * temperatureK);
  const dynamicViscosityPaS =
    SUTHERLAND_REFERENCE_VISCOSITY_PA_S *
    (temperatureK / SUTHERLAND_REFERENCE_TEMPERATURE_K) ** 1.5 *
    ((SUTHERLAND_REFERENCE_TEMPERATURE_K + SUTHERLAND_CONSTANT_K) /
      (temperatureK + SUTHERLAND_CONSTANT_K));
  return {
    altitudeM,
    temperatureK,
    pressurePa,
    densityKgM3,
    dynamicViscosityPaS,
    speedOfSoundMS: Math.sqrt(AIR_HEAT_CAPACITY_RATIO * AIR_GAS_CONSTANT_J_KG_K * temperatureK),
    model: "ISA_1976_troposphere",
    warnings:
      temperatureOverrideK === undefined
        ? []
        : ["Density includes a user-specified temperature offset from ISA"]
  };
}

export interface AirfoilCoordinates {
  readonly name: string;
  readonly points: readonly (readonly [number, number])[];
}

export function parseAirfoilDat(content: string): AirfoilCoordinates {
  const lines = content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 4)
    throw new Error("Airfoil DAT data requires a name and at least three points");
  const name = lines[0] ?? "Unnamed airfoil";
  const points: [number, number][] = [];
  for (const [index, line] of lines.slice(1).entries()) {
    const values = line.split(/[\s,;]+/u).map(Number);
    if (values.length < 2 || !Number.isFinite(values[0]) || !Number.isFinite(values[1])) {
      throw new Error(`Invalid airfoil coordinate on data line ${index + 2}`);
    }
    points.push([values[0] as number, values[1] as number]);
  }
  return { name, points };
}

export interface AnalyticalAeroInput {
  readonly wingAreaM2: number;
  readonly wingSpanM: number;
  readonly meanChordM: number;
  readonly massKg: number;
  readonly airspeedMS: number;
  readonly angleOfAttackRad: number;
  readonly sideslipRad: number;
  readonly altitudeM: number;
  readonly zeroLiftAngleRad: number;
  readonly sectionLiftSlopePerRad: number;
  readonly oswaldEfficiency: number;
  readonly zeroLiftDragCoefficient: number;
  readonly pitchingMomentZero: number;
  readonly pitchingMomentSlopePerRad: number;
  readonly sideForceSlopePerRad: number;
  readonly stallAnglePositiveRad: number;
  readonly maximumLiftCoefficient: number;
}

export interface AnalyticalAeroResult {
  readonly coefficients: {
    readonly cl: number;
    readonly cd: number;
    readonly cy: number;
    readonly roll: number;
    readonly cm: number;
    readonly cn: number;
  };
  readonly forcesN: { readonly lift: number; readonly drag: number; readonly side: number };
  readonly momentsNm: { readonly roll: number; readonly pitch: number; readonly yaw: number };
  readonly dynamicPressurePa: number;
  readonly reynoldsNumber: number;
  readonly machNumber: number;
  readonly finiteWingLiftSlopePerRad: number;
  readonly inducedDragCoefficient: number;
  readonly stallMarginRad: number;
  readonly fidelity: "A1_component_buildup";
  readonly provenance: "estimated";
  readonly quality: "preliminary";
  readonly validity: readonly string[];
  readonly warnings: readonly string[];
}

export function analyzeComponentBuildup(input: AnalyticalAeroInput): AnalyticalAeroResult {
  if (
    input.wingAreaM2 <= 0 ||
    input.wingSpanM <= 0 ||
    input.meanChordM <= 0 ||
    input.massKg <= 0 ||
    input.airspeedMS < 0 ||
    input.oswaldEfficiency <= 0 ||
    input.oswaldEfficiency > 1.2
  ) {
    throw new Error("A1 aerodynamic inputs are outside physical input bounds");
  }
  const atmosphere = isaAtmosphere(input.altitudeM);
  const aspectRatio = input.wingSpanM ** 2 / input.wingAreaM2;
  const finiteWingLiftSlopePerRad =
    input.sectionLiftSlopePerRad /
    (1 + input.sectionLiftSlopePerRad / (Math.PI * input.oswaldEfficiency * aspectRatio));
  const linearCl = finiteWingLiftSlopePerRad * (input.angleOfAttackRad - input.zeroLiftAngleRad);
  const cl = Math.max(
    -input.maximumLiftCoefficient,
    Math.min(input.maximumLiftCoefficient, linearCl)
  );
  const inducedDragCoefficient = cl ** 2 / (Math.PI * input.oswaldEfficiency * aspectRatio);
  const cd = input.zeroLiftDragCoefficient + inducedDragCoefficient;
  const cy = input.sideslipRad === 0 ? 0 : input.sideForceSlopePerRad * input.sideslipRad;
  const cm = input.pitchingMomentZero + input.pitchingMomentSlopePerRad * input.angleOfAttackRad;
  const dynamicPressurePa = 0.5 * atmosphere.densityKgM3 * input.airspeedMS ** 2;
  const lift = dynamicPressurePa * input.wingAreaM2 * cl;
  const drag = dynamicPressurePa * input.wingAreaM2 * cd;
  const side = dynamicPressurePa * input.wingAreaM2 * cy;
  const warnings: string[] = [];
  if (Math.abs(input.angleOfAttackRad) > input.stallAnglePositiveRad) {
    warnings.push(
      "Angle of attack exceeds the attached-flow validity limit; CL is clipped, not post-stall modeled"
    );
  }
  if (Math.abs(input.sideslipRad) > (15 * Math.PI) / 180) {
    warnings.push("Sideslip exceeds the preliminary component-buildup validity range");
  }
  if (input.airspeedMS <= 0)
    warnings.push("Zero airspeed: aerodynamic coefficients are defined but forces are zero");
  return {
    coefficients: { cl, cd, cy, roll: 0, cm, cn: 0 },
    forcesN: { lift, drag, side },
    momentsNm: {
      roll: 0,
      pitch: dynamicPressurePa * input.wingAreaM2 * input.meanChordM * cm,
      yaw: 0
    },
    dynamicPressurePa,
    reynoldsNumber:
      (atmosphere.densityKgM3 * input.airspeedMS * input.meanChordM) /
      atmosphere.dynamicViscosityPaS,
    machNumber: input.airspeedMS / atmosphere.speedOfSoundMS,
    finiteWingLiftSlopePerRad,
    inducedDragCoefficient,
    stallMarginRad: input.stallAnglePositiveRad - input.angleOfAttackRad,
    fidelity: "A1_component_buildup",
    provenance: "estimated",
    quality: "preliminary",
    validity: [
      "Attached subsonic flow",
      "Moderate angle of attack and sideslip",
      "No strong rotor-airframe interaction",
      "Rigid geometry"
    ],
    warnings
  };
}

export interface SpanLoadingPoint {
  readonly yM: number;
  readonly chordM: number;
  readonly relativeCirculation: number;
  readonly sectionalLiftCoefficient: number;
}

export function ellipticalSpanLoading(
  spanM: number,
  rootChordM: number,
  liftCoefficient: number,
  stationCount = 25
): readonly SpanLoadingPoint[] {
  if (spanM <= 0 || rootChordM <= 0 || stationCount < 5) {
    throw new Error("Span loading requires positive geometry and at least five stations");
  }
  return Array.from({ length: stationCount }, (_, index) => {
    const yM = -spanM / 2 + (spanM * index) / (stationCount - 1);
    const normalized = (2 * yM) / spanM;
    const relativeCirculation = Math.sqrt(Math.max(0, 1 - normalized ** 2));
    return {
      yM,
      chordM: rootChordM * relativeCirculation,
      relativeCirculation,
      sectionalLiftCoefficient: liftCoefficient
    };
  });
}

export interface GlidePoint {
  readonly airspeedMS: number;
  readonly liftCoefficient: number;
  readonly dragCoefficient: number;
  readonly liftToDrag: number;
  readonly sinkRateMS: number;
  readonly powerRequiredW: number;
}

export interface GlideEnvelope {
  readonly points: readonly GlidePoint[];
  readonly bestGlide: GlidePoint;
  readonly minimumSink: GlidePoint;
  readonly stallSpeedMS: number;
  readonly fidelity: "derived_from_A1_polar";
}

export function calculateGlideEnvelope(input: {
  readonly massKg: number;
  readonly wingAreaM2: number;
  readonly densityKgM3: number;
  readonly maximumLiftCoefficient: number;
  readonly zeroLiftDragCoefficient: number;
  readonly inducedDragFactor: number;
  readonly minimumSpeedMS?: number;
  readonly maximumSpeedMS?: number;
  readonly samples?: number;
}): GlideEnvelope {
  const weightN = input.massKg * STANDARD_GRAVITY_M_S2;
  const stallSpeedMS = Math.sqrt(
    (2 * weightN) / (input.densityKgM3 * input.wingAreaM2 * input.maximumLiftCoefficient)
  );
  const minimum = input.minimumSpeedMS ?? stallSpeedMS * 1.02;
  const maximum = input.maximumSpeedMS ?? stallSpeedMS * 3.2;
  const samples = input.samples ?? 48;
  if (minimum <= 0 || maximum <= minimum || samples < 3)
    throw new Error("Invalid glide-envelope sampling range");
  const points = Array.from({ length: samples }, (_, index) => {
    const airspeedMS = minimum + ((maximum - minimum) * index) / (samples - 1);
    const dynamicPressure = 0.5 * input.densityKgM3 * airspeedMS ** 2;
    const liftCoefficient = weightN / (dynamicPressure * input.wingAreaM2);
    const dragCoefficient =
      input.zeroLiftDragCoefficient + input.inducedDragFactor * liftCoefficient ** 2;
    const liftToDrag = liftCoefficient / dragCoefficient;
    const dragN = dynamicPressure * input.wingAreaM2 * dragCoefficient;
    const powerRequiredW = dragN * airspeedMS;
    return {
      airspeedMS,
      liftCoefficient,
      dragCoefficient,
      liftToDrag,
      sinkRateMS: airspeedMS / liftToDrag,
      powerRequiredW
    };
  });
  const bestGlide = points.reduce((best, point) =>
    point.liftToDrag > best.liftToDrag ? point : best
  );
  const minimumSink = points.reduce((best, point) =>
    point.sinkRateMS < best.sinkRateMS ? point : best
  );
  return { points, bestGlide, minimumSink, stallSpeedMS, fidelity: "derived_from_A1_polar" };
}

export interface CoefficientSample {
  readonly independent: number;
  readonly value: number;
}

export function interpolateCoefficient(
  samples: readonly CoefficientSample[],
  independent: number
): { readonly value: number; readonly provenance: "interpolated" | "extrapolated" } {
  if (samples.length < 2) throw new Error("Coefficient interpolation requires two or more samples");
  const ordered = [...samples].sort((left, right) => left.independent - right.independent);
  const first = ordered[0] as CoefficientSample;
  const last = ordered.at(-1) as CoefficientSample;
  let left = first;
  let right = ordered[1] as CoefficientSample;
  if (independent >= last.independent) {
    left = ordered.at(-2) as CoefficientSample;
    right = last;
  } else {
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const candidate = ordered[index] as CoefficientSample;
      const next = ordered[index + 1] as CoefficientSample;
      if (independent >= candidate.independent && independent <= next.independent) {
        left = candidate;
        right = next;
        break;
      }
    }
  }
  const fraction = (independent - left.independent) / (right.independent - left.independent);
  return {
    value: left.value + (right.value - left.value) * fraction,
    provenance:
      independent < first.independent || independent > last.independent
        ? "extrapolated"
        : "interpolated"
  };
}
