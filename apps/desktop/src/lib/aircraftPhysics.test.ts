import type { TriangleMesh } from "@aerocel/geometry-core";
import { describe, expect, it } from "vitest";
import { deriveAircraftPhysics } from "./aircraftPhysics";
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
});
