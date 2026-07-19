export type FlightInputMethod = "controller" | "keyboard";

export const KEYBOARD_THROTTLE_RATE_PER_SECOND = 0.5;

const FLIGHT_KEY_CODES = new Set([
  "KeyW",
  "KeyS",
  "KeyA",
  "KeyD",
  "ShiftLeft",
  "ShiftRight",
  "Shift",
  "ControlLeft",
  "ControlRight",
  "Control",
  "KeyQ",
  "KeyE",
  "Space"
]);

const hasAny = (pressed: ReadonlySet<string>, codes: readonly string[]): boolean =>
  codes.some((code) => pressed.has(code));

const opposingAxis = (
  pressed: ReadonlySet<string>,
  negativeCodes: readonly string[],
  positiveCodes: readonly string[]
): number => {
  const negative = hasAny(pressed, negativeCodes);
  const positive = hasAny(pressed, positiveCodes);
  if (negative === positive) return 0;
  return negative ? -1 : 1;
};

export function isFlightKeyboardCode(code: string): boolean {
  return FLIGHT_KEY_CODES.has(code);
}

export function keyboardFlightAxes(pressed: ReadonlySet<string>): {
  readonly roll: number;
  readonly pitch: number;
} {
  return {
    roll: opposingAxis(pressed, ["KeyA"], ["KeyD"]),
    // In the simulator, negative pitch moves the nose down and positive pitch moves it up.
    pitch: opposingAxis(pressed, ["KeyW"], ["KeyS"])
  };
}

export function keyboardThrottleDirection(pressed: ReadonlySet<string>): number {
  return opposingAxis(
    pressed,
    ["ControlLeft", "ControlRight", "Control"],
    ["ShiftLeft", "ShiftRight", "Shift"]
  );
}

export function applyKeyboardThrottle(
  currentThrottle: number,
  pressed: ReadonlySet<string>,
  elapsedSeconds: number
): number {
  const safeElapsedSeconds = Number.isFinite(elapsedSeconds)
    ? Math.max(0, Math.min(elapsedSeconds, 0.1))
    : 0;
  const nextThrottle =
    currentThrottle +
    keyboardThrottleDirection(pressed) * KEYBOARD_THROTTLE_RATE_PER_SECOND * safeElapsedSeconds;
  return Math.max(0, Math.min(1, nextThrottle));
}

export function isKeyboardControlPressed(
  pressed: ReadonlySet<string>,
  control: "pitch-down" | "pitch-up" | "left" | "right" | "throttle-up" | "throttle-down"
): boolean {
  const codes: Readonly<Record<typeof control, readonly string[]>> = {
    "pitch-down": ["KeyW"],
    "pitch-up": ["KeyS"],
    left: ["KeyA"],
    right: ["KeyD"],
    "throttle-up": ["ShiftLeft", "ShiftRight", "Shift"],
    "throttle-down": ["ControlLeft", "ControlRight", "Control"]
  };
  return hasAny(pressed, codes[control]);
}
