import { AerocelProjectSchema } from "@aerocel/simulation-schema";
import { describe, expect, it } from "vitest";
import { kestrelProject } from "./kestrel";
import {
  configuredMotorThrustN,
  setComponentBehaviorValue,
  setComponentEngineeringValue
} from "./componentProperties";

describe("part engineering properties", () => {
  it("keeps motor component settings and the live propulsion unit in sync", () => {
    const motorId = kestrelProject.vehicle.propulsionUnits[0]?.motorComponentId ?? "";
    let updated = setComponentEngineeringValue(kestrelProject, motorId, "motorMaxPowerW", 1_550);
    updated = setComponentEngineeringValue(updated, motorId, "maximumThrustN", 42);

    expect(updated.vehicle.propulsionUnits[0]?.motor.maxPowerW).toBe(1_550);
    expect(configuredMotorThrustN(updated, motorId)).toBe(42);
    expect(() => AerocelProjectSchema.parse(updated)).not.toThrow();
  });

  it("updates propeller and battery records used by analysis", () => {
    const propellerId = kestrelProject.vehicle.propulsionUnits[0]?.propellerComponentId ?? "";
    const batteryId = kestrelProject.vehicle.batteries[0]?.id ?? "";
    let updated = setComponentEngineeringValue(kestrelProject, propellerId, "diameterM", 0.5);
    updated = setComponentEngineeringValue(updated, propellerId, "bladeCount", 3);
    updated = setComponentEngineeringValue(updated, batteryId, "batteryCapacityAh", 12);

    expect(updated.vehicle.propulsionUnits[0]?.diameterM).toBe(0.5);
    expect(updated.vehicle.propulsionUnits[0]?.bladeCount).toBe(3);
    expect(updated.vehicle.batteries[0]?.capacityAh).toBe(12);
    expect(() => AerocelProjectSchema.parse(updated)).not.toThrow();
  });

  it("updates visible wing geometry and aerodynamic reference values together", () => {
    const wing = kestrelProject.vehicle.components.find((component) => component.type === "wing");
    const updated = setComponentEngineeringValue(kestrelProject, wing?.id ?? "", "semiSpanM", 1.2);
    const updatedWing = updated.vehicle.components.find((component) => component.id === wing?.id);

    expect(updatedWing?.geometry.boundingBoxM[1]).toBe(1.2);
    expect(updated.vehicle.reference.spanM).toBeGreaterThan(kestrelProject.vehicle.reference.spanM);
    expect(() => AerocelProjectSchema.parse(updated)).not.toThrow();
  });

  it("keeps aerodynamic settings and propeller keys separate for every part", () => {
    const [leftWing, rightWing] = kestrelProject.vehicle.components.filter(
      (component) => component.type === "wing"
    );
    const [leftPropeller, rightPropeller] = kestrelProject.vehicle.components.filter(
      (component) => component.type === "propeller"
    );
    expect(leftWing).toBeDefined();
    expect(rightWing).toBeDefined();
    expect(leftPropeller).toBeDefined();
    expect(rightPropeller).toBeDefined();
    if (
      leftWing === undefined ||
      rightWing === undefined ||
      leftPropeller === undefined ||
      rightPropeller === undefined
    )
      return;
    let updated = setComponentEngineeringValue(
      kestrelProject,
      leftWing.id,
      "aeroBaseDragCoefficient",
      0.041
    );
    updated = setComponentEngineeringValue(updated, rightWing.id, "aeroBaseDragCoefficient", 0.019);
    updated = setComponentBehaviorValue(updated, leftPropeller.id, "throttleUpKey", "Digit1");
    updated = setComponentBehaviorValue(updated, rightPropeller.id, "throttleUpKey", "Digit2");

    expect(
      updated.vehicle.components.find((component) => component.id === leftWing.id)?.properties
        .aeroBaseDragCoefficient
    ).toBe(0.041);
    expect(
      updated.vehicle.components.find((component) => component.id === rightWing.id)?.properties
        .aeroBaseDragCoefficient
    ).toBe(0.019);
    expect(
      updated.vehicle.components.find((component) => component.id === leftPropeller.id)?.properties
        .throttleUpKey
    ).toBe("Digit1");
    expect(
      updated.vehicle.components.find((component) => component.id === rightPropeller.id)?.properties
        .throttleUpKey
    ).toBe("Digit2");
    expect(() => AerocelProjectSchema.parse(updated)).not.toThrow();
  });
});
