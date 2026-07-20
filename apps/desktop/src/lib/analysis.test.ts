import { describe, expect, it } from "vitest";
import type { TriangleMesh } from "@aerocel/geometry-core";
import { defaultAnalysisOptions, runRapidAnalysis } from "./analysis";
import { setComponentEngineeringValue } from "./componentProperties";
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
    expect(result.designPoint.dragBreakdown.zeroLift).toBeCloseTo(
      result.geometryDrag.totalBaseCoefficient,
      12
    );
    expect(result.geometryDrag.equivalentDragAreaM2).toBeGreaterThan(0);
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

  it("uses edited motor thrust and propeller dimensions in live calculations", () => {
    const firstUnit = kestrelProject.vehicle.propulsionUnits[0];
    expect(firstUnit).toBeDefined();
    let updated = setComponentEngineeringValue(
      kestrelProject,
      firstUnit?.motorComponentId ?? "",
      "maximumThrustN",
      60
    );
    updated = setComponentEngineeringValue(
      updated,
      firstUnit?.propellerComponentId ?? "",
      "diameterM",
      0.52
    );
    const baseline = runRapidAnalysis(kestrelProject, defaultAnalysisOptions);
    const changed = runRapidAnalysis(updated, defaultAnalysisOptions);

    expect(changed.propellers[0]?.result.thrustN).not.toBeCloseTo(
      baseline.propellers[0]?.result.thrustN ?? 0,
      6
    );
    expect(changed.transition.points[0]?.thrustN).toBeGreaterThan(
      baseline.transition.points[0]?.thrustN ?? 0
    );
  });

  it("keeps aerodynamic and glide analysis available without a battery or propulsion unit", () => {
    const unpoweredProject = {
      ...kestrelProject,
      vehicle: {
        ...kestrelProject.vehicle,
        propulsionUnits: [],
        batteries: []
      }
    };
    const result = runRapidAnalysis(unpoweredProject, defaultAnalysisOptions);

    expect(result.propellers).toHaveLength(0);
    expect(result.battery.remainingEnergyWhApprox).toBe(0);
    expect(result.glide.bestGlide.airspeedMS).toBeGreaterThan(0);
  });

  it("uses an imported shape for lift without asking for an airfoil", () => {
    const sha = "e".repeat(64);
    const body = kestrelProject.vehicle.components.find(
      (component) => component.type === "fuselage"
    );
    expect(body).toBeDefined();
    if (body === undefined) return;
    const mesh: TriangleMesh = {
      vertices: [
        [-0.5, -0.5, 0],
        [0.5, -0.5, 0],
        [0.5, 0.5, 0],
        [-0.5, 0.5, 0]
      ],
      faces: [
        [0, 1, 2],
        [0, 2, 3]
      ]
    };
    const importedProject = {
      ...kestrelProject,
      vehicle: {
        ...kestrelProject.vehicle,
        components: [
          {
            ...body,
            type: "fairing" as const,
            transform: {
              ...body.transform,
              translationM: [0, 0, 0] as [number, number, number],
              rotationRad: [0, 0, 0] as [number, number, number],
              scale: [1, 1, 1] as [number, number, number]
            },
            geometry: { ...body.geometry, kind: "mesh" as const, sourceSha256: sha }
          }
        ],
        joints: [],
        propulsionUnits: []
      }
    };
    const positive = runRapidAnalysis(
      importedProject,
      { ...defaultAnalysisOptions, angleOfAttackDeg: 5 },
      new Map([[sha, mesh]])
    );
    const negative = runRapidAnalysis(
      importedProject,
      { ...defaultAnalysisOptions, angleOfAttackDeg: -5 },
      new Map([[sha, mesh]])
    );

    expect(positive.aerodynamicSource).toBe("geometry_surface_panels");
    expect(positive.designPoint.coefficients.cl).toBeGreaterThan(0.4);
    expect(negative.designPoint.coefficients.cl).toBeLessThan(-0.4);
    expect(positive.designPoint.validity).toContain("No airfoil name or lift table is required");
  });
});
