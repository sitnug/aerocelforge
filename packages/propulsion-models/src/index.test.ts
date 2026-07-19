import { describe, expect, it } from "vitest";
import { evaluateBattery, estimateSlipstream, solveBemt } from "./index";

const stations = [
  {
    radiusM: 0.04,
    chordM: 0.03,
    twistRad: 0.48,
    liftCurveSlopePerRad: 5.7,
    zeroLiftAngleRad: -0.03,
    cd0: 0.018,
    inducedDragFactor: 0.02
  },
  {
    radiusM: 0.1,
    chordM: 0.027,
    twistRad: 0.34,
    liftCurveSlopePerRad: 5.7,
    zeroLiftAngleRad: -0.03,
    cd0: 0.016,
    inducedDragFactor: 0.02
  },
  {
    radiusM: 0.16,
    chordM: 0.018,
    twistRad: 0.22,
    liftCurveSlopePerRad: 5.7,
    zeroLiftAngleRad: -0.03,
    cd0: 0.015,
    inducedDragFactor: 0.02
  }
] as const;

describe("propulsion physics", () => {
  it("produces positive static thrust and opposite reaction torque signs", () => {
    const common = {
      bladeCount: 2,
      diameterM: 0.32,
      hubRadiusM: 0.035,
      stations,
      rpm: 8_000,
      axialVelocityMS: 0,
      densityKgM3: 1.225,
      speedOfSoundMS: 340
    } as const;
    const clockwise = solveBemt({ ...common, rotation: "CW" });
    const counterClockwise = solveBemt({ ...common, rotation: "CCW" });
    expect(clockwise.thrustN).toBeGreaterThan(0);
    expect(clockwise.torqueNm).toBeLessThan(0);
    expect(counterClockwise.torqueNm).toBeGreaterThan(0);
    expect(clockwise.converged).toBe(true);
  });

  it("models battery voltage sag", () => {
    const result = evaluateBattery(
      {
        series: 6,
        parallel: 1,
        cellOpenCircuitVoltageV: 4,
        cellInternalResistanceOhm: 0.004,
        stateOfCharge: 0.8,
        capacityAh: 8,
        maximumContinuousCurrentA: 120
      },
      50,
      18
    );
    expect(result.openCircuitVoltageV).toBe(24);
    expect(result.busVoltageV).toBeCloseTo(22.8, 8);
    expect(result.brownoutRisk).toBe(false);
  });

  it("predicts slipstream acceleration at static thrust", () => {
    const result = estimateSlipstream(20, 0.32, 1.225, 0);
    expect(result.diskVelocityMS).toBeGreaterThan(0);
    expect(result.farWakeVelocityMS).toBeCloseTo(2 * result.diskVelocityMS, 10);
  });
});
