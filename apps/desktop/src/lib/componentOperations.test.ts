import { AerocelProjectSchema } from "@aerocel/simulation-schema";
import { describe, expect, it } from "vitest";
import { kestrelProject } from "./kestrel";
import { applyComponentDeletion, planComponentDeletion } from "./componentOperations";

describe("component deletion", () => {
  it("removes an attached subtree and every relationship that points into it", () => {
    const portMotor = kestrelProject.vehicle.components.find(
      (component) => component.name === "Port tilt motor"
    );
    expect(portMotor).toBeDefined();
    const plan = planComponentDeletion(kestrelProject, portMotor?.id ?? "");

    expect(plan.componentNames).toEqual(["Port tilt motor", "Port propeller"]);
    expect(plan.jointIds).toHaveLength(1);
    expect(plan.propulsionUnitIds).toHaveLength(1);

    const updated = applyComponentDeletion(kestrelProject, plan);
    expect(updated.vehicle.components).toHaveLength(kestrelProject.vehicle.components.length - 2);
    expect(updated.vehicle.joints).toHaveLength(kestrelProject.vehicle.joints.length - 1);
    expect(updated.vehicle.propulsionUnits).toHaveLength(
      kestrelProject.vehicle.propulsionUnits.length - 1
    );
    expect(() => AerocelProjectSchema.parse(updated)).not.toThrow();
  });

  it("can return a project to a valid empty file", () => {
    const fuselage = kestrelProject.vehicle.components.find(
      (component) => component.name === "Central fuselage"
    );
    const plan = planComponentDeletion(kestrelProject, fuselage?.id ?? "");
    const updated = applyComponentDeletion(kestrelProject, plan);

    expect(updated.vehicle.components).toEqual([]);
    expect(updated.vehicle.joints).toEqual([]);
    expect(updated.vehicle.propulsionUnits).toEqual([]);
    expect(updated.vehicle.batteries).toEqual([]);
    expect(() => AerocelProjectSchema.parse(updated)).not.toThrow();
  });
});
