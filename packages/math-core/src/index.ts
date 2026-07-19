export type Vector3 = readonly [number, number, number];
export type MutableVector3 = [number, number, number];
export type Matrix3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

export const add3 = (left: Vector3, right: Vector3): MutableVector3 => [
  left[0] + right[0],
  left[1] + right[1],
  left[2] + right[2]
];

export const subtract3 = (left: Vector3, right: Vector3): MutableVector3 => [
  left[0] - right[0],
  left[1] - right[1],
  left[2] - right[2]
];

export const scale3 = (vector: Vector3, scalar: number): MutableVector3 => [
  vector[0] * scalar,
  vector[1] * scalar,
  vector[2] * scalar
];

export const dot3 = (left: Vector3, right: Vector3): number =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

export const cross3 = (left: Vector3, right: Vector3): MutableVector3 => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0]
];

export const magnitude3 = (vector: Vector3): number => Math.sqrt(dot3(vector, vector));

export function normalize3(vector: Vector3): MutableVector3 {
  const magnitude = magnitude3(vector);
  if (magnitude <= Number.EPSILON) {
    throw new Error("Cannot normalize a zero-length vector");
  }
  return scale3(vector, 1 / magnitude);
}

export const nedToEnu = (ned: Vector3): MutableVector3 => [ned[1], ned[0], -ned[2]];
export const enuToNed = (enu: Vector3): MutableVector3 => [enu[1], enu[0], -enu[2]];

export const frdToFlu = (frd: Vector3): MutableVector3 => [frd[0], -frd[1], -frd[2]];
export const fluToFrd = (flu: Vector3): MutableVector3 => [flu[0], -flu[1], -flu[2]];

export function rotateAroundAxis(vector: Vector3, axis: Vector3, angleRad: number): MutableVector3 {
  const unitAxis = normalize3(axis);
  const cosine = Math.cos(angleRad);
  const sine = Math.sin(angleRad);
  const first = scale3(vector, cosine);
  const second = scale3(cross3(unitAxis, vector), sine);
  const third = scale3(unitAxis, dot3(unitAxis, vector) * (1 - cosine));
  return add3(add3(first, second), third);
}

export function rk4Step<T extends readonly number[]>(
  state: T,
  time: number,
  stepS: number,
  derivative: (state: T, time: number) => T
): T {
  const combine = (base: T, delta: T, factor: number): T =>
    base.map((value, index) => value + (delta[index] ?? 0) * factor) as unknown as T;
  const k1 = derivative(state, time);
  const k2 = derivative(combine(state, k1, stepS / 2), time + stepS / 2);
  const k3 = derivative(combine(state, k2, stepS / 2), time + stepS / 2);
  const k4 = derivative(combine(state, k3, stepS), time + stepS);
  return state.map(
    (value, index) =>
      value +
      (stepS / 6) *
        ((k1[index] ?? 0) + 2 * (k2[index] ?? 0) + 2 * (k3[index] ?? 0) + (k4[index] ?? 0))
  ) as unknown as T;
}
