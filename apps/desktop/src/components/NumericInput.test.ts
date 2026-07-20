import { describe, expect, it } from "vitest";
import { formatNumericValue, parseNumericDraft } from "./numericInputModel";

describe("numeric input drafts", () => {
  it("accepts a replacement value after the displayed zero is selected", () => {
    expect(parseNumericDraft("24.5", { minimum: 0 })).toEqual({ value: 24.5, error: null });
  });

  it("accepts negative transforms and decimal commas", () => {
    expect(parseNumericDraft("-1,25", {})).toEqual({ value: -1.25, error: null });
  });

  it("keeps range and whole-number validation", () => {
    expect(parseNumericDraft("0", { minimum: 1, maximum: 12, integer: true }).error).toContain(
      "1 to 12"
    );
    expect(parseNumericDraft("2.5", { minimum: 1, maximum: 12, integer: true }).error).toBe(
      "Use a whole number."
    );
  });

  it("formats values from the requested editing step", () => {
    expect(formatNumericValue(2.7000001, 0.1, 2)).toBe("2.7");
    expect(formatNumericValue(0, 0.001)).toBe("0");
  });
});
