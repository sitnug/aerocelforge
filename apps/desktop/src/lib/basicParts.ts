import type { AerocelProject, ComponentType, VehicleComponent } from "@aerocel/simulation-schema";

export type BasicPartKind =
  | "body_block"
  | "wing"
  | "aileron"
  | "elevator"
  | "rudder"
  | "battery"
  | "motor_propeller"
  | "motor"
  | "propeller";

export interface BasicPartDefinition {
  readonly kind: BasicPartKind;
  readonly label: string;
  readonly description: string;
  readonly type: ComponentType;
  readonly boundingBoxM: readonly [number, number, number];
  readonly color: string;
  readonly cfdIncluded: boolean;
  readonly properties: Readonly<Record<string, unknown>>;
}

export const BASIC_PART_LIBRARY: readonly BasicPartDefinition[] = [
  {
    kind: "body_block",
    label: "Body block",
    description: "A simple box for a body, pod, or equipment shell.",
    type: "fairing",
    boundingBoxM: [0.4, 0.18, 0.12],
    color: "#86a79e",
    cfdIncluded: true,
    properties: { aeroEnabled: true, aeroPressureCoefficient: 0.82 }
  },
  {
    kind: "wing",
    label: "Wing",
    description: "A basic tapered lifting surface.",
    type: "wing",
    boundingBoxM: [0.36, 0.72, 0.025],
    color: "#8ca8a0",
    cfdIncluded: true,
    properties: { rootChordM: 0.36, tipChordM: 0.22, semiSpanM: 0.72 }
  },
  {
    kind: "aileron",
    label: "Aileron",
    description: "A movable surface for banking left and right.",
    type: "aileron",
    boundingBoxM: [0.18, 0.34, 0.018],
    color: "#73c8b1",
    cfdIncluded: true,
    properties: { rootChordM: 0.18, tipChordM: 0.14, semiSpanM: 0.34 }
  },
  {
    kind: "elevator",
    label: "Elevator",
    description: "A movable surface for pitching up and down.",
    type: "elevator",
    boundingBoxM: [0.18, 0.42, 0.018],
    color: "#73c8b1",
    cfdIncluded: true,
    properties: { rootChordM: 0.18, tipChordM: 0.13, semiSpanM: 0.42 }
  },
  {
    kind: "rudder",
    label: "Rudder",
    description: "A vertical movable surface for turning left and right.",
    type: "rudder",
    boundingBoxM: [0.2, 0.025, 0.32],
    color: "#73c8b1",
    cfdIncluded: true,
    properties: { rootChordM: 0.2, tipChordM: 0.12, heightM: 0.32 }
  },
  {
    kind: "battery",
    label: "Battery",
    description: "An editable battery block with safe starter values.",
    type: "battery",
    boundingBoxM: [0.18, 0.075, 0.055],
    color: "#d7a23c",
    cfdIncluded: false,
    properties: {
      series: 6,
      parallel: 1,
      capacityAh: 5,
      cellVoltageV: 4,
      maximumContinuousCurrentA: 50,
      stateOfCharge: 1
    }
  },
  {
    kind: "propeller",
    label: "Propeller",
    description: "A powered propeller with no separate motor block in the 3D view.",
    type: "propeller",
    boundingBoxM: [0.025, 0.3, 0.3],
    color: "#91aaa2",
    cfdIncluded: false,
    properties: {
      diameterM: 0.3,
      pitchM: 0.12,
      bladeCount: 2,
      maximumThrustN: 10,
      motorMaxPowerW: 600,
      motorMaxCurrentA: 30,
      motorKvRpmPerVolt: 700
    }
  },
  {
    kind: "motor_propeller",
    label: "Motor + propeller",
    description: "A small matched motor and propeller that is ready to set up and fly.",
    type: "motor",
    boundingBoxM: [0.045, 0.032, 0.032],
    color: "#d3a25a",
    cfdIncluded: false,
    properties: {}
  },
  {
    kind: "motor",
    label: "Motor",
    description: "A simple motor body. It pairs with the next unconnected propeller.",
    type: "motor",
    boundingBoxM: [0.045, 0.032, 0.032],
    color: "#d3a25a",
    cfdIncluded: false,
    properties: {
      maximumThrustN: 10,
      motorMaxPowerW: 600,
      motorMaxCurrentA: 30,
      motorKvRpmPerVolt: 700
    }
  }
];

function nextPartName(project: AerocelProject, definition: BasicPartDefinition): string {
  const count = project.vehicle.components.filter(
    (component) => component.type === definition.type
  ).length;
  return `${definition.label} ${count + 1}`;
}

function placementFor(project: AerocelProject): [number, number, number] {
  const index = project.vehicle.components.length;
  return [0, ((index % 5) - 2) * 0.18, Math.floor(index / 5) * 0.1];
}

export function addBasicPart(
  project: AerocelProject,
  kind: BasicPartKind,
  componentId = crypto.randomUUID()
): AerocelProject {
  if (kind === "motor_propeller") {
    const withMotor = addBasicPart(project, "motor", componentId);
    const propellerId = crypto.randomUUID();
    const provisional = addBasicPart(withMotor, "propeller", propellerId);
    const motor = provisional.vehicle.components.find((item) => item.id === componentId);
    const propeller = provisional.vehicle.components.find((item) => item.id === propellerId);
    if (motor === undefined || propeller === undefined) return provisional;

    const propulsionUnits = provisional.vehicle.propulsionUnits.filter(
      (unit) => unit.motorComponentId !== componentId && unit.propellerComponentId !== propellerId
    );
    const unitNumber = propulsionUnits.length + 1;
    const propulsionUnit = {
      id: crypto.randomUUID(),
      name: `Propulsion ${unitNumber}`,
      motorComponentId: componentId,
      propellerComponentId: propellerId,
      jointId: null,
      fidelity: "P0" as const,
      rotation: unitNumber % 2 === 1 ? ("CW" as const) : ("CCW" as const),
      configuration: "tractor" as const,
      axisLocal: [1, 0, 0] as [number, number, number],
      diameterM: 0.3,
      pitchM: 0.12,
      bladeCount: 2,
      motor: {
        kvRpmPerVolt: 700,
        windingResistanceOhm: 0.06,
        noLoadCurrentA: 1,
        maxCurrentA: 30,
        maxPowerW: 600,
        responseTimeS: 0.12,
        provenance: "user_entered" as const
      }
    };
    const motorNumber =
      project.vehicle.components.filter((component) => component.type === "motor").length + 1;
    const motorPosition = motor.transform.translationM;
    return {
      ...provisional,
      vehicle: {
        ...provisional.vehicle,
        components: provisional.vehicle.components.map((component) => {
          if (component.id === componentId) {
            return {
              ...component,
              name: `Motor + propeller ${motorNumber}`,
              properties: { ...component.properties, basicPartKind: kind }
            };
          }
          if (component.id === propellerId) {
            return {
              ...component,
              name: `Propeller ${motorNumber}`,
              parentId: componentId,
              transform: {
                ...component.transform,
                translationM: [motorPosition[0] + 0.03, motorPosition[1], motorPosition[2]]
              }
            };
          }
          return component;
        }),
        propulsionUnits: [...propulsionUnits, propulsionUnit]
      }
    };
  }
  const definition = BASIC_PART_LIBRARY.find((candidate) => candidate.kind === kind);
  if (definition === undefined) throw new Error(`Unknown basic part: ${kind}`);
  const name = nextPartName(project, definition);
  const component: VehicleComponent = {
    id: componentId,
    name,
    type: definition.type,
    parentId: null,
    visible: true,
    cfdIncluded: definition.cfdIncluded,
    transform: {
      translationM: placementFor(project),
      rotationRad: [0, 0, 0],
      scale: [1, 1, 1]
    },
    geometry: {
      kind: "procedural",
      source: `Aerocel Forge basic part · ${definition.label}`,
      sourceSha256: null,
      originalUnits: "m",
      boundingBoxM: [...definition.boundingBoxM],
      health: {
        watertight: true,
        openEdgeCount: 0,
        nonManifoldEdgeCount: 0,
        invertedNormalCount: 0,
        selfIntersectionCount: 0,
        status: "pass",
        notes: ["Basic editable shape. Replace its size and engineering values with measurements."]
      },
      repairs: []
    },
    mass: null,
    visual: { color: definition.color, opacity: 1 },
    properties: { ...definition.properties, basicPartKind: kind }
  };
  const components = [...project.vehicle.components, component];
  const usedMotorIds = new Set(
    project.vehicle.propulsionUnits.map((unit) => unit.motorComponentId)
  );
  const usedPropellerIds = new Set(
    project.vehicle.propulsionUnits.map((unit) => unit.propellerComponentId)
  );
  const pairedMotor =
    kind === "motor"
      ? component
      : kind === "propeller"
        ? (components.find(
            (candidate) => candidate.type === "motor" && !usedMotorIds.has(candidate.id)
          ) ?? component)
        : undefined;
  const pairedPropeller =
    kind === "propeller"
      ? component
      : kind === "motor"
        ? components.find(
            (candidate) => candidate.type === "propeller" && !usedPropellerIds.has(candidate.id)
          )
        : undefined;
  const positiveNumber = (value: unknown, fallback: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const propulsionUnit =
    pairedMotor === undefined || pairedPropeller === undefined
      ? null
      : {
          id: crypto.randomUUID(),
          name: `Propulsion ${project.vehicle.propulsionUnits.length + 1}`,
          motorComponentId: pairedMotor.id,
          propellerComponentId: pairedPropeller.id,
          jointId: null,
          fidelity: "P0" as const,
          rotation:
            project.vehicle.propulsionUnits.length % 2 === 0 ? ("CW" as const) : ("CCW" as const),
          configuration: "tractor" as const,
          axisLocal: [1, 0, 0] as [number, number, number],
          diameterM: positiveNumber(pairedPropeller.properties.diameterM, 0.3),
          pitchM: positiveNumber(pairedPropeller.properties.pitchM, 0.12),
          bladeCount: Math.max(
            1,
            Math.round(positiveNumber(pairedPropeller.properties.bladeCount, 2))
          ),
          motor: {
            kvRpmPerVolt: positiveNumber(pairedMotor.properties.motorKvRpmPerVolt, 700),
            windingResistanceOhm: 0.06,
            noLoadCurrentA: 1,
            maxCurrentA: positiveNumber(pairedMotor.properties.motorMaxCurrentA, 30),
            maxPowerW: positiveNumber(pairedMotor.properties.motorMaxPowerW, 600),
            responseTimeS: 0.12,
            provenance: "user_entered" as const
          }
        };
  const batteries =
    kind === "battery"
      ? [
          ...project.vehicle.batteries,
          {
            id: componentId,
            name,
            chemistry: "LiPo" as const,
            series: 6,
            parallel: 1,
            capacityAh: 5,
            cellOpenCircuitVoltageV: 4,
            cellInternalResistanceOhm: 0.004,
            maxContinuousCurrentA: 50,
            stateOfCharge: 1,
            provenance: "user_entered" as const
          }
        ]
      : project.vehicle.batteries;
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    vehicle: {
      ...project.vehicle,
      components,
      batteries,
      propulsionUnits:
        propulsionUnit === null
          ? project.vehicle.propulsionUnits
          : [...project.vehicle.propulsionUnits, propulsionUnit]
    }
  };
}
