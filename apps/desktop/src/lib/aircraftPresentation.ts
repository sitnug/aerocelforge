export function halfSurfaceSpanDirection(centerBodyYM: number): 1 | -1 {
  if (!Number.isFinite(centerBodyYM) || centerBodyYM === 0) {
    throw new Error("Half-surface centerline offset must be finite and non-zero");
  }
  return centerBodyYM < 0 ? -1 : 1;
}

export function halfSurfaceRootTipBodyY(
  centerBodyYM: number,
  spanM: number
): {
  readonly rootBodyYM: number;
  readonly tipBodyYM: number;
} {
  if (!Number.isFinite(spanM) || spanM <= 0) {
    throw new Error("Half-surface span must be finite and positive");
  }
  const direction = halfSurfaceSpanDirection(centerBodyYM);
  return {
    rootBodyYM: centerBodyYM - (spanM / 2) * direction,
    tipBodyYM: centerBodyYM + (spanM / 2) * direction
  };
}
