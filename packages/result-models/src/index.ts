export type ResultProvenance =
  | "estimated"
  | "solver_derived"
  | "interpolated"
  | "extrapolated"
  | "user_entered"
  | "manufacturer"
  | "experimentally_validated";

export type QualityGrade =
  | "invalid"
  | "unconverged"
  | "preliminary"
  | "numerically_stable"
  | "mesh_checked"
  | "experimentally_calibrated";

export interface ResultEnvelope<T> {
  readonly id: string;
  readonly createdAt: string;
  readonly projectRevision: string;
  readonly inputHash: string;
  readonly solver: {
    readonly name: string;
    readonly version: string;
    readonly adapterVersion: string;
  };
  readonly fidelity: string;
  readonly provenance: ResultProvenance;
  readonly quality: QualityGrade;
  readonly converged: boolean | null;
  readonly extrapolated: boolean;
  readonly calibrated: boolean;
  readonly validityRange: readonly string[];
  readonly assumptions: readonly string[];
  readonly warnings: readonly string[];
  readonly uncertainty: Record<
    string,
    { readonly standardDeviation: number; readonly unit: string }
  >;
  readonly data: T;
}

export interface ConvergenceEvidence {
  readonly residualsConverged: boolean;
  readonly forcesConverged: boolean;
  readonly momentsConverged: boolean;
  readonly massImbalanceFraction: number;
  readonly meshStudyComplete: boolean;
  readonly timeStepStudyComplete: boolean | null;
  readonly domainStudyComplete: boolean;
  readonly experimentalCalibration: boolean;
  readonly fatalError: boolean;
}

export interface QualityAssessment {
  readonly grade: QualityGrade;
  readonly explanations: readonly string[];
}

export function assessNumericalQuality(evidence: ConvergenceEvidence): QualityAssessment {
  const explanations: string[] = [];
  if (evidence.fatalError || !Number.isFinite(evidence.massImbalanceFraction)) {
    return {
      grade: "invalid",
      explanations: ["The case contains a fatal numerical or data-integrity error"]
    };
  }
  if (!evidence.residualsConverged) explanations.push("Residual criteria were not met");
  if (!evidence.forcesConverged) explanations.push("Integrated forces did not stabilize");
  if (!evidence.momentsConverged) explanations.push("Integrated moments did not stabilize");
  if (Math.abs(evidence.massImbalanceFraction) > 0.01) {
    explanations.push("Mass imbalance exceeds 1% of inlet mass flow");
  }
  if (explanations.length > 0) return { grade: "unconverged", explanations };
  if (!evidence.meshStudyComplete) {
    return {
      grade: "numerically_stable",
      explanations: [
        "Residual, force, moment, and mass checks passed",
        "Mesh independence has not been demonstrated"
      ]
    };
  }
  if (!evidence.domainStudyComplete)
    explanations.push("Domain-size sensitivity has not been checked");
  if (evidence.timeStepStudyComplete === false)
    explanations.push("Time-step independence has not been demonstrated");
  if (evidence.experimentalCalibration) {
    return {
      grade: "experimentally_calibrated",
      explanations: [
        "Numerical checks passed",
        "The model has a recorded experimental calibration",
        ...explanations
      ]
    };
  }
  return {
    grade: "mesh_checked",
    explanations: [
      "Residual, integrated quantity, conservation, and mesh checks passed",
      ...explanations
    ]
  };
}

export interface GridConvergenceInput {
  readonly coarseValue: number;
  readonly mediumValue: number;
  readonly fineValue: number;
  readonly coarseCellSize: number;
  readonly mediumCellSize: number;
  readonly fineCellSize: number;
  readonly safetyFactor?: number;
}

export interface GridConvergenceResult {
  readonly observedOrder: number | null;
  readonly extrapolatedValue: number | null;
  readonly fineGridGciPercent: number | null;
  readonly asymptoticRatio: number | null;
  readonly monotonic: boolean;
  readonly valid: boolean;
  readonly explanation: string;
}

export function calculateGridConvergence(input: GridConvergenceInput): GridConvergenceResult {
  const { coarseValue, mediumValue, fineValue, coarseCellSize, mediumCellSize, fineCellSize } =
    input;
  if (
    [coarseValue, mediumValue, fineValue, coarseCellSize, mediumCellSize, fineCellSize].some(
      (value) => !Number.isFinite(value)
    ) ||
    coarseCellSize <= mediumCellSize ||
    mediumCellSize <= fineCellSize
  ) {
    return {
      observedOrder: null,
      extrapolatedValue: null,
      fineGridGciPercent: null,
      asymptoticRatio: null,
      monotonic: false,
      valid: false,
      explanation: "Cell sizes must be finite and strictly decrease from coarse to fine"
    };
  }
  const epsilonCoarseMedium = coarseValue - mediumValue;
  const epsilonMediumFine = mediumValue - fineValue;
  const monotonic = epsilonCoarseMedium * epsilonMediumFine > 0;
  const ratioMediumFine = mediumCellSize / fineCellSize;
  const ratioCoarseMedium = coarseCellSize / mediumCellSize;
  if (
    !monotonic ||
    Math.abs(epsilonMediumFine) < 1e-14 ||
    Math.abs(ratioMediumFine - ratioCoarseMedium) > 0.15
  ) {
    return {
      observedOrder: null,
      extrapolatedValue: null,
      fineGridGciPercent: null,
      asymptoticRatio: null,
      monotonic,
      valid: false,
      explanation: monotonic
        ? "This implementation requires approximately uniform refinement ratios"
        : "The three solutions do not show monotonic convergence"
    };
  }
  const observedOrder =
    Math.log(Math.abs(epsilonCoarseMedium / epsilonMediumFine)) / Math.log(ratioMediumFine);
  if (!Number.isFinite(observedOrder) || observedOrder <= 0) {
    return {
      observedOrder: null,
      extrapolatedValue: null,
      fineGridGciPercent: null,
      asymptoticRatio: null,
      monotonic,
      valid: false,
      explanation: "The observed order is non-positive or undefined"
    };
  }
  const denominator = ratioMediumFine ** observedOrder - 1;
  const extrapolatedValue = fineValue + (fineValue - mediumValue) / denominator;
  const approximateRelativeError = Math.abs((fineValue - mediumValue) / fineValue);
  const fineGridGciPercent =
    ((input.safetyFactor ?? 1.25) * approximateRelativeError * 100) / denominator;
  const coarseMediumGci =
    ((input.safetyFactor ?? 1.25) * Math.abs((mediumValue - coarseValue) / mediumValue) * 100) /
    (ratioCoarseMedium ** observedOrder - 1);
  const asymptoticRatio = coarseMediumGci / (fineGridGciPercent * ratioMediumFine ** observedOrder);
  return {
    observedOrder,
    extrapolatedValue,
    fineGridGciPercent,
    asymptoticRatio,
    monotonic,
    valid: true,
    explanation:
      "GCI computed for a monotonic, approximately uniform three-grid refinement sequence"
  };
}

export interface MonteCarloSummary {
  readonly sampleCount: number;
  readonly mean: number;
  readonly standardDeviation: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly confidence95: readonly [number, number];
  readonly seed: number;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function runScalarMonteCarlo(
  sampleCount: number,
  seed: number,
  simulate: (uniform: () => number, index: number) => number
): MonteCarloSummary {
  if (!Number.isInteger(sampleCount) || sampleCount < 10) {
    throw new Error("Monte Carlo analysis requires at least 10 samples");
  }
  const uniform = mulberry32(seed);
  const values = Array.from({ length: sampleCount }, (_, index) => simulate(uniform, index));
  if (values.some((value) => !Number.isFinite(value)))
    throw new Error("Monte Carlo simulation returned a non-finite value");
  const mean = values.reduce((sum, value) => sum + value, 0) / sampleCount;
  const standardDeviation = Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (sampleCount - 1)
  );
  const ordered = [...values].sort((left, right) => left - right);
  const percentile = (fraction: number): number =>
    ordered[Math.round((sampleCount - 1) * fraction)] as number;
  return {
    sampleCount,
    mean,
    standardDeviation,
    minimum: ordered[0] as number,
    maximum: ordered.at(-1) as number,
    confidence95: [percentile(0.025), percentile(0.975)],
    seed
  };
}

export function isResultStale(resultInputHash: string, currentInputHash: string): boolean {
  return resultInputHash !== currentInputHash;
}
