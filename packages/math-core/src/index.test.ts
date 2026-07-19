import { describe, expect, it } from "vitest";
import { enuToNed, nedToEnu, rotateAroundAxis } from "./index";

describe("coordinate frame conversions", () => {
  it("round-trips NED and ENU without changing handed data", () => {
    const vector = [12, -4, 8] as const;
    expect(enuToNed(nedToEnu(vector))).toEqual(vector);
  });

  it("rotates thrust around the tilt axis", () => {
    const tilted = rotateAroundAxis([1, 0, 0], [0, 1, 0], Math.PI / 2);
    expect(tilted[0]).toBeCloseTo(0, 12);
    expect(tilted[2]).toBeCloseTo(-1, 12);
  });
});
