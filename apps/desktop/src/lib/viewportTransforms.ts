import type { VehicleComponent } from "@aerocel/simulation-schema";
import * as THREE from "three";

export type ViewportTransformMode = "translate" | "rotate";

export function componentTransformToSceneMatrix(
  transform: VehicleComponent["transform"],
  mode: ViewportTransformMode
): THREE.Matrix4 {
  const [x, y, z] = transform.translationM;
  const [roll, pitch, yaw] = transform.rotationRad;
  const rotation =
    mode === "rotate"
      ? new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, -yaw, pitch, "XYZ"))
      : new THREE.Quaternion();
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, -z, y),
    rotation,
    new THREE.Vector3(1, 1, 1)
  );
}

export function applySceneTransformMatrix(
  transform: VehicleComponent["transform"],
  matrix: THREE.Matrix4,
  mode: ViewportTransformMode
): VehicleComponent["transform"] {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  const clean = (value: number): number => (Math.abs(value) < 1e-10 ? 0 : value);
  const sceneRotation = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
  return {
    ...transform,
    translationM:
      mode === "translate"
        ? [clean(position.x), clean(position.z), clean(-position.y)]
        : transform.translationM,
    rotationRad:
      mode === "rotate"
        ? [clean(sceneRotation.x), clean(sceneRotation.z), clean(-sceneRotation.y)]
        : transform.rotationRad
  };
}
