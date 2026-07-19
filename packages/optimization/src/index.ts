export interface ParameterRange {
  readonly name: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly steps: number;
}

export interface DesignEvaluation {
  readonly parameters: Readonly<Record<string, number>>;
  readonly objectives: Readonly<Record<string, number>>;
  readonly constraints: Readonly<Record<string, number>>;
  readonly feasible: boolean;
  readonly fidelity: string;
}

export function gridSearch(
  ranges: readonly ParameterRange[],
  evaluate: (parameters: Readonly<Record<string, number>>) => DesignEvaluation
): readonly DesignEvaluation[] {
  if (ranges.length === 0) throw new Error("Grid search requires at least one parameter");
  if (ranges.some((range) => range.steps < 2 || range.maximum <= range.minimum)) {
    throw new Error("Every grid parameter requires increasing bounds and at least two steps");
  }
  const results: DesignEvaluation[] = [];
  const recurse = (index: number, parameters: Record<string, number>): void => {
    const range = ranges[index];
    if (range === undefined) {
      results.push(evaluate({ ...parameters }));
      return;
    }
    for (let step = 0; step < range.steps; step += 1) {
      parameters[range.name] =
        range.minimum + ((range.maximum - range.minimum) * step) / (range.steps - 1);
      recurse(index + 1, parameters);
    }
  };
  recurse(0, {});
  return results;
}

export function paretoFront(
  evaluations: readonly DesignEvaluation[],
  objectives: Readonly<Record<string, "minimize" | "maximize">>
): readonly DesignEvaluation[] {
  const feasible = evaluations.filter((evaluation) => evaluation.feasible);
  return feasible.filter(
    (candidate) =>
      !feasible.some((other) => {
        if (other === candidate) return false;
        let atLeastAsGood = true;
        let strictlyBetter = false;
        for (const [name, direction] of Object.entries(objectives)) {
          const candidateValue = candidate.objectives[name];
          const otherValue = other.objectives[name];
          if (candidateValue === undefined || otherValue === undefined) {
            throw new Error(`Missing objective ${name}`);
          }
          const otherIsAsGood =
            direction === "minimize" ? otherValue <= candidateValue : otherValue >= candidateValue;
          const otherIsBetter =
            direction === "minimize" ? otherValue < candidateValue : otherValue > candidateValue;
          atLeastAsGood &&= otherIsAsGood;
          strictlyBetter ||= otherIsBetter;
        }
        return atLeastAsGood && strictlyBetter;
      })
  );
}
