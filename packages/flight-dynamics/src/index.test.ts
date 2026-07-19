import { describe, expect, it } from "vitest";
import { simulateTransition, solveStraightLevelTrim, stepSixDof } from "./index";

describe("six-degree-of-freedom integration", () => {
  it("matches ballistic vertical acceleration with aerodynamics disabled", () => {
    const initial = {
      timeS: 0,
      positionNedM: [0, 0, 0],
      velocityBodyMS: [0, 0, 0],
      attitudeBodyToNed: [1, 0, 0, 0],
      angularRateBodyRadS: [0, 0, 0]
    } as const;
    const after = stepSixDof(
      initial,
      {
        massKg: 2,
        inertiaBodyKgM2: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        forceBodyN: [0, 0, 0],
        momentBodyNm: [0, 0, 0]
      },
      1
    );
    expect(after.velocityBodyMS[2]).toBeCloseTo(9.80665, 5);
    expect(after.positionNedM[2]).toBeCloseTo(4.903325, 5);
  });
});

describe("trim", () => {
  it("balances weight with required lift", () => {
    const result = solveStraightLevelTrim({
      massKg: 8,
      densityKgM3: 1.225,
      airspeedMS: 22,
      wingAreaM2: 0.8,
      liftSlopePerRad: 4.8,
      zeroLiftAngleRad: -0.03,
      zeroLiftDragCoefficient: 0.03,
      inducedDragFactor: 0.05,
      maximumLiftCoefficient: 1.4
    });
    expect(result.converged).toBe(true);
    expect(result.requiredThrustN).toBeGreaterThan(0);
  });
});

describe("VTOL transition", () => {
  it("balances hover when vertical thrust equals weight", () => {
    const massKg = 5;
    const result = simulateTransition({
      massKg,
      wingAreaM2: 0.6,
      densityKgM3: 1.225,
      maximumTotalThrustN: massKg * 9.80665,
      maximumPowerW: 1_500,
      initialAltitudeM: 20,
      initialAirspeedMS: 0,
      durationS: 1,
      stepS: 0.02,
      tiltRateLimitRadS: 2,
      liftSlopePerRad: 4.5,
      assumedAngleOfAttackRad: 0,
      maximumLiftCoefficient: 1.3,
      zeroLiftDragCoefficient: 0.04,
      inducedDragFactor: 0.06,
      schedule: [
        { timeS: 0, tiltRad: Math.PI / 2, thrustFraction: 1 },
        { timeS: 1, tiltRad: Math.PI / 2, thrustFraction: 1 }
      ]
    });
    expect(result.altitudeLossM).toBeCloseTo(0, 8);
  });
});
