export type Dimension =
  | "length"
  | "area"
  | "mass"
  | "angle"
  | "speed"
  | "angularSpeed"
  | "force"
  | "moment"
  | "pressure"
  | "temperature";

export type Unit =
  | "m"
  | "mm"
  | "cm"
  | "in"
  | "ft"
  | "m2"
  | "ft2"
  | "kg"
  | "g"
  | "lb"
  | "rad"
  | "deg"
  | "m/s"
  | "km/h"
  | "kt"
  | "rpm"
  | "rad/s"
  | "N"
  | "lbf"
  | "N*m"
  | "Pa"
  | "kPa"
  | "psi"
  | "K"
  | "degC";

export interface Quantity<U extends Unit = Unit> {
  readonly value: number;
  readonly unit: U;
}

interface UnitDefinition {
  dimension: Dimension;
  toSi: (value: number) => number;
  fromSi: (value: number) => number;
}

const identity = (value: number): number => value;

const definitions: Record<Unit, UnitDefinition> = {
  m: { dimension: "length", toSi: identity, fromSi: identity },
  mm: { dimension: "length", toSi: (value) => value / 1_000, fromSi: (value) => value * 1_000 },
  cm: { dimension: "length", toSi: (value) => value / 100, fromSi: (value) => value * 100 },
  in: { dimension: "length", toSi: (value) => value * 0.0254, fromSi: (value) => value / 0.0254 },
  ft: { dimension: "length", toSi: (value) => value * 0.3048, fromSi: (value) => value / 0.3048 },
  m2: { dimension: "area", toSi: identity, fromSi: identity },
  ft2: {
    dimension: "area",
    toSi: (value) => value * 0.09290304,
    fromSi: (value) => value / 0.09290304
  },
  kg: { dimension: "mass", toSi: identity, fromSi: identity },
  g: { dimension: "mass", toSi: (value) => value / 1_000, fromSi: (value) => value * 1_000 },
  lb: {
    dimension: "mass",
    toSi: (value) => value * 0.45359237,
    fromSi: (value) => value / 0.45359237
  },
  rad: { dimension: "angle", toSi: identity, fromSi: identity },
  deg: {
    dimension: "angle",
    toSi: (value) => (value * Math.PI) / 180,
    fromSi: (value) => (value * 180) / Math.PI
  },
  "m/s": { dimension: "speed", toSi: identity, fromSi: identity },
  "km/h": { dimension: "speed", toSi: (value) => value / 3.6, fromSi: (value) => value * 3.6 },
  kt: {
    dimension: "speed",
    toSi: (value) => value * 0.514444,
    fromSi: (value) => value / 0.514444
  },
  rpm: {
    dimension: "angularSpeed",
    toSi: (value) => (value * 2 * Math.PI) / 60,
    fromSi: (value) => (value * 60) / (2 * Math.PI)
  },
  "rad/s": { dimension: "angularSpeed", toSi: identity, fromSi: identity },
  N: { dimension: "force", toSi: identity, fromSi: identity },
  lbf: {
    dimension: "force",
    toSi: (value) => value * 4.4482216153,
    fromSi: (value) => value / 4.4482216153
  },
  "N*m": { dimension: "moment", toSi: identity, fromSi: identity },
  Pa: { dimension: "pressure", toSi: identity, fromSi: identity },
  kPa: { dimension: "pressure", toSi: (value) => value * 1_000, fromSi: (value) => value / 1_000 },
  psi: {
    dimension: "pressure",
    toSi: (value) => value * 6_894.757293,
    fromSi: (value) => value / 6_894.757293
  },
  K: { dimension: "temperature", toSi: identity, fromSi: identity },
  degC: {
    dimension: "temperature",
    toSi: (value) => value + 273.15,
    fromSi: (value) => value - 273.15
  }
};

export function convert(value: number, from: Unit, to: Unit): number {
  if (!Number.isFinite(value)) {
    throw new Error("Unit conversion requires a finite value");
  }
  const source = definitions[from];
  const target = definitions[to];
  if (source.dimension !== target.dimension) {
    throw new Error(`Cannot convert ${source.dimension} (${from}) to ${target.dimension} (${to})`);
  }
  return target.fromSi(source.toSi(value));
}

export function quantity<U extends Unit>(value: number, unit: U): Quantity<U> {
  if (!Number.isFinite(value)) {
    throw new Error("Quantity values must be finite");
  }
  return Object.freeze({ value, unit });
}

export function dimensionOf(unit: Unit): Dimension {
  return definitions[unit].dimension;
}

export const formatQuantity = (item: Quantity, digits = 2): string =>
  `${item.value.toFixed(digits)} ${item.unit}`;

export const STANDARD_GRAVITY_M_S2 = 9.80665;
export const SEA_LEVEL_DENSITY_KG_M3 = 1.225;
export const SEA_LEVEL_PRESSURE_PA = 101_325;
export const ABSOLUTE_ZERO_C = -273.15;
