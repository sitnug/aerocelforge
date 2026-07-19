import { describe, expect, it } from "vitest";
import { defaultAnalysisOptions, runRapidAnalysis } from "./analysis";
import { kestrelProject } from "./kestrel";

describe("Kestrel integrated engineering analysis", () => {
  it("runs the deterministic preliminary workflow without external solvers", () => {
    const result = runRapidAnalysis(kestrelProject, defaultAnalysisOptions);
    expect(result.mass.massKg).toBeCloseTo(8.42, 10);
    expect(result.propeller.converged).toBe(true);
    expect(result.polar).toHaveLength(23);
    expect(result.optimization).toHaveLength(42);
    expect(result.designPoint.fidelity).toBe("A1_parabolic_polar");
    expect(result.transition.quality).toBe("preliminary");
  });

  it("propagates explicit drag counts through design point, glide, trim, and transition", () => {
    const baseline = runRapidAnalysis(kestrelProject, defaultAnalysisOptions);
    const withIncrement = runRapidAnalysis(kestrelProject, {
      ...defaultAnalysisOptions,
      additionalDragCounts: 40
    });
    expect(withIncrement.designPoint.dragBreakdown.additional).toBeCloseTo(0.004, 12);
    expect(
      withIncrement.designPoint.coefficients.cd - baseline.designPoint.coefficients.cd
    ).toBeCloseTo(0.004, 12);
    expect(withIncrement.trim.dragCoefficient - baseline.trim.dragCoefficient).toBeCloseTo(
      0.004,
      12
    );
    expect(withIncrement.glide.bestGlide.liftToDrag).toBeLessThan(
      baseline.glide.bestGlide.liftToDrag
    );
    expect(withIncrement.transition.points[2]?.dragN).toBeGreaterThan(
      baseline.transition.points[2]?.dragN ?? Number.POSITIVE_INFINITY
    );
  });
});
