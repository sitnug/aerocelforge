import { describe, expect, it } from "vitest";
import { convert } from "./index";

describe("unit conversion", () => {
  it("round-trips aviation speed", () => {
    const metresPerSecond = convert(100, "kt", "m/s");
    expect(convert(metresPerSecond, "m/s", "kt")).toBeCloseTo(100, 10);
  });

  it("converts RPM to radians per second", () => {
    expect(convert(60, "rpm", "rad/s")).toBeCloseTo(2 * Math.PI, 12);
  });

  it("refuses mixed dimensions", () => {
    expect(() => convert(1, "kg", "m")).toThrow(/Cannot convert/);
  });
});
