import { describe, expect, it } from "vitest";
import { assessNumericalQuality, calculateGridConvergence, runScalarMonteCarlo } from "./index";

describe("numerical quality", () => {
  it("does not equate solver completion with validation", () => {
    const result = assessNumericalQuality({
      residualsConverged: true,
      forcesConverged: true,
      momentsConverged: true,
      massImbalanceFraction: 0.001,
      meshStudyComplete: false,
      timeStepStudyComplete: null,
      domainStudyComplete: false,
      experimentalCalibration: false,
      fatalError: false
    });
    expect(result.grade).toBe("numerically_stable");
    expect(result.explanations.join(" ")).toMatch(/Mesh independence/);
  });
});

describe("grid convergence", () => {
  it("computes a GCI for a monotonic refinement sequence", () => {
    const result = calculateGridConvergence({
      coarseValue: 1.08,
      mediumValue: 1.02,
      fineValue: 1.005,
      coarseCellSize: 0.04,
      mediumCellSize: 0.02,
      fineCellSize: 0.01
    });
    expect(result.valid).toBe(true);
    expect(result.observedOrder).toBeCloseTo(2, 8);
    expect(result.fineGridGciPercent).toBeGreaterThan(0);
  });
});

describe("uncertainty", () => {
  it("is deterministic for a recorded random seed", () => {
    const first = runScalarMonteCarlo(100, 42, (uniform) => uniform());
    const second = runScalarMonteCarlo(100, 42, (uniform) => uniform());
    expect(first).toEqual(second);
  });
});
