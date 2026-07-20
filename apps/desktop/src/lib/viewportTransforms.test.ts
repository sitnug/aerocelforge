import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applySceneTransformMatrix,
  bodyRotationToSceneQuaternion,
  componentTransformToSceneMatrix
} from "./viewportTransforms";

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

  it("keeps pitch on the side-to-side axis instead of turning it into roll", () => {
    const forward = new THREE.Vector3(1, 0, 0);
    const roll = bodyRotationToSceneQuaternion([Math.PI / 2, 0, 0]);
    const pitch = bodyRotationToSceneQuaternion([0, Math.PI / 2, 0]);

    expect(forward.clone().applyQuaternion(roll).toArray()).toEqual([1, 0, 0]);
    const pitchedForward = forward.clone().applyQuaternion(pitch);
    expect(pitchedForward.x).toBeCloseTo(0, 10);
    expect(pitchedForward.y).toBeCloseTo(1, 10);
    expect(pitchedForward.z).toBeCloseTo(0, 10);
  });

  it("round-trips each aircraft size through the scale handles", () => {
    const matrix = componentTransformToSceneMatrix(transform, "scale");
    const result = applySceneTransformMatrix(transform, matrix, "scale");
    result.scale.forEach((value, index) =>
      expect(value).toBeCloseTo(transform.scale[index] ?? 0, 10)
    );
  });
});
