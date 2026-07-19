export type ExecutionMode = "native_mac" | "local_linux" | "remote_linux";
export type ResourceClass = "lightweight" | "moderate" | "heavy" | "workstation" | "cluster";

export interface SolverCapability {
  readonly id: string;
  readonly name: string;
  readonly available: boolean;
  readonly version: string | null;
  readonly executablePath: string | null;
  readonly modes: readonly ExecutionMode[];
  readonly reason: string;
  readonly verifiedAt: string;
}

export interface JobStage {
  readonly id: string;
  readonly label: string;
  readonly cancellable: boolean;
  readonly restartable: boolean;
}

export interface SolverJob<Input> {
  readonly id: string;
  readonly solverId: string;
  readonly adapterVersion: string;
  readonly executionMode: ExecutionMode;
  readonly resourceClass: ResourceClass;
  readonly inputHash: string;
  readonly input: Input;
  readonly stages: readonly JobStage[];
  readonly createdAt: string;
}

export interface JobTelemetry {
  readonly jobId: string;
  readonly stageId: string;
  readonly iteration: number | null;
  readonly physicalTimeS: number | null;
  readonly progressFraction: number | null;
  readonly residuals: Readonly<Record<string, number>>;
  readonly forcesN: readonly [number, number, number] | null;
  readonly momentsNm: readonly [number, number, number] | null;
  readonly courantMaximum: number | null;
  readonly massImbalanceFraction: number | null;
  readonly cpuPercent: number | null;
  readonly memoryBytes: number | null;
  readonly diskBytes: number | null;
  readonly message: string;
  readonly timestamp: string;
}

export interface CommandSpec {
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly workingDirectory: string;
  readonly environment: Readonly<Record<string, string>>;
}

export interface SolverAdapter<Input, Output> {
  readonly id: string;
  readonly displayName: string;
  readonly adapterVersion: string;
  validate(input: Input): readonly string[];
  buildJob(input: Input, context: JobBuildContext): SolverJob<Input>;
  buildCommands(job: SolverJob<Input>, caseDirectory: string): readonly CommandSpec[];
  parseResult(caseDirectory: string): Promise<Output>;
}

export interface JobBuildContext {
  readonly id: string;
  readonly executionMode: ExecutionMode;
  readonly inputHash: string;
  readonly createdAt: string;
}

export interface CfdCaseInput {
  readonly name: string;
  readonly solver: "openfoam" | "su2";
  readonly analysis: "steady_rans" | "transient_urans";
  readonly airspeedMS: number;
  readonly angleOfAttackRad: number;
  readonly sideslipRad: number;
  readonly densityKgM3: number;
  readonly dynamicViscosityPaS: number;
  readonly referenceAreaM2: number;
  readonly referenceLengthM: number;
  readonly turbulenceModel: "kOmegaSST" | "SpalartAllmaras";
  readonly domainLengthFactors: {
    readonly upstream: number;
    readonly downstream: number;
    readonly lateral: number;
  };
  readonly mesh: {
    readonly targetBaseCellM: number;
    readonly boundaryLayers: number;
    readonly maximumCells: number;
    readonly hasFatalGeometryErrors: boolean;
  };
  readonly convergence: {
    readonly residualTolerance: number;
    readonly forceWindow: number;
    readonly forceRelativeTolerance: number;
    readonly maximumIterations: number;
  };
  readonly actuatorDisks: readonly {
    readonly id: string;
    readonly centerM: readonly [number, number, number];
    readonly normal: readonly [number, number, number];
    readonly diameterM: number;
    readonly thrustN: number;
    readonly swirlTorqueNm: number;
  }[];
}

export interface CfdResultManifest {
  readonly caseDirectory: string;
  readonly rawFieldFormat: "VTK" | "OpenFOAM" | "SU2";
  readonly metricsFile: string;
  readonly convergenceFile: string;
  readonly qualityAssessmentRequired: true;
}

function assertSafeRelativePath(path: string): void {
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.includes("..") ||
    path.includes("\0") ||
    path.includes("\\")
  ) {
    throw new Error(`Unsafe solver case path: ${path}`);
  }
}

export class OpenFoamAdapter implements SolverAdapter<CfdCaseInput, CfdResultManifest> {
  public readonly id = "openfoam";
  public readonly displayName = "OpenFOAM";
  public readonly adapterVersion = "0.1.0";

  public validate(input: CfdCaseInput): readonly string[] {
    const errors: string[] = [];
    if (input.solver !== "openfoam") errors.push("OpenFOAM adapter received a non-OpenFOAM case");
    if (input.mesh.hasFatalGeometryErrors)
      errors.push("Geometry contains fatal errors; meshing is blocked");
    if (input.airspeedMS < 0) errors.push("Airspeed cannot be negative");
    if (input.referenceAreaM2 <= 0 || input.referenceLengthM <= 0)
      errors.push("Reference quantities must be positive");
    if (input.mesh.targetBaseCellM <= 0 || input.mesh.maximumCells < 1_000)
      errors.push("Mesh controls are invalid");
    if (input.domainLengthFactors.upstream < 3)
      errors.push("Upstream domain distance is below the safe minimum of 3 reference lengths");
    if (input.domainLengthFactors.downstream < 8)
      errors.push("Downstream domain distance is below the safe minimum of 8 reference lengths");
    return errors;
  }

  public buildJob(input: CfdCaseInput, context: JobBuildContext): SolverJob<CfdCaseInput> {
    const validation = this.validate(input);
    if (validation.length > 0)
      throw new Error(`CFD case is not runnable: ${validation.join("; ")}`);
    return {
      id: context.id,
      solverId: this.id,
      adapterVersion: this.adapterVersion,
      executionMode: context.executionMode,
      resourceClass: input.analysis === "transient_urans" ? "workstation" : "heavy",
      inputHash: context.inputHash,
      input,
      createdAt: context.createdAt,
      stages: [
        { id: "surface", label: "Prepare surfaces", cancellable: true, restartable: true },
        { id: "mesh", label: "Generate and inspect mesh", cancellable: true, restartable: true },
        { id: "solve", label: "Solve flow field", cancellable: true, restartable: true },
        {
          id: "extract",
          label: "Extract engineering quantities",
          cancellable: false,
          restartable: true
        }
      ]
    };
  }

  public buildCommands(
    _job: SolverJob<CfdCaseInput>,
    caseDirectory: string
  ): readonly CommandSpec[] {
    assertSafeRelativePath(caseDirectory);
    return [
      {
        executable: "surfaceFeatureExtract",
        arguments: ["-case", caseDirectory],
        workingDirectory: caseDirectory,
        environment: {}
      },
      {
        executable: "blockMesh",
        arguments: ["-case", caseDirectory],
        workingDirectory: caseDirectory,
        environment: {}
      },
      {
        executable: "snappyHexMesh",
        arguments: ["-case", caseDirectory, "-overwrite"],
        workingDirectory: caseDirectory,
        environment: {}
      },
      {
        executable: "checkMesh",
        arguments: ["-case", caseDirectory, "-allGeometry", "-allTopology"],
        workingDirectory: caseDirectory,
        environment: {}
      },
      {
        executable: "simpleFoam",
        arguments: ["-case", caseDirectory],
        workingDirectory: caseDirectory,
        environment: {}
      }
    ];
  }

  public async parseResult(caseDirectory: string): Promise<CfdResultManifest> {
    assertSafeRelativePath(caseDirectory);
    return Promise.resolve({
      caseDirectory,
      rawFieldFormat: "OpenFOAM",
      metricsFile: `${caseDirectory}/postProcessing/aerocel/metrics.json`,
      convergenceFile: `${caseDirectory}/postProcessing/aerocel/convergence.json`,
      qualityAssessmentRequired: true
    });
  }
}

export interface Px4SitslInput {
  readonly airframe: "plane" | "quadplane" | "tailsitter" | "tiltrotor" | "tricopter" | "custom";
  readonly modelName: string;
  readonly parameterFile: string | null;
  readonly actuatorMappings: readonly {
    readonly output: number;
    readonly componentId: string;
    readonly function:
      "motor" | "servo" | "control_surface" | "tilt_joint" | "landing_gear" | "parachute";
    readonly minimum: number;
    readonly maximum: number;
  }[];
  readonly mavlinkUdpPort: number;
}

export function validatePx4Mapping(input: Px4SitslInput): readonly string[] {
  const issues: string[] = [];
  const outputs = new Set<number>();
  for (const mapping of input.actuatorMappings) {
    if (outputs.has(mapping.output))
      issues.push(`Actuator output ${mapping.output} is mapped more than once`);
    outputs.add(mapping.output);
    if (mapping.minimum >= mapping.maximum)
      issues.push(`Output ${mapping.output} has inverted limits`);
  }
  if (input.mavlinkUdpPort < 1_024 || input.mavlinkUdpPort > 65_535)
    issues.push("MAVLink UDP port is outside the user-port range");
  return issues;
}

export interface RemoteHostProfile {
  readonly id: string;
  readonly displayName: string;
  readonly hostname: string;
  readonly port: number;
  readonly username: string;
  readonly identityFileReference: string | null;
  readonly scheduler: "none" | "slurm";
  readonly remoteRoot: string;
  readonly cpuLimit: number | null;
  readonly memoryLimitGb: number | null;
}

export function validateRemoteHost(profile: RemoteHostProfile): readonly string[] {
  const issues: string[] = [];
  if (!/^[a-zA-Z0-9.-]+$/u.test(profile.hostname))
    issues.push("Hostname contains unsupported characters");
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/u.test(profile.username))
    issues.push("Username contains unsupported characters");
  if (profile.port < 1 || profile.port > 65_535) issues.push("SSH port is invalid");
  if (!profile.remoteRoot.startsWith("/") || profile.remoteRoot.includes("\0"))
    issues.push("Remote root must be an absolute POSIX path");
  if (profile.identityFileReference?.includes("PRIVATE KEY") === true)
    issues.push("Store only a key reference, never private key material");
  return issues;
}
