import { z } from "zod";

export const SCHEMA_VERSION = "1.0.0" as const;

export const ProvenanceSchema = z.enum([
  "estimated",
  "solver_derived",
  "interpolated",
  "extrapolated",
  "user_entered",
  "manufacturer",
  "experimentally_validated"
]);

export type Provenance = z.infer<typeof ProvenanceSchema>;

export const QualityGradeSchema = z.enum([
  "invalid",
  "unconverged",
  "preliminary",
  "numerically_stable",
  "mesh_checked",
  "experimentally_calibrated"
]);

export const ComponentTypeSchema = z.enum([
  "fuselage",
  "wing",
  "horizontal_stabilizer",
  "vertical_stabilizer",
  "canard",
  "boom",
  "pylon",
  "nacelle",
  "fairing",
  "control_surface",
  "flap",
  "aileron",
  "elevator",
  "rudder",
  "elevon",
  "flaperon",
  "spoiler",
  "air_brake",
  "motor",
  "propeller",
  "rotor",
  "duct",
  "tilt_mechanism",
  "servo",
  "landing_gear",
  "wheel",
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

export type ComponentType = z.infer<typeof ComponentTypeSchema>;

const Vector3Schema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const Matrix3Schema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite()
]);

export const TransformSchema = z.object({
  translationM: Vector3Schema,
  rotationRad: Vector3Schema,
  scale: Vector3Schema.refine((value) => value.every((entry) => entry > 0), {
    message: "Scale entries must be positive"
  })
});

const GeometryHealthSchema = z.object({
  watertight: z.boolean().nullable(),
  openEdgeCount: z.number().int().nonnegative().nullable(),
  nonManifoldEdgeCount: z.number().int().nonnegative().nullable(),
  invertedNormalCount: z.number().int().nonnegative().nullable(),
  selfIntersectionCount: z.number().int().nonnegative().nullable(),
  status: z.enum(["not_inspected", "pass", "warning", "fatal"]),
  notes: z.array(z.string())
});

const GeometrySchema = z.object({
  kind: z.enum(["procedural", "mesh", "brep", "point_mass"]),
  source: z.string().min(1),
  sourceSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  originalUnits: z.enum(["mm", "cm", "m", "in", "ft"]),
  boundingBoxM: Vector3Schema.refine((value) => value.every((entry) => entry >= 0), {
    message: "Bounding-box dimensions cannot be negative"
  }),
  health: GeometryHealthSchema,
  repairs: z.array(
    z.object({
      operation: z.string(),
      timestamp: z.string().datetime(),
      parameters: z.record(z.string(), z.unknown())
    })
  )
});

const MassSchema = z.object({
  valueKg: z.number().nonnegative(),
  cgLocalM: Vector3Schema,
  inertiaKgM2: Matrix3Schema,
  uncertaintyKg: z.number().nonnegative(),
  provenance: ProvenanceSchema,
  note: z.string()
});

export const ComponentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  type: ComponentTypeSchema,
  parentId: z.string().uuid().nullable(),
  visible: z.boolean(),
  cfdIncluded: z.boolean(),
  transform: TransformSchema,
  geometry: GeometrySchema,
  mass: MassSchema.nullable(),
  visual: z.object({
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    opacity: z.number().min(0).max(1)
  }),
  properties: z.record(z.string(), z.unknown())
});

const JointSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.enum(["fixed", "revolute", "prismatic", "spherical", "coupled", "gear_linked"]),
  parentComponentId: z.string().uuid(),
  childComponentId: z.string().uuid(),
  pivotM: Vector3Schema,
  axis: Vector3Schema,
  neutralRad: z.number(),
  minimumRad: z.number(),
  maximumRad: z.number(),
  rateLimitRadS: z.number().positive(),
  accelerationLimitRadS2: z.number().positive(),
  actualRad: z.number(),
  commandedRad: z.number(),
  failure: z.enum(["none", "jammed", "slow", "disconnected"]),
  provenance: ProvenanceSchema
});

const PropulsionUnitSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  motorComponentId: z.string().uuid(),
  propellerComponentId: z.string().uuid(),
  jointId: z.string().uuid().nullable(),
  fidelity: z.enum(["P0", "P1", "P2", "P3", "P4"]),
  rotation: z.enum(["CW", "CCW"]),
  configuration: z.enum(["tractor", "pusher"]),
  axisLocal: Vector3Schema,
  diameterM: z.number().positive(),
  pitchM: z.number().positive(),
  bladeCount: z.number().int().min(1),
  motor: z.object({
    kvRpmPerVolt: z.number().positive(),
    windingResistanceOhm: z.number().positive(),
    noLoadCurrentA: z.number().nonnegative(),
    maxCurrentA: z.number().positive(),
    maxPowerW: z.number().positive(),
    responseTimeS: z.number().positive(),
    provenance: ProvenanceSchema
  })
});

const BatterySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  chemistry: z.enum(["LiPo", "Li-ion", "LiFePO4", "custom"]),
  series: z.number().int().positive(),
  parallel: z.number().int().positive(),
  capacityAh: z.number().positive(),
  cellOpenCircuitVoltageV: z.number().positive(),
  cellInternalResistanceOhm: z.number().nonnegative(),
  maxContinuousCurrentA: z.number().positive(),
  stateOfCharge: z.number().min(0).max(1),
  provenance: ProvenanceSchema
});

export const AerocelProjectSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    projectId: z.string().uuid(),
    name: z.string().min(1),
    revision: z.string().min(1),
    description: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    conventions: z.object({
      internalUnits: z.literal("SI"),
      bodyFrame: z.literal("FRD"),
      worldFrame: z.literal("NED"),
      angles: z.literal("radians"),
      pressure: z.literal("absolute_pascal")
    }),
    vehicle: z.object({
      name: z.string().min(1),
      description: z.string(),
      reference: z.object({
        areaM2: z.number().positive(),
        spanM: z.number().positive(),
        chordM: z.number().positive(),
        referencePointM: Vector3Schema,
        provenance: ProvenanceSchema
      }),
      components: z.array(ComponentSchema),
      joints: z.array(JointSchema),
      propulsionUnits: z.array(PropulsionUnitSchema),
      batteries: z.array(BatterySchema)
    }),
    environment: z.object({
      altitudeM: z.number(),
      temperatureK: z.number().positive().nullable(),
      windNedMS: Vector3Schema,
      turbulence: z.enum(["none", "dryden", "von_karman", "custom"]),
      provenance: ProvenanceSchema
    }),
    results: z.array(z.string()),
    tags: z.array(z.string()),
    warnings: z.array(z.string())
  })
  .superRefine((project, context) => {
    const componentIds = new Set(project.vehicle.components.map((component) => component.id));
    const componentsById = new Map(
      project.vehicle.components.map((component) => [component.id, component] as const)
    );
    for (const component of project.vehicle.components) {
      if (component.parentId !== null && !componentIds.has(component.parentId)) {
        context.addIssue({
          code: "custom",
          path: ["vehicle", "components"],
          message: `Component ${component.name} references a missing parent`
        });
      }
      const visited = new Set<string>([component.id]);
      let parentId = component.parentId;
      while (parentId !== null) {
        if (visited.has(parentId)) {
          context.addIssue({
            code: "custom",
            path: ["vehicle", "components"],
            message: `Component hierarchy contains a cycle involving ${component.name}`
          });
          break;
        }
        visited.add(parentId);
        parentId = componentsById.get(parentId)?.parentId ?? null;
      }
    }
    for (const joint of project.vehicle.joints) {
      if (!componentIds.has(joint.parentComponentId) || !componentIds.has(joint.childComponentId)) {
        context.addIssue({
          code: "custom",
          path: ["vehicle", "joints"],
          message: `Joint ${joint.name} references a missing component`
        });
      }
      if (joint.minimumRad > joint.maximumRad) {
        context.addIssue({
          code: "custom",
          path: ["vehicle", "joints"],
          message: `Joint ${joint.name} has inverted limits`
        });
      }
    }
  });

export type AerocelProject = z.infer<typeof AerocelProjectSchema>;
export type VehicleComponent = z.infer<typeof ComponentSchema>;

export function parseProject(value: unknown): AerocelProject {
  return AerocelProjectSchema.parse(value);
}

export function migrateProject(value: unknown): AerocelProject {
  if (typeof value !== "object" || value === null || !("schemaVersion" in value)) {
    throw new Error("Cannot migrate a project without a schemaVersion");
  }
  const version = value.schemaVersion;
  if (version === SCHEMA_VERSION) {
    return parseProject(value);
  }
  throw new Error(`Unsupported Aerocel Forge project schema version: ${String(version)}`);
}
