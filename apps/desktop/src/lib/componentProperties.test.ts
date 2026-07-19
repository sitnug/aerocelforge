import { AerocelProjectSchema } from "@aerocel/simulation-schema";
import { describe, expect, it } from "vitest";
import { kestrelProject } from "./kestrel";
import { configuredMotorThrustN, setComponentEngineeringValue } from "./componentProperties";

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
});
