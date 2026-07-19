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
    expect(result.designPoint.fidelity).toBe("A1_component_buildup");
    expect(result.transition.quality).toBe("preliminary");
  });
});
