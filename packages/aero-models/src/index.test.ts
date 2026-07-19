import { describe, expect, it } from "vitest";
import { analyzeComponentBuildup, calculateGlideEnvelope, isaAtmosphere } from "./index";

describe("ISA atmosphere", () => {
  it("matches standard sea-level density", () => {
    expect(isaAtmosphere(0).densityKgM3).toBeCloseTo(1.225, 3);
  });
});

describe("A1 parabolic polar", () => {
  const baseline = {
    wingAreaM2: 0.82,
    wingSpanM: 2.4,
    meanChordM: 0.36,
    airspeedMS: 22,
    angleOfAttackRad: (4 * Math.PI) / 180,
    sideslipRad: 0,
    altitudeM: 0,
    zeroLiftAngleRad: (-2 * Math.PI) / 180,
    sectionLiftSlopePerRad: 2 * Math.PI,
    oswaldEfficiency: 0.82,
    zeroLiftDragCoefficient: 0.034,
    pitchingMomentZero: 0.015,
    pitchingMomentSlopePerRad: -0.72,
    sideForceSlopePerRad: -0.8,
    stallAnglePositiveRad: (13 * Math.PI) / 180,
    maximumLiftCoefficient: 1.35
  } as const;

  it("keeps side force symmetric at zero sideslip", () => {
    expect(analyzeComponentBuildup(baseline).coefficients.cy).toBe(0);
  });

  it("increases induced drag with lift", () => {
    const low = analyzeComponentBuildup({ ...baseline, angleOfAttackRad: 0 });
    const high = analyzeComponentBuildup({ ...baseline, angleOfAttackRad: (8 * Math.PI) / 180 });
    expect(high.inducedDragCoefficient).toBeGreaterThan(low.inducedDragCoefficient);
  });

  it("accounts for each configured drag contribution without hiding it", () => {
    const result = analyzeComponentBuildup({
      ...baseline,
      sideslipRad: (5 * Math.PI) / 180,
      sideslipDragFactorPerRad2: 0.2,
      additionalDragCoefficient: 0.004
    });
    expect(result.dragBreakdown.zeroLift).toBe(0.034);
    expect(result.dragBreakdown.sideslip).toBeCloseTo(0.2 * ((5 * Math.PI) / 180) ** 2, 12);
    expect(result.dragBreakdown.additional).toBe(0.004);
    expect(result.dragBreakdown.total).toBeCloseTo(
      result.dragBreakdown.zeroLift +
        result.dragBreakdown.induced +
        result.dragBreakdown.sideslip +
        result.dragBreakdown.additional,
      12
    );
    expect(result.coefficients.cd).toBe(result.dragBreakdown.total);
  });

  it("uses the nearest positive or negative attached-flow boundary for stall margin", () => {
    const positive = analyzeComponentBuildup({
      ...baseline,
      angleOfAttackRad: (12 * Math.PI) / 180
    });
    const negative = analyzeComponentBuildup({
      ...baseline,
      angleOfAttackRad: (-12 * Math.PI) / 180
    });
    expect((positive.stallMarginRad * 180) / Math.PI).toBeCloseTo(1, 12);
    expect((negative.stallMarginRad * 180) / Math.PI).toBeCloseTo(1, 12);
  });

  it("reports a finite-wing slope below the 2D section slope", () => {
    expect(analyzeComponentBuildup(baseline).finiteWingLiftSlopePerRad).toBeLessThan(2 * Math.PI);
  });
});

describe("glide envelope", () => {
  it("finds best glide above stall", () => {
    const result = calculateGlideEnvelope({
      massKg: 8.42,
      wingAreaM2: 0.82,
      densityKgM3: 1.225,
      maximumLiftCoefficient: 1.35,
      zeroLiftDragCoefficient: 0.034,
      inducedDragFactor: 0.055
    });
    expect(result.bestGlide.airspeedMS).toBeGreaterThan(result.stallSpeedMS);
    expect(result.minimumSink.sinkRateMS).toBeGreaterThan(0);
    expect(result.bestGlide.sinkRateMS).toBeCloseTo(
      result.bestGlide.airspeedMS * Math.sin(result.bestGlide.glideAngleRad),
      12
    );
    expect(result.bestGlide.liftToDrag).toBeCloseTo(1 / (2 * Math.sqrt(0.034 * 0.055)), 2);
  });

  it("rejects nonphysical drag-polar inputs", () => {
    expect(() =>
      calculateGlideEnvelope({
        massKg: 8.42,
        wingAreaM2: 0.82,
        densityKgM3: 1.225,
        maximumLiftCoefficient: 1.35,
        zeroLiftDragCoefficient: -0.01,
        inducedDragFactor: 0.055
      })
    ).toThrow("physically positive");
  });
});
