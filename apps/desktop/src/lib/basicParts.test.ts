import { describe, expect, it } from "vitest";
import { parseProject } from "@aerocel/simulation-schema";
import { addBasicPart } from "./basicParts";
import { createBlankProject } from "./projects";

describe("basic parts", () => {
  it("adds and validates a selected editable battery block", () => {
    const id = "f351282c-577f-45cd-8770-9631468f46c3";
    const project = addBasicPart(createBlankProject("Basic parts"), "battery", id);

    expect(project.vehicle.components[0]).toMatchObject({ id, type: "battery", mass: null });
    expect(project.vehicle.batteries[0]).toMatchObject({ id, series: 6, capacityAh: 5 });
    expect(() => parseProject(project)).not.toThrow();
  });

  it("keeps a lone propeller unpowered, then pairs it when a motor is added", () => {
    const propellerId = "f351282c-577f-45cd-8770-9631468f46c4";
    const motorId = "f351282c-577f-45cd-8770-9631468f46c5";
    const propellerOnly = addBasicPart(createBlankProject("Basic parts"), "propeller", propellerId);

    expect(propellerOnly.vehicle.components[0]?.properties.diameterM).toBe(0.3);
    expect(propellerOnly.vehicle.propulsionUnits).toHaveLength(0);

    const paired = addBasicPart(propellerOnly, "motor", motorId);
    expect(paired.vehicle.propulsionUnits[0]).toMatchObject({
      motorComponentId: motorId,
      propellerComponentId: propellerId,
      diameterM: 0.3,
      pitchM: 0.12,
      bladeCount: 2
    });
    expect(() => parseProject(paired)).not.toThrow();
  });

  it("adds a small connected motor and propeller in one step", () => {
    const motorId = "f351282c-577f-45cd-8770-9631468f46c6";
    const project = addBasicPart(createBlankProject("Combined motor"), "motor_propeller", motorId);

    expect(project.vehicle.components).toHaveLength(2);
    expect(project.vehicle.components[0]).toMatchObject({
      id: motorId,
      name: "Motor + propeller 1",
      geometry: { boundingBoxM: [0.07, 0.045, 0.045] }
    });
    expect(project.vehicle.components[1]?.parentId).toBe(motorId);
    expect(project.vehicle.propulsionUnits[0]).toMatchObject({ motorComponentId: motorId });
    expect(() => parseProject(project)).not.toThrow();
  });
});
