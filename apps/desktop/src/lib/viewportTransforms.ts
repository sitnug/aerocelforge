import type { VehicleComponent } from "@aerocel/simulation-schema";
import * as THREE from "three";

export type ViewportTransformMode = "translate" | "rotate" | "scale";

const bodyToSceneFrame = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  Math.PI / 2
);
const sceneToBodyFrame = bodyToSceneFrame.clone().invert();

export function bodyRotationToSceneQuaternion(
  rotationRad: readonly [number, number, number]
): THREE.Quaternion {
  const [roll, pitch, yaw] = rotationRad;
  const bodyRotation = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(roll, pitch, yaw, "XYZ")
  );
  return bodyToSceneFrame.clone().multiply(bodyRotation).multiply(sceneToBodyFrame);
}

export function sceneQuaternionToBodyRotation(
  sceneRotation: THREE.Quaternion
): [number, number, number] {
  const bodyRotation = sceneToBodyFrame.clone().multiply(sceneRotation).multiply(bodyToSceneFrame);
  const bodyEuler = new THREE.Euler().setFromQuaternion(bodyRotation, "XYZ");
  return [bodyEuler.x, bodyEuler.y, bodyEuler.z];
}

export function componentTransformToSceneMatrix(
  transform: VehicleComponent["transform"],
  mode: ViewportTransformMode
): THREE.Matrix4 {
  const [x, y, z] = transform.translationM;
  const rotation =
    mode === "rotate" || mode === "scale"
      ? bodyRotationToSceneQuaternion(transform.rotationRad)
      : new THREE.Quaternion();
  const sceneScale =
    mode === "scale"
      ? new THREE.Vector3(transform.scale[0], transform.scale[2], transform.scale[1])
      : new THREE.Vector3(1, 1, 1);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, -z, y), rotation, sceneScale);
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
  const bodyRotation = sceneQuaternionToBodyRotation(quaternion);
  return {
    ...transform,
    translationM:
      mode === "translate"
        ? [clean(position.x), clean(position.z), clean(-position.y)]
        : transform.translationM,
    rotationRad:
      mode === "rotate"
        ? [clean(bodyRotation[0]), clean(bodyRotation[1]), clean(bodyRotation[2])]
        : transform.rotationRad,
    scale:
      mode === "scale"
        ? [
            Math.max(0.0001, clean(scale.x)),
            Math.max(0.0001, clean(scale.z)),
            Math.max(0.0001, clean(scale.y))
          ]
        : transform.scale
  };
}
