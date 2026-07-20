import type { TriangleMesh } from "@aerocel/geometry-core";
import { describe, expect, it } from "vitest";
import {
  deriveAircraftPhysics,
  estimateGeometryAerodynamicLoads,
  estimateGeometryDrag
} from "./aircraftPhysics";
import { kestrelProject } from "./kestrel";

const thrustByUnit = new Map(
  kestrelProject.vehicle.propulsionUnits.map((unit) => [unit.id, 35] as const)
);

describe("per-part aircraft physics", () => {
  it("finds only real movable surfaces for each control axis", () => {
    const result = deriveAircraftPhysics(kestrelProject, new Map(), thrustByUnit, 4.7);

    expect(result.surfaces.filter((surface) => surface.control === "roll")).toHaveLength(2);
    expect(result.surfaces.filter((surface) => surface.control === "pitch")).toHaveLength(1);
    expect(result.surfaces.filter((surface) => surface.control === "yaw")).toHaveLength(1);
    expect(result.surfaces.filter((surface) => surface.control === "flap")).toHaveLength(2);
    expect(result.propulsors).toHaveLength(3);
  });

  it("keeps each surface size and position independent", () => {
    const portAileron = kestrelProject.vehicle.components.find(
      (component) => component.name === "Port aileron"
    );
    expect(portAileron).toBeDefined();
    if (portAileron === undefined) return;
    const changed = {
      ...kestrelProject,
      vehicle: {
        ...kestrelProject.vehicle,
        components: kestrelProject.vehicle.components.map((component) =>
          component.id === portAileron.id
            ? {
                ...component,
                transform: {
                  ...component.transform,
                  translationM: [0.2, -1.1, 0.1] as [number, number, number]
                },
                properties: { ...component.properties, semiSpanM: 0.7 }
              }
            : component
        )
      }
    };
    const originalPhysics = deriveAircraftPhysics(kestrelProject, new Map(), thrustByUnit, 4.7);
    const changedPhysics = deriveAircraftPhysics(changed, new Map(), thrustByUnit, 4.7);
    const originalSurface = originalPhysics.surfaces.find(
      (surface) => surface.componentId === portAileron.id
    );
    const changedSurface = changedPhysics.surfaces.find(
      (surface) => surface.componentId === portAileron.id
    );

    expect(changedSurface?.areaM2).toBeGreaterThan(originalSurface?.areaM2 ?? 0);
    expect(changedSurface?.positionBodyM).toEqual([0.2, -1.1, 0.1]);
  });

  it("turns imported triangle size and direction into pressure panels", () => {
    const sha = "a".repeat(64);
    const fuselage = kestrelProject.vehicle.components.find(
      (component) => component.type === "fuselage"
    );
    expect(fuselage).toBeDefined();
    if (fuselage === undefined) return;
    const mesh: TriangleMesh = {
      vertices: [
        [0, 0, 0],
        [0, 2, 0],
        [0, 0, 1]
      ],
      faces: [[0, 1, 2]]
    };
    const project = {
      ...kestrelProject,
      vehicle: {
        ...kestrelProject.vehicle,
        components: kestrelProject.vehicle.components.map((component) =>
          component.id === fuselage.id
            ? {
                ...component,
                transform: {
                  ...component.transform,
                  scale: [2, 2, 2] as [number, number, number]
                },
                geometry: {
                  ...component.geometry,
                  kind: "mesh" as const,
                  sourceSha256: sha
                }
              }
            : component
        )
      }
    };
    const result = deriveAircraftPhysics(project, new Map([[sha, mesh]]), thrustByUnit, 4.7);
    const panel = result.panels.find((item) => item.componentId === fuselage.id);

    expect(panel?.source).toBe("mesh");
    expect(panel?.areaM2).toBeCloseTo(4, 12);
    expect(panel?.normalBody).toEqual([1, 0, 0]);
  });

  it("keeps opposing imported-mesh faces in separate pressure directions", () => {
    const sha = "b".repeat(64);
    const fuselage = kestrelProject.vehicle.components.find(
      (component) => component.type === "fuselage"
    );
    expect(fuselage).toBeDefined();
    if (fuselage === undefined) return;
    const mesh: TriangleMesh = {
      vertices: [
        [0.5, 0, 0],
        [0.5, 1, 0],
        [0.5, 0, 1],
        [-0.5, 0, 0],
        [-0.5, 0, 1],
        [-0.5, 1, 0]
      ],
      faces: [
        [0, 1, 2],
        [3, 4, 5]
      ]
    };
    const project = {
      ...kestrelProject,
      vehicle: {
        ...kestrelProject.vehicle,
        components: kestrelProject.vehicle.components.map((component) =>
          component.id === fuselage.id
            ? {
                ...component,
                geometry: {
                  ...component.geometry,
                  kind: "mesh" as const,
                  sourceSha256: sha
                }
              }
            : component
        )
      }
    };
    const physics = deriveAircraftPhysics(project, new Map([[sha, mesh]]), thrustByUnit, 4.7);
    const meshPanels = physics.panels.filter((panel) => panel.componentId === fuselage.id);
    const drag = estimateGeometryDrag({ surfaces: [], panels: meshPanels }, 1, [1, 0, 0]);

    expect(meshPanels).toHaveLength(2);
    expect(meshPanels.map((panel) => panel.normalBody[0]).sort()).toEqual([-1, 1]);
    expect(drag.pressureCoefficient).toBeCloseTo(0.9, 12);
  });

  it("makes an unnamed imported surface generate lift directly from its geometry", () => {
    const sha = "c".repeat(64);
    const fuselage = kestrelProject.vehicle.components.find(
      (component) => component.type === "fuselage"
    );
    expect(fuselage).toBeDefined();
    if (fuselage === undefined) return;
    const mesh: TriangleMesh = {
      vertices: [
        [-0.5, -0.5, 0],
        [0.5, -0.5, 0],
        [0.5, 0.5, 0],
        [-0.5, 0.5, 0]
      ],
      faces: [
        [0, 1, 2],
        [0, 2, 3]
      ]
    };
    const project = {
      ...kestrelProject,
      vehicle: {
        ...kestrelProject.vehicle,
        components: [
          {
            ...fuselage,
            type: "fairing" as const,
            transform: {
              ...fuselage.transform,
              translationM: [0, 0, 0] as [number, number, number],
              scale: [1, 1, 1] as [number, number, number],
              rotationRad: [0, 0, 0] as [number, number, number]
            },
            geometry: { ...fuselage.geometry, kind: "mesh" as const, sourceSha256: sha }
          }
        ],
        joints: [],
        propulsionUnits: []
      }
    };
    const physics = deriveAircraftPhysics(project, new Map([[sha, mesh]]), new Map(), 4.7);
    const angleRad = (5 * Math.PI) / 180;
    const positive = estimateGeometryAerodynamicLoads(
      physics.panels,
      1,
      1,
      1,
      [0, 0, 0],
      [Math.cos(angleRad), 0, Math.sin(angleRad)]
    );
    const negative = estimateGeometryAerodynamicLoads(
      physics.panels,
      1,
      1,
      1,
      [0, 0, 0],
      [Math.cos(angleRad), 0, -Math.sin(angleRad)]
    );

    expect(physics.surfaces).toHaveLength(0);
    expect(physics.panels.every((panel) => panel.flowModel === "two_sided_surface")).toBe(true);
    expect(positive.liftCoefficient).toBeGreaterThan(0.4);
    expect(negative.liftCoefficient).toBeLessThan(-0.4);
    expect(positive.dragCoefficient).toBeGreaterThan(0);
  });

  it("uses imported control-surface triangles instead of an airfoil lookup", () => {
    const sha = "d".repeat(64);
    const aileron = kestrelProject.vehicle.components.find(
      (component) => component.type === "aileron"
    );
    expect(aileron).toBeDefined();
    if (aileron === undefined) return;
    const mesh: TriangleMesh = {
      vertices: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0]
      ],
      faces: [[0, 1, 2]]
    };
    const project = {
      ...kestrelProject,
      vehicle: {
        ...kestrelProject.vehicle,
        components: [
          {
            ...aileron,
            geometry: { ...aileron.geometry, kind: "mesh" as const, sourceSha256: sha }
          }
        ],
        joints: [],
        propulsionUnits: []
      }
    };
    const physics = deriveAircraftPhysics(project, new Map([[sha, mesh]]), new Map(), 4.7);

    expect(physics.surfaces).toHaveLength(0);
    expect(physics.panels).toHaveLength(1);
    expect(physics.panels[0]?.control).toBe("roll");
  });

  it("keeps combined elevon and flaperon control roles", () => {
    const changed = {
      ...kestrelProject,
      vehicle: {
        ...kestrelProject.vehicle,
        components: kestrelProject.vehicle.components.map((component) => {
          if (component.name === "Port aileron") return { ...component, type: "elevon" as const };
          if (component.name === "Starboard flap") {
            return { ...component, type: "flaperon" as const };
          }
          return component;
        })
      }
    };
    const result = deriveAircraftPhysics(changed, new Map(), thrustByUnit, 4.7);

    expect(result.surfaces.find((surface) => surface.name === "Port aileron")?.control).toBe(
      "elevon"
    );
    expect(result.surfaces.find((surface) => surface.name === "Starboard flap")?.control).toBe(
      "flaperon"
    );
  });

  it("derives much more pressure drag from a blunt body than a slender body", () => {
    const fuselage = kestrelProject.vehicle.components.find(
      (component) => component.type === "fuselage"
    );
    expect(fuselage).toBeDefined();
    if (fuselage === undefined) return;
    const physicsForSize = (boundingBoxM: readonly [number, number, number]) =>
      deriveAircraftPhysics(
        {
          ...kestrelProject,
          vehicle: {
            ...kestrelProject.vehicle,
            components: [
              {
                ...fuselage,
                geometry: { ...fuselage.geometry, boundingBoxM: [...boundingBoxM] }
              }
            ],
            joints: [],
            propulsionUnits: []
          }
        },
        new Map(),
        new Map(),
        4.7
      );
    const blunt = estimateGeometryDrag(physicsForSize([1, 1, 1]), 1, [1, 0, 0]);
    const slender = estimateGeometryDrag(physicsForSize([10, 0.1, 0.1]), 1, [1, 0, 0]);

    expect(blunt.pressureCoefficient).toBeCloseTo(0.82, 12);
    expect(blunt.totalBaseCoefficient).toBeGreaterThan(0.8);
    expect(slender.totalBaseCoefficient).toBeLessThan(0.05);
    expect(blunt.totalBaseCoefficient).toBeGreaterThan(slender.totalBaseCoefficient * 15);
  });
});
