import type { TriangleMesh } from "@aerocel/geometry-core";
import {
  cross3,
  dot3,
  magnitude3,
  normalize3,
  scale3,
  subtract3,
  type Vector3
} from "@aerocel/math-core";
import type { AerocelProject, ComponentType, VehicleComponent } from "@aerocel/simulation-schema";

export type FlightVector = readonly [number, number, number];

export interface AerodynamicSurface {
  readonly componentId: string;
  readonly parentComponentId: string | null;
  readonly name: string;
  readonly kind: "horizontal" | "vertical";
  readonly positionBodyM: FlightVector;
  readonly chordDirectionBody: FlightVector;
  readonly spanDirectionBody: FlightVector;
  readonly areaM2: number;
  readonly chordM: number;
  readonly liftSlopePerRad: number;
  readonly zeroLiftAngleRad: number;
  readonly stallAngleRad: number;
  readonly maximumLiftCoefficient: number;
  readonly baseDragCoefficient: number;
  readonly inducedDragFactor: number;
  readonly control: "none" | "roll" | "pitch" | "yaw" | "flap" | "brake" | "elevon" | "flaperon";
  readonly controlSign: number;
  readonly controlEffectivenessRad: number;
}

export interface AerodynamicPanel {
  readonly componentId: string;
  readonly name: string;
  readonly positionBodyM: FlightVector;
  readonly normalBody: FlightVector;
  readonly areaM2: number;
  readonly pressureCoefficient: number;
  readonly skinFrictionCoefficient: number;
  readonly attachedFlowSlopePerRad: number;
  readonly maximumAttachedFlowCoefficient: number;
  readonly flowModel: "closed_shell" | "two_sided_surface";
  readonly control: AerodynamicSurface["control"];
  readonly controlSign: number;
  readonly controlEffectivenessRad: number;
  readonly controlAxisBody: FlightVector;
  readonly source: "mesh" | "bounding_box";
}

export interface AerodynamicPanelLoad {
  readonly forceBodyN: FlightVector;
  readonly dynamicPressurePa: number;
  readonly pressureForceN: number;
  readonly attachedFlowForceN: number;
  readonly frictionForceN: number;
  readonly incidenceAngleRad: number;
  readonly normalBody: FlightVector;
}

export interface FlightPropulsor {
  readonly id: string;
  readonly name: string;
  readonly propellerComponentId: string;
  readonly positionBodyM: FlightVector;
  readonly axisBody: FlightVector;
  readonly maximumThrustN: number;
  readonly maximumPowerW: number;
  readonly diameterM: number;
  readonly rotation: "CW" | "CCW";
  readonly throttleUpKey: string | null;
  readonly throttleDownKey: string | null;
}

export interface DerivedAircraftPhysics {
  readonly surfaces: readonly AerodynamicSurface[];
  readonly panels: readonly AerodynamicPanel[];
  readonly propulsors: readonly FlightPropulsor[];
  readonly meshPanelCount: number;
  readonly fallbackPanelCount: number;
}

export interface GeometryDragEstimate {
  readonly referenceAreaM2: number;
  readonly projectedFrontalAreaM2: number;
  readonly wettedPanelAreaM2: number;
  readonly surfaceProfileCoefficient: number;
  readonly pressureCoefficient: number;
  readonly attachedFlowCoefficient: number;
  readonly skinFrictionCoefficient: number;
  readonly totalBaseCoefficient: number;
  readonly equivalentDragAreaM2: number;
}

export interface GeometryAerodynamicEstimate {
  readonly liftCoefficient: number;
  readonly dragCoefficient: number;
  readonly sideForceCoefficient: number;
  readonly rollMomentCoefficient: number;
  readonly pitchMomentCoefficient: number;
  readonly yawMomentCoefficient: number;
}

const LIFTING_TYPES = new Set<ComponentType>([
  "wing",
  "horizontal_stabilizer",
  "canard",
  "control_surface",
  "flap",
  "aileron",
  "elevator",
  "elevon",
  "flaperon",
  "spoiler",
  "air_brake"
]);

const VERTICAL_TYPES = new Set<ComponentType>(["vertical_stabilizer", "rudder"]);

const INTERNAL_TYPES = new Set<ComponentType>([
  "motor",
  "propeller",
  "rotor",
  "tilt_mechanism",
  "servo",
  "battery",
  "fuel_tank",
  "esc",
  "flight_controller",
  "camera",
  "lidar",
  "gps",
  "payload",
  "ballast",
  "parachute",
  "generic_mass",
  "collision_only",
  "visual_only",
  "cfd_excluded"
]);

const finiteProperty = (component: VehicleComponent, key: string, fallback: number): number => {
  const value = Number(component.properties[key]);
  return Number.isFinite(value) ? value : fallback;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

const stringProperty = (component: VehicleComponent, key: string): string | null => {
  const value = component.properties[key];
  return typeof value === "string" && value.length > 0 ? value : null;
};

export function defaultAerodynamicEnabled(component: VehicleComponent): boolean {
  return (
    component.visible &&
    component.type !== "visual_only" &&
    component.type !== "collision_only" &&
    component.type !== "cfd_excluded" &&
    (component.cfdIncluded || !INTERNAL_TYPES.has(component.type))
  );
}

export function componentAerodynamicEnabled(component: VehicleComponent): boolean {
  const configured = component.properties.aeroEnabled;
  return typeof configured === "boolean" ? configured : defaultAerodynamicEnabled(component);
}

function rotateEuler(vector: Vector3, rotationRad: Vector3): FlightVector {
  const [roll, pitch, yaw] = rotationRad;
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const afterRoll: FlightVector = [
    vector[0],
    cr * vector[1] - sr * vector[2],
    sr * vector[1] + cr * vector[2]
  ];
  const afterPitch: FlightVector = [
    cp * afterRoll[0] + sp * afterRoll[2],
    afterRoll[1],
    -sp * afterRoll[0] + cp * afterRoll[2]
  ];
  return [
    cy * afterPitch[0] - sy * afterPitch[1],
    sy * afterPitch[0] + cy * afterPitch[1],
    afterPitch[2]
  ];
}

const add = (left: Vector3, right: Vector3): FlightVector => [
  left[0] + right[0],
  left[1] + right[1],
  left[2] + right[2]
];

function scaledLocalPoint(component: VehicleComponent, point: Vector3): FlightVector {
  return [
    point[0] * component.transform.scale[0],
    point[1] * component.transform.scale[1],
    point[2] * component.transform.scale[2]
  ];
}

function transformPoint(component: VehicleComponent, point: Vector3): FlightVector {
  return add(
    component.transform.translationM,
    rotateEuler(scaledLocalPoint(component, point), component.transform.rotationRad)
  );
}

function liftingControl(component: VehicleComponent): AerodynamicSurface["control"] {
  if (component.type === "aileron") return "roll";
  if (component.type === "flaperon") return "flaperon";
  if (component.type === "elevon") return "elevon";
  if (component.type === "flap") return "flap";
  if (["spoiler", "air_brake"].includes(component.type)) return "brake";
  if (["elevator", "canard", "control_surface"].includes(component.type)) {
    return "pitch";
  }
  return "none";
}

function panelControlAxis(component: VehicleComponent): FlightVector {
  return rotateEuler(
    VERTICAL_TYPES.has(component.type) ? [0, 0, 1] : [0, 1, 0],
    component.transform.rotationRad
  );
}

function rotateAroundAxis(vector: Vector3, axis: Vector3, angleRad: number): FlightVector {
  if (Math.abs(angleRad) <= 1e-12 || magnitude3(axis) <= 1e-12) return [...vector];
  const unitAxis = normalize3(axis);
  const cosine = Math.cos(angleRad);
  const sine = Math.sin(angleRad);
  const parallel = scale3(unitAxis, dot3(unitAxis, vector) * (1 - cosine));
  const rotated = add(
    add(scale3(vector, cosine), scale3(cross3(unitAxis, vector), sine)),
    parallel
  );
  return normalize3(rotated);
}

/**
 * Calculates a local load from the triangle orientation and local relative wind.
 *
 * This is a geometry-first reduced-order surface model: closed shells receive
 * windward pressure, every surface receives tangential skin friction, and thin
 * or paired shell faces receive a bounded attached-flow normal reaction. It
 * does not require an airfoil name or coefficient table and does not pretend to
 * resolve a CFD flow field.
 */
export function aerodynamicPanelLoad(
  panel: AerodynamicPanel,
  airVelocityBodyMS: Vector3,
  densityKgM3: number,
  controlCommand = 0
): AerodynamicPanelLoad {
  const speedMS = magnitude3(airVelocityBodyMS);
  const dynamicPressurePa = 0.5 * densityKgM3 * speedMS ** 2;
  const deflectionRad = clamp(controlCommand, -1, 1) * panel.controlEffectivenessRad;
  const normalBody = rotateAroundAxis(
    normalize3(panel.normalBody),
    panel.controlAxisBody,
    deflectionRad
  );
  if (speedMS <= 1e-9 || dynamicPressurePa <= 0 || panel.areaM2 <= 0) {
    return {
      forceBodyN: [0, 0, 0],
      dynamicPressurePa,
      pressureForceN: 0,
      attachedFlowForceN: 0,
      frictionForceN: 0,
      incidenceAngleRad: 0,
      normalBody
    };
  }

  const flowDirection = scale3(airVelocityBodyMS, 1 / speedMS);
  const signedAlignment = clamp(dot3(flowDirection, normalBody), -1, 1);
  const absoluteAlignment = Math.abs(signedAlignment);
  const tangentVector = subtract3(flowDirection, scale3(normalBody, signedAlignment));
  const tangentFraction = magnitude3(tangentVector);
  const tangentDirection =
    tangentFraction <= 1e-9 ? ([0, 0, 0] as const) : scale3(tangentVector, 1 / tangentFraction);
  const pressureAlignment =
    panel.flowModel === "closed_shell" ? Math.max(0, signedAlignment) : absoluteAlignment;
  const pressureForceN =
    dynamicPressurePa * panel.areaM2 * panel.pressureCoefficient * pressureAlignment ** 2;
  const pressureDirection =
    panel.flowModel === "closed_shell"
      ? scale3(normalBody, -1)
      : scale3(normalBody, signedAlignment < 0 ? 1 : -1);

  const incidenceAngleRad = Math.asin(absoluteAlignment);
  const attachedCoefficient = Math.min(
    panel.maximumAttachedFlowCoefficient,
    panel.attachedFlowSlopePerRad * incidenceAngleRad * tangentFraction
  );
  const shellPairScale = panel.flowModel === "closed_shell" ? 0.5 : 1;
  const attachedFlowForceN =
    dynamicPressurePa * panel.areaM2 * attachedCoefficient * shellPairScale;
  const attachedDirection = scale3(normalBody, signedAlignment < 0 ? 1 : -1);

  const frictionForceN =
    dynamicPressurePa * panel.areaM2 * panel.skinFrictionCoefficient * tangentFraction ** 2;
  return {
    forceBodyN: add(
      add(scale3(pressureDirection, pressureForceN), scale3(attachedDirection, attachedFlowForceN)),
      scale3(tangentDirection, -frictionForceN)
    ),
    dynamicPressurePa,
    pressureForceN,
    attachedFlowForceN,
    frictionForceN,
    incidenceAngleRad: Math.sign(signedAlignment) * incidenceAngleRad,
    normalBody
  };
}

function surfaceFromComponent(
  component: VehicleComponent,
  defaultLiftSlopePerRad: number
): AerodynamicSurface | null {
  const vertical = VERTICAL_TYPES.has(component.type);
  if (!vertical && !LIFTING_TYPES.has(component.type)) return null;
  const baseRootChordM = finiteProperty(
    component,
    "rootChordM",
    Math.max(component.geometry.boundingBoxM[0], 0.01)
  );
  const baseTipChordM = finiteProperty(component, "tipChordM", baseRootChordM * 0.65);
  const baseSpanM = vertical
    ? finiteProperty(
        component,
        "heightM",
        Math.max(component.geometry.boundingBoxM[2], component.geometry.boundingBoxM[1], 0.01)
      )
    : finiteProperty(component, "semiSpanM", Math.max(component.geometry.boundingBoxM[1], 0.01));
  const rootChordM = baseRootChordM * component.transform.scale[0];
  const tipChordM = baseTipChordM * component.transform.scale[0];
  const spanM =
    baseSpanM * (vertical ? component.transform.scale[2] : component.transform.scale[1]);
  const calculatedAreaM2 = ((rootChordM + tipChordM) * spanM) / 2;
  const areaM2 = Math.max(
    0.0001,
    finiteProperty(component, "aeroReferenceAreaM2", calculatedAreaM2)
  );
  const aspectRatio = Math.max(0.2, spanM ** 2 / areaM2);
  const control = vertical && component.type === "rudder" ? "yaw" : liftingControl(component);
  const sideSign = component.transform.translationM[1] < 0 ? -1 : 1;
  return {
    componentId: component.id,
    parentComponentId: component.parentId,
    name: component.name,
    kind: vertical ? "vertical" : "horizontal",
    positionBodyM: component.transform.translationM,
    chordDirectionBody: rotateEuler([1, 0, 0], component.transform.rotationRad),
    spanDirectionBody: rotateEuler(
      vertical ? [0, 0, 1] : [0, 1, 0],
      component.transform.rotationRad
    ),
    areaM2,
    chordM: Math.max(0.001, (rootChordM + tipChordM) / 2),
    liftSlopePerRad: finiteProperty(component, "aeroLiftSlopePerRad", defaultLiftSlopePerRad),
    zeroLiftAngleRad: finiteProperty(component, "aeroZeroLiftAngleRad", (-2 * Math.PI) / 180),
    stallAngleRad: Math.max(
      (3 * Math.PI) / 180,
      Math.abs(finiteProperty(component, "aeroStallAngleRad", (15 * Math.PI) / 180))
    ),
    maximumLiftCoefficient: Math.max(
      0.05,
      finiteProperty(component, "aeroMaximumLiftCoefficient", vertical ? 1.05 : 1.35)
    ),
    baseDragCoefficient: Math.max(
      0,
      finiteProperty(component, "aeroBaseDragCoefficient", vertical ? 0.018 : 0.022)
    ),
    inducedDragFactor: Math.max(
      0,
      finiteProperty(component, "aeroInducedDragFactor", 1 / (Math.PI * 0.82 * aspectRatio))
    ),
    control,
    controlSign:
      control === "roll"
        ? -sideSign
        : control === "pitch" || control === "yaw"
          ? component.transform.translationM[0] < 0
            ? -1
            : 1
          : 1,
    controlEffectivenessRad: Math.max(
      0,
      finiteProperty(component, "aeroControlEffectivenessRad", (12 * Math.PI) / 180)
    )
  };
}

function fallbackPanels(component: VehicleComponent): readonly AerodynamicPanel[] {
  const [baseLength, baseWidth, baseHeight] = component.geometry.boundingBoxM;
  const length = baseLength * component.transform.scale[0];
  const width = baseWidth * component.transform.scale[1];
  const height = baseHeight * component.transform.scale[2];
  const half: FlightVector = [baseLength / 2, baseWidth / 2, baseHeight / 2];
  const definitions: readonly [FlightVector, FlightVector, number][] = [
    [[half[0], 0, 0], [1, 0, 0], width * height],
    [[-half[0], 0, 0], [-1, 0, 0], width * height],
    [[0, half[1], 0], [0, 1, 0], length * height],
    [[0, -half[1], 0], [0, -1, 0], length * height],
    [[0, 0, half[2]], [0, 0, 1], length * width],
    [[0, 0, -half[2]], [0, 0, -1], length * width]
  ];
  const pressureCoefficient = Math.max(
    0,
    finiteProperty(component, "aeroPressureCoefficient", 0.82)
  );
  const skinFrictionCoefficient = Math.max(
    0,
    finiteProperty(component, "aeroSkinFrictionCoefficient", 0.006)
  );
  const control =
    VERTICAL_TYPES.has(component.type) && component.type === "rudder"
      ? "yaw"
      : liftingControl(component);
  const sideSign = component.transform.translationM[1] < 0 ? -1 : 1;
  const controlSign =
    control === "roll"
      ? -sideSign
      : control === "pitch" || control === "yaw"
        ? component.transform.translationM[0] < 0
          ? -1
          : 1
        : 1;
  return definitions
    .filter(([, , areaM2]) => areaM2 > 1e-8)
    .map(([point, normal, areaM2]) => ({
      componentId: component.id,
      name: component.name,
      positionBodyM: transformPoint(component, point),
      normalBody: rotateEuler(normal, component.transform.rotationRad),
      areaM2,
      pressureCoefficient,
      skinFrictionCoefficient,
      attachedFlowSlopePerRad: 2 * Math.PI,
      maximumAttachedFlowCoefficient: 1.4,
      flowModel: "closed_shell" as const,
      control,
      controlSign,
      controlEffectivenessRad: Math.max(
        0,
        finiteProperty(component, "aeroControlEffectivenessRad", (12 * Math.PI) / 180)
      ),
      controlAxisBody: panelControlAxis(component),
      source: "bounding_box" as const
    }));
}

function meshIsWatertight(mesh: TriangleMesh): boolean {
  let extent = 1;
  for (const vertex of mesh.vertices) {
    extent = Math.max(extent, Math.abs(vertex[0]), Math.abs(vertex[1]), Math.abs(vertex[2]));
  }
  const tolerance = extent * 1e-8;
  const vertexKeys = mesh.vertices.map((vertex) =>
    vertex.map((value) => Math.round(value / tolerance)).join(",")
  );
  const edgeCounts = new Map<string, number>();
  for (const face of mesh.faces) {
    for (const [left, right] of [
      [face[0], face[1]],
      [face[1], face[2]],
      [face[2], face[0]]
    ] as const) {
      const ends = [
        vertexKeys[left] ?? `missing:${left}`,
        vertexKeys[right] ?? `missing:${right}`
      ].sort();
      const key = `${ends[0]}:${ends[1]}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }
  return edgeCounts.size > 0 && [...edgeCounts.values()].every((count) => count === 2);
}

function meshPanels(
  component: VehicleComponent,
  mesh: TriangleMesh,
  maximumPanels: number
): readonly AerodynamicPanel[] {
  if (mesh.faces.length === 0) return [];
  const minimum: [number, number, number] = [Infinity, Infinity, Infinity];
  const maximum: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const vertex of mesh.vertices) {
    const scaled = scaledLocalPoint(component, vertex);
    for (const axis of [0, 1, 2] as const) {
      minimum[axis] = Math.min(minimum[axis], scaled[axis]);
      maximum[axis] = Math.max(maximum[axis], scaled[axis]);
    }
  }
  const meshCenter: FlightVector = [
    (minimum[0] + maximum[0]) / 2,
    (minimum[1] + maximum[1]) / 2,
    (minimum[2] + maximum[2]) / 2
  ];
  const pressureCoefficient = Math.max(
    0,
    finiteProperty(component, "aeroPressureCoefficient", 0.9)
  );
  const skinFrictionCoefficient = Math.max(
    0,
    finiteProperty(component, "aeroSkinFrictionCoefficient", 0.005)
  );
  const flowModel = meshIsWatertight(mesh) ? "closed_shell" : "two_sided_surface";
  const surface = surfaceFromComponent(component, 2 * Math.PI);
  const control = surface?.control ?? "none";
  const controlSign = surface?.controlSign ?? 1;
  interface PanelBin {
    areaM2: number;
    weightedPosition: FlightVector;
    weightedNormal: FlightVector;
  }
  const spatialBinsPerAxis = maximumPanels >= 108 ? 3 : 2;
  const spatialBinCount = spatialBinsPerAxis ** 3;
  const elevationBins = Math.max(2, Math.floor(Math.sqrt(maximumPanels / spatialBinCount / 2)));
  const azimuthBins = Math.max(1, Math.floor(maximumPanels / spatialBinCount / elevationBins));
  const spatialBin = (value: number, axis: 0 | 1 | 2): number => {
    const range = maximum[axis] - minimum[axis];
    if (range <= 1e-12) return 0;
    return Math.min(
      spatialBinsPerAxis - 1,
      Math.floor(((value - minimum[axis]) / range) * spatialBinsPerAxis)
    );
  };
  const bins = new Map<string, PanelBin>();
  for (const face of mesh.faces) {
    const a = mesh.vertices[face[0]];
    const b = mesh.vertices[face[1]];
    const c = mesh.vertices[face[2]];
    if (a === undefined || b === undefined || c === undefined) continue;
    const scaledA = scaledLocalPoint(component, a);
    const scaledB = scaledLocalPoint(component, b);
    const scaledC = scaledLocalPoint(component, c);
    const cross = cross3(subtract3(scaledB, scaledA), subtract3(scaledC, scaledA));
    const triangleAreaM2 = magnitude3(cross) / 2;
    if (triangleAreaM2 <= 1e-12) continue;
    const centroid: FlightVector = [
      (scaledA[0] + scaledB[0] + scaledC[0]) / 3,
      (scaledA[1] + scaledB[1] + scaledC[1]) / 3,
      (scaledA[2] + scaledB[2] + scaledC[2]) / 3
    ];
    const rawNormal = normalize3(cross);
    const outwardNormal =
      dot3(rawNormal, subtract3(centroid, meshCenter)) < 0 ? scale3(rawNormal, -1) : rawNormal;
    const azimuth = Math.atan2(outwardNormal[1], outwardNormal[0]);
    const elevation = Math.asin(Math.max(-1, Math.min(1, outwardNormal[2])));
    const azimuthIndex = Math.min(
      azimuthBins - 1,
      Math.floor(((azimuth + Math.PI) / (2 * Math.PI)) * azimuthBins)
    );
    const elevationIndex = Math.min(
      elevationBins - 1,
      Math.floor(((elevation + Math.PI / 2) / Math.PI) * elevationBins)
    );
    const key = `${spatialBin(centroid[0], 0)}:${spatialBin(centroid[1], 1)}:${spatialBin(
      centroid[2],
      2
    )}:${azimuthIndex}:${elevationIndex}`;
    const bin = bins.get(key) ?? {
      areaM2: 0,
      weightedPosition: [0, 0, 0],
      weightedNormal: [0, 0, 0]
    };
    bin.areaM2 += triangleAreaM2;
    bin.weightedPosition = add(bin.weightedPosition, scale3(centroid, triangleAreaM2));
    bin.weightedNormal = add(bin.weightedNormal, scale3(outwardNormal, triangleAreaM2));
    bins.set(key, bin);
  }

  return [...bins.values()].flatMap((bin): AerodynamicPanel[] => {
    if (bin.areaM2 <= 1e-12 || magnitude3(bin.weightedNormal) <= 1e-12) return [];
    const localPosition = scale3(bin.weightedPosition, 1 / bin.areaM2);
    const outwardNormal = normalize3(bin.weightedNormal);
    return [
      {
        componentId: component.id,
        name: component.name,
        positionBodyM: add(
          component.transform.translationM,
          rotateEuler(localPosition, component.transform.rotationRad)
        ),
        normalBody: rotateEuler(outwardNormal, component.transform.rotationRad),
        areaM2: bin.areaM2,
        pressureCoefficient,
        skinFrictionCoefficient,
        attachedFlowSlopePerRad: 2 * Math.PI,
        maximumAttachedFlowCoefficient: Math.max(
          0.05,
          finiteProperty(component, "aeroMaximumLiftCoefficient", 1.4)
        ),
        flowModel,
        control,
        controlSign,
        controlEffectivenessRad: Math.max(
          0,
          finiteProperty(component, "aeroControlEffectivenessRad", (12 * Math.PI) / 180)
        ),
        controlAxisBody: panelControlAxis(component),
        source: "mesh"
      }
    ];
  });
}

export function deriveAircraftPhysics(
  project: AerocelProject,
  geometryAssets: ReadonlyMap<string, TriangleMesh>,
  maximumThrustByUnitId: ReadonlyMap<string, number>,
  defaultLiftSlopePerRad: number
): DerivedAircraftPhysics {
  const rawSurfaces: AerodynamicSurface[] = [];
  const panels: AerodynamicPanel[] = [];
  let meshPanelCount = 0;
  let fallbackPanelCount = 0;
  const maximumMeshPanels = 480;
  const eligibleMeshComponents = project.vehicle.components.filter(
    (component) =>
      componentAerodynamicEnabled(component) &&
      component.geometry.kind === "mesh" &&
      !INTERNAL_TYPES.has(component.type)
  );
  const panelsPerMesh = Math.max(
    24,
    Math.floor(maximumMeshPanels / Math.max(1, eligibleMeshComponents.length))
  );

  for (const component of project.vehicle.components) {
    if (!componentAerodynamicEnabled(component)) continue;
    const surface = surfaceFromComponent(component, defaultLiftSlopePerRad);
    if (INTERNAL_TYPES.has(component.type)) continue;
    const sha = component.geometry.sourceSha256;
    const mesh = sha === null ? undefined : geometryAssets.get(sha);
    if (component.geometry.kind === "mesh" && mesh !== undefined) {
      const componentPanels = meshPanels(component, mesh, panelsPerMesh);
      panels.push(...componentPanels);
      meshPanelCount += componentPanels.length;
      continue;
    }
    if (surface !== null) {
      rawSurfaces.push(surface);
      continue;
    }
    const componentPanels =
      component.geometry.kind === "mesh" && mesh !== undefined
        ? meshPanels(component, mesh, panelsPerMesh)
        : fallbackPanels(component);
    panels.push(...componentPanels);
    fallbackPanelCount += componentPanels.length;
  }

  const childSurfaceAreaByParent = new Map<string, number>();
  for (const surface of rawSurfaces) {
    if (surface.parentComponentId !== null && surface.control !== "none") {
      childSurfaceAreaByParent.set(
        surface.parentComponentId,
        (childSurfaceAreaByParent.get(surface.parentComponentId) ?? 0) + surface.areaM2
      );
    }
  }
  const surfaces = rawSurfaces.map((surface) => ({
    ...surface,
    areaM2: Math.max(
      0.0001,
      surface.areaM2 - (childSurfaceAreaByParent.get(surface.componentId) ?? 0)
    )
  }));

  const componentsById = new Map(
    project.vehicle.components.map((component) => [component.id, component] as const)
  );
  const propulsors = project.vehicle.propulsionUnits.flatMap((unit): FlightPropulsor[] => {
    const propeller = componentsById.get(unit.propellerComponentId);
    const motor = componentsById.get(unit.motorComponentId);
    const maximumThrustN = maximumThrustByUnitId.get(unit.id) ?? 0;
    if (propeller === undefined || motor === undefined || maximumThrustN <= 0) return [];
    return [
      {
        id: unit.id,
        name: unit.name,
        propellerComponentId: propeller.id,
        positionBodyM: propeller.transform.translationM,
        axisBody: rotateEuler(unit.axisLocal, propeller.transform.rotationRad),
        maximumThrustN,
        maximumPowerW: unit.motor.maxPowerW,
        diameterM: unit.diameterM,
        rotation: unit.rotation,
        throttleUpKey: stringProperty(propeller, "throttleUpKey"),
        throttleDownKey: stringProperty(propeller, "throttleDownKey")
      }
    ];
  });

  return { surfaces, panels, propulsors, meshPanelCount, fallbackPanelCount };
}

export function vectorProjectionArea(panel: AerodynamicPanel, velocityBodyMS: Vector3): number {
  const speed = magnitude3(velocityBodyMS);
  if (speed <= 1e-9) return 0;
  return panel.areaM2 * Math.abs(dot3(panel.normalBody, scale3(velocityBodyMS, 1 / speed)));
}

export function estimateGeometryAerodynamicLoads(
  panels: readonly AerodynamicPanel[],
  referenceAreaM2: number,
  referenceSpanM: number,
  referenceChordM: number,
  centerOfGravityBodyM: Vector3,
  flowDirectionBody: Vector3
): GeometryAerodynamicEstimate {
  if (referenceAreaM2 <= 0 || referenceSpanM <= 0 || referenceChordM <= 0) {
    throw new Error("Aerodynamic reference area, span, and chord must be positive");
  }
  const flowSpeed = magnitude3(flowDirectionBody);
  if (flowSpeed <= 1e-9) throw new Error("Aerodynamic flow direction must be non-zero");
  const direction = scale3(flowDirectionBody, 1 / flowSpeed);
  let forceBody: FlightVector = [0, 0, 0];
  let momentBody: FlightVector = [0, 0, 0];
  for (const panel of panels) {
    // density=2 and speed=1 makes dynamic pressure exactly 1 Pa, so the
    // accumulated force is force area and converts directly to coefficients.
    const load = aerodynamicPanelLoad(panel, direction, 2);
    forceBody = add(forceBody, load.forceBodyN);
    momentBody = add(
      momentBody,
      cross3(subtract3(panel.positionBodyM, centerOfGravityBodyM), load.forceBodyN)
    );
  }
  const liftDirection = normalize3(cross3([0, 1, 0], direction));
  const forceScale = 1 / referenceAreaM2;
  const spanMomentScale = 1 / (referenceAreaM2 * referenceSpanM);
  const chordMomentScale = 1 / (referenceAreaM2 * referenceChordM);
  return {
    liftCoefficient: dot3(forceBody, liftDirection) * forceScale,
    dragCoefficient: Math.max(0, -dot3(forceBody, direction) * forceScale),
    sideForceCoefficient: forceBody[1] * forceScale,
    rollMomentCoefficient: momentBody[0] * spanMomentScale,
    pitchMomentCoefficient: momentBody[1] * chordMomentScale,
    yawMomentCoefficient: momentBody[2] * spanMomentScale
  };
}

export function estimateGeometryDrag(
  physics: Pick<DerivedAircraftPhysics, "surfaces" | "panels">,
  referenceAreaM2: number,
  flowDirectionBody: Vector3
): GeometryDragEstimate {
  if (!Number.isFinite(referenceAreaM2) || referenceAreaM2 <= 0) {
    throw new Error("Drag reference area must be positive");
  }
  const flowSpeed = magnitude3(flowDirectionBody);
  if (flowSpeed <= 1e-9) throw new Error("Drag flow direction must be non-zero");
  const direction = scale3(flowDirectionBody, 1 / flowSpeed);
  let projectedFrontalAreaM2 = 0;
  let wettedPanelAreaM2 = 0;
  let surfaceProfileDragAreaM2 = 0;
  let pressureDragAreaM2 = 0;
  let attachedFlowDragAreaM2 = 0;
  let skinFrictionDragAreaM2 = 0;

  for (const surface of physics.surfaces) {
    surfaceProfileDragAreaM2 += surface.areaM2 * surface.baseDragCoefficient;
    const normal = normalize3(cross3(surface.chordDirectionBody, surface.spanDirectionBody));
    projectedFrontalAreaM2 += surface.areaM2 * Math.abs(dot3(normal, direction));
  }

  for (const panel of physics.panels) {
    const alignment = dot3(direction, panel.normalBody);
    const windwardAlignment =
      panel.flowModel === "closed_shell" ? Math.max(0, alignment) : Math.abs(alignment);
    projectedFrontalAreaM2 += panel.areaM2 * windwardAlignment;
    wettedPanelAreaM2 += panel.areaM2;
    pressureDragAreaM2 += panel.areaM2 * panel.pressureCoefficient * windwardAlignment ** 3;
    const tangentFraction = Math.sqrt(Math.max(0, 1 - alignment ** 2));
    const incidenceAngleRad = Math.asin(Math.min(1, Math.abs(alignment)));
    const attachedCoefficient = Math.min(
      panel.maximumAttachedFlowCoefficient,
      panel.attachedFlowSlopePerRad * incidenceAngleRad * tangentFraction
    );
    attachedFlowDragAreaM2 +=
      panel.areaM2 *
      attachedCoefficient *
      (panel.flowModel === "closed_shell" ? 0.5 : 1) *
      Math.abs(alignment);
    skinFrictionDragAreaM2 += panel.areaM2 * panel.skinFrictionCoefficient * tangentFraction ** 3;
  }

  const surfaceProfileCoefficient = surfaceProfileDragAreaM2 / referenceAreaM2;
  const pressureCoefficient = pressureDragAreaM2 / referenceAreaM2;
  const attachedFlowCoefficient = attachedFlowDragAreaM2 / referenceAreaM2;
  const skinFrictionCoefficient = skinFrictionDragAreaM2 / referenceAreaM2;
  const totalBaseCoefficient =
    surfaceProfileCoefficient +
    pressureCoefficient +
    attachedFlowCoefficient +
    skinFrictionCoefficient;
  return {
    referenceAreaM2,
    projectedFrontalAreaM2,
    wettedPanelAreaM2,
    surfaceProfileCoefficient,
    pressureCoefficient,
    attachedFlowCoefficient,
    skinFrictionCoefficient,
    totalBaseCoefficient,
    equivalentDragAreaM2: totalBaseCoefficient * referenceAreaM2
  };
}
