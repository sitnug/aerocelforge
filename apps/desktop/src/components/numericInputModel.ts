export interface NumericInputRules {
  readonly minimum?: number | undefined;
  readonly maximum?: number | undefined;
  readonly integer?: boolean;
}

export function formatNumericValue(value: number, step = 1, precision?: number): string {
  const decimals =
    precision ?? (step >= 1 ? 0 : Math.min(6, Math.max(0, Math.ceil(-Math.log10(step)))));
  return String(Number(value.toFixed(decimals)));
}

export function parseNumericDraft(
  draft: string,
  options: NumericInputRules
): { readonly value: number | null; readonly error: string | null } {
  const normalized = draft.trim().replace(",", ".");
  if (normalized === "") return { value: null, error: "Enter a number." };
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return { value: null, error: "Enter a number." };
  if (options.minimum !== undefined && parsed < options.minimum) {
    return {
      value: null,
      error:
        options.maximum === undefined
          ? `Use ${options.minimum} or more.`
          : `Use a value from ${options.minimum} to ${options.maximum}.`
    };
  }
  if (options.maximum !== undefined && parsed > options.maximum) {
    return {
      value: null,
      error:
        options.minimum === undefined
          ? `Use ${options.maximum} or less.`
          : `Use a value from ${options.minimum} to ${options.maximum}.`
    };
  }
  if (options.integer === true && !Number.isInteger(parsed)) {
    return { value: null, error: "Use a whole number." };
  }
  return { value: parsed, error: null };
}
