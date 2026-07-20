import { describe, expect, it } from "vitest";
import {
  applyIndividualPropellerThrottle,
  applyKeyboardThrottle,
  displayKeyboardCode,
  isFlightKeyboardCode,
  isPropellerBindingAllowed,
  keyboardFlightAxes,
  keyboardThrottleDirection
} from "./flightInput";

describe("keyboard flight controls", () => {
  it("maps W/S to pitch down/up and A/D to bank left/right", () => {
    expect(keyboardFlightAxes(new Set(["KeyW", "KeyA"]))).toEqual({
      roll: -1,
      pitch: -1,
      yaw: 0
    });
    expect(keyboardFlightAxes(new Set(["KeyS", "KeyD"]))).toEqual({
      roll: 1,
      pitch: 1,
      yaw: 0
    });
  });

  it("centers an axis when opposite keys are held together", () => {
    expect(keyboardFlightAxes(new Set(["KeyW", "KeyS", "KeyA", "KeyD"]))).toEqual({
      roll: 0,
      pitch: 0,
      yaw: 0
    });
  });

  it("maps Z/X to a real rudder command", () => {
    expect(keyboardFlightAxes(new Set(["KeyZ"])).yaw).toBe(-1);
    expect(keyboardFlightAxes(new Set(["KeyX"])).yaw).toBe(1);
  });

  it("uses Shift for more throttle and Control for less throttle", () => {
    expect(keyboardThrottleDirection(new Set(["ShiftLeft"]))).toBe(1);
    expect(keyboardThrottleDirection(new Set(["ControlRight"]))).toBe(-1);
    expect(applyKeyboardThrottle(0.5, new Set(["ShiftLeft"]), 0.1)).toBeCloseTo(0.55);
    expect(applyKeyboardThrottle(0.5, new Set(["ControlLeft"]), 0.1)).toBeCloseTo(0.45);
  });

  it("keeps throttle in its valid range and recognizes both modifier sides", () => {
    expect(applyKeyboardThrottle(0.99, new Set(["ShiftRight"]), 0.1)).toBe(1);
    expect(applyKeyboardThrottle(0.01, new Set(["ControlRight"]), 0.1)).toBe(0);
    expect(isFlightKeyboardCode("ShiftRight")).toBe(true);
    expect(isFlightKeyboardCode("Shift")).toBe(true);
    expect(isFlightKeyboardCode("ControlLeft")).toBe(true);
    expect(isFlightKeyboardCode("KeyZ")).toBe(true);
    expect(isFlightKeyboardCode("KeyY")).toBe(false);
  });

  it("supports safe custom keys for one propeller at a time", () => {
    expect(isPropellerBindingAllowed("Digit1")).toBe(true);
    expect(isPropellerBindingAllowed("KeyW")).toBe(false);
    expect(displayKeyboardCode("Digit1")).toBe("1");
    expect(applyIndividualPropellerThrottle(0.5, true, false, 0.1)).toBeCloseTo(0.565);
    expect(applyIndividualPropellerThrottle(0.5, false, true, 0.1)).toBeCloseTo(0.435);
  });
});
