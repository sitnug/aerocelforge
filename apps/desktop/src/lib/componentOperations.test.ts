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

  it("will not delete the entire aircraft", () => {
    const fuselage = kestrelProject.vehicle.components.find(
      (component) => component.name === "Central fuselage"
    );
    expect(() => planComponentDeletion(kestrelProject, fuselage?.id ?? "")).toThrow(
      "at least one part"
    );
  });
});
