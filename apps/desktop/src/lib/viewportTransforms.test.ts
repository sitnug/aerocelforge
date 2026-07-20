import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applySceneTransformMatrix, componentTransformToSceneMatrix } from "./viewportTransforms";

const transform = {
  translationM: [1, 2, 3] as [number, number, number],
  rotationRad: [0.2, -0.3, 0.4] as [number, number, number],
  scale: [1.2, 0.8, 1.1] as [number, number, number]
};

describe("viewport transform handles", () => {
  it("maps a dragged scene position back to aircraft coordinates", () => {
    const moved = new THREE.Matrix4().makeTranslation(4, -6, 5);
    expect(applySceneTransformMatrix(transform, moved, "translate").translationM).toEqual([
      4, 5, 6
    ]);
  });

  it("keeps the saved rotation while moving", () => {
    const matrix = componentTransformToSceneMatrix(transform, "translate");
    const result = applySceneTransformMatrix(transform, matrix, "translate");
    expect(result.rotationRad).toEqual(transform.rotationRad);
    expect(result.translationM).toEqual(transform.translationM);
  });

  it("round-trips roll, pitch, and yaw through the rotate handles", () => {
    const matrix = componentTransformToSceneMatrix(transform, "rotate");
    const result = applySceneTransformMatrix(transform, matrix, "rotate");
    result.rotationRad.forEach((value, index) =>
      expect(value).toBeCloseTo(transform.rotationRad[index] ?? 0, 10)
    );
  });

  it("round-trips each aircraft size through the scale handles", () => {
    const matrix = componentTransformToSceneMatrix(transform, "scale");
    const result = applySceneTransformMatrix(transform, matrix, "scale");
    result.scale.forEach((value, index) =>
      expect(value).toBeCloseTo(transform.scale[index] ?? 0, 10)
    );
  });
});
