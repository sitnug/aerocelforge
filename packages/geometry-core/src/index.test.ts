import { describe, expect, it } from "vitest";
import { combineMassProperties, inspectTriangleMesh } from "./index";

const cube = {
  vertices: [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1]
  ] as const,
  faces: [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [1, 2, 6],
    [1, 6, 5],
    [2, 3, 7],
    [2, 7, 6],
    [3, 0, 4],
    [3, 4, 7]
  ] as const
};

describe("mesh inspection", () => {
  it("recovers the volume and topology of a unit cube", () => {
    const result = inspectTriangleMesh(cube);
    expect(result.volumeM3).toBeCloseTo(1, 12);
    expect(result.surfaceAreaM2).toBeCloseTo(6, 12);
    expect(result.watertight).toBe(true);
    expect(result.status).toBe("pass");
    expect(result.connectedBodyCount).toBe(1);
    expect(result.minimumTriangleQuality).toBeGreaterThan(0.8);
    expect(result.thinAxisRatio).toBe(1);
  });

  it("detects disconnected triangle islands", () => {
    const result = inspectTriangleMesh({
      vertices: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [3, 0, 0],
        [4, 0, 0],
        [3, 1, 0]
      ],
      faces: [
        [0, 1, 2],
        [3, 4, 5]
      ]
    });
    expect(result.connectedBodyCount).toBe(2);
    expect(result.notes.some((note) => note.includes("disconnected"))).toBe(true);
  });
});

describe("mass properties", () => {
  it("places the CG between two point masses", () => {
    const zeroInertia = [0, 0, 0, 0, 0, 0, 0, 0, 0] as const;
    const result = combineMassProperties([
      {
        id: "left",
        massKg: 1,
        positionM: [0, -1, 0],
        inertiaAtCgKgM2: zeroInertia,
        uncertaintyKg: 0.01
      },
      {
        id: "right",
        massKg: 3,
        positionM: [0, 1, 0],
        inertiaAtCgKgM2: zeroInertia,
        uncertaintyKg: 0.02
      }
    ]);
    expect(result.massKg).toBe(4);
    expect(result.centerOfGravityM).toEqual([0, 0.5, 0]);
    expect(result.inertiaAtCgKgM2[0]).toBeCloseTo(3, 12);
  });
});
