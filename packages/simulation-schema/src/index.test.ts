import { describe, expect, it } from "vitest";
import { AerocelProjectSchema, SCHEMA_VERSION } from "./index";

describe("AerocelProjectSchema", () => {
  it("rejects a project whose joint references a missing component", () => {
    const project = {
      schemaVersion: SCHEMA_VERSION,
      projectId: "28637866-1aaf-4b75-8f13-5bf7c37c8c48",
      name: "Invalid",
      revision: "A",
      description: "",
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z",
      conventions: {
        internalUnits: "SI",
        bodyFrame: "FRD",
        worldFrame: "NED",
        angles: "radians",
        pressure: "absolute_pascal"
      },
      vehicle: {
        name: "Invalid",
        description: "",
        reference: {
          areaM2: 1,
          spanM: 1,
          chordM: 1,
          referencePointM: [0, 0, 0],
          provenance: "user_entered"
        },
        components: [
          {
            id: "36def521-6018-42a7-95c7-3a29fcb82961",
            name: "Body",
            type: "fuselage",
            parentId: null,
            visible: true,
            cfdIncluded: true,
            transform: {
              translationM: [0, 0, 0],
              rotationRad: [0, 0, 0],
              scale: [1, 1, 1]
            },
            geometry: {
              kind: "procedural",
              source: "test",
              sourceSha256: null,
              originalUnits: "m",
              boundingBoxM: [1, 1, 1],
              health: {
                watertight: null,
                openEdgeCount: null,
                nonManifoldEdgeCount: null,
                invertedNormalCount: null,
                selfIntersectionCount: null,
                status: "not_inspected",
                notes: []
              },
              repairs: []
            },
            mass: null,
            visual: { color: "#ffffff", opacity: 1 },
            properties: {}
          }
        ],
        joints: [
          {
            id: "c64125ae-29f5-4c9f-9b36-a589637cefc5",
            name: "Bad joint",
            type: "fixed",
            parentComponentId: "36def521-6018-42a7-95c7-3a29fcb82961",
            childComponentId: "a78e0e63-3ba6-4b1f-ac0e-65c0f032a65c",
            pivotM: [0, 0, 0],
            axis: [0, 1, 0],
            neutralRad: 0,
            minimumRad: 0,
            maximumRad: 0,
            rateLimitRadS: 1,
            accelerationLimitRadS2: 1,
            actualRad: 0,
            commandedRad: 0,
            failure: "none",
            provenance: "user_entered"
          }
        ],
        propulsionUnits: [],
        batteries: []
      },
      environment: {
        altitudeM: 0,
        temperatureK: null,
        windNedMS: [0, 0, 0],
        turbulence: "none",
        provenance: "user_entered"
      },
      results: [],
      tags: [],
      warnings: []
    };

    expect(AerocelProjectSchema.safeParse(project).success).toBe(false);

    const secondId = "a78e0e63-3ba6-4b1f-ac0e-65c0f032a65c";
    const cyclicProject = {
      ...project,
      vehicle: {
        ...project.vehicle,
        joints: [],
        components: [
          { ...project.vehicle.components[0], parentId: secondId },
          {
            ...project.vehicle.components[0],
            id: secondId,
            name: "Cyclic child",
            parentId: project.vehicle.components[0]?.id
          }
        ]
      }
    };
    const cyclicResult = AerocelProjectSchema.safeParse(cyclicProject);
    expect(cyclicResult.success).toBe(false);
    expect(cyclicResult.error?.issues.some((issue) => issue.message.includes("cycle"))).toBe(true);
  });
});
