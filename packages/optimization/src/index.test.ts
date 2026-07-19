import { describe, expect, it } from "vitest";
import { gridSearch, paretoFront } from "./index";

describe("design studies", () => {
  it("evaluates a complete deterministic grid", () => {
    const results = gridSearch(
      [
        { name: "span", minimum: 2, maximum: 3, steps: 3 },
        { name: "battery", minimum: 6, maximum: 8, steps: 2 }
      ],
      (parameters) => ({
        parameters,
        objectives: { mass: parameters.span ?? 0 },
        constraints: {},
        feasible: true,
        fidelity: "A1"
      })
    );
    expect(results).toHaveLength(6);
  });

  it("removes dominated designs from the Pareto front", () => {
    const base = { parameters: {}, constraints: {}, feasible: true, fidelity: "A1" };
    const results = paretoFront(
      [
        { ...base, objectives: { mass: 10, range: 100 } },
        { ...base, objectives: { mass: 9, range: 110 } },
        { ...base, objectives: { mass: 8, range: 90 } }
      ],
      { mass: "minimize", range: "maximize" }
    );
    expect(results).toHaveLength(2);
  });
});
