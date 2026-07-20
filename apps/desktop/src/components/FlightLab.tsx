import type { AerocelProject } from "@aerocel/simulation-schema";
import type { TriangleMesh } from "@aerocel/geometry-core";
import {
  AlertTriangle,
  Battery,
  Braces,
  CheckCircle2,
  Gamepad2,
  Gauge,
  Keyboard,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Send,
  Wind
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction
} from "react";
import type { AnalysisOptions, RapidAnalysis } from "../lib/analysis";
import { configuredMotorThrustN, setComponentBehaviorValue } from "../lib/componentProperties";
import { deriveAircraftPhysics } from "../lib/aircraftPhysics";
import {
  applyIndividualPropellerThrottle,
  applyKeyboardThrottle,
  displayKeyboardCode,
  isFlightKeyboardCode,
  isKeyboardControlPressed,
  isPropellerBindingAllowed,
  keyboardFlightAxes,
  keyboardThrottleDirection,
  type FlightInputMethod
} from "../lib/flightInput";
import {
  compileFlightProgram,
  createInitialFlightState,
  deriveFlightTelemetry,
  stepInteractiveFlight,
  type AutomationSettings,
  type FlightMode,
  type FlightModel,
  type FlightPreset,
  type PilotInput,
  type ProgramCompileResult
} from "../lib/flightSimulator";
import { AircraftViewport, type ViewportOptions } from "./AircraftViewport";
import { InfoTip } from "./InfoTip";

interface FlightLabProps {
  readonly project: AerocelProject;
  readonly setProject: Dispatch<SetStateAction<AerocelProject>>;
  readonly analysis: RapidAnalysis;
  readonly analysisOptions: AnalysisOptions;
  readonly selectedId: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly viewportOptions: ViewportOptions;
  readonly geometryAssets: ReadonlyMap<string, TriangleMesh>;
  readonly notify: (message: string) => void;
  readonly advancedMode: boolean;
}

const DEFAULT_PROGRAM = `# Autonomous survey circuit
ALTITUDE 40
AIRSPEED 20
HEADING 0
WAYPOINT 120 0 40
WAYPOINT 120 100 45
WAYPOINT 0 100 35
WAYPOINT 0 0 30
LAND
FAILSAFE RETURN_HOME`;

const MODE_LABELS: Readonly<Record<FlightMode, string>> = {
  manual: "Manual",
  stabilize: "Stabilize",
  altitude_hold: "Altitude hold",
  program: "Program",
  return_home: "Return home"
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

function initialViewportHeight(): number {
  const saved = Number(localStorage.getItem("aerocel.flight.viewportHeight"));
  if (Number.isFinite(saved) && saved >= 360 && saved <= 800) return saved;
  if (window.innerWidth <= 900) return 380;
  if (window.innerWidth <= 1_200) return 430;
  return 520;
}

function initialInputMethod(): FlightInputMethod {
  return localStorage.getItem("aerocel.flight.inputMethod") === "keyboard"
    ? "keyboard"
    : "controller";
}

function initialPilot(model: FlightModel, preset: FlightPreset): PilotInput {
  return {
    throttle:
      preset === "hover" && model.maximumTotalThrustN > 0
        ? clamp((model.massKg * 9.80665) / model.maximumTotalThrustN, 0, 1)
        : preset === "cruise"
          ? 0.42
          : 0,
    roll: 0,
    pitch: 0,
    yaw: 0,
    flaps: 0,
    tiltRad: preset === "hover" ? Math.PI / 2 : 0,
    propellerControl: "aircraft",
    propellerThrottles: Object.fromEntries(model.propulsors.map((item) => [item.id, 0]))
  };
}

function RemoteStick({
  label,
  x,
  y,
  onChange,
  onRelease,
  xLabel,
  yLabel
}: {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly onChange: (x: number, y: number) => void;
  readonly onRelease: () => void;
  readonly xLabel: string;
  readonly yLabel: string;
}) {
  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const nextX = clamp(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -1, 1);
    const nextY = clamp(1 - ((event.clientY - bounds.top) / bounds.height) * 2, -1, 1);
    onChange(nextX, nextY);
  };
  return (
    <div className="remote-stick-group">
      <strong>{label}</strong>
      <div
        className="remote-stick"
        role="group"
        aria-label={`${label}: ${xLabel} and ${yLabel}`}
        tabIndex={0}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event);
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          onRelease();
        }}
        onPointerCancel={onRelease}
        onKeyDown={(event) => {
          const increment = event.shiftKey ? 0.05 : 0.12;
          if (event.key === "ArrowLeft") onChange(clamp(x - increment, -1, 1), y);
          else if (event.key === "ArrowRight") onChange(clamp(x + increment, -1, 1), y);
          else if (event.key === "ArrowUp") onChange(x, clamp(y + increment, -1, 1));
          else if (event.key === "ArrowDown") onChange(x, clamp(y - increment, -1, 1));
          else return;
          event.preventDefault();
        }}
      >
        <span className="remote-stick__axis remote-stick__axis--horizontal" />
        <span className="remote-stick__axis remote-stick__axis--vertical" />
        <span
          className="remote-stick__knob"
          style={{ transform: `translate(calc(-50% + ${x * 37}px), calc(-50% - ${y * 37}px))` }}
        />
      </div>
      <small>
        {xLabel} {x.toFixed(2)} · {yLabel} {y.toFixed(2)}
      </small>
    </div>
  );
}

function ChannelSlider({
  label,
  value,
  minimum,
  maximum,
  step,
  unit,
  onChange,
  disabled = false
}: {
  readonly label: string;
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly unit: string;
  readonly onChange: (value: number) => void;
  readonly disabled?: boolean;
}) {
  return (
    <label className={`flight-channel-slider ${disabled ? "flight-channel-slider--disabled" : ""}`}>
      <span>
        <strong>{label}</strong>
        <output>
          {value.toFixed(step < 1 ? 1 : 0)} {unit}
        </output>
      </span>
      <input
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function FlightKeyBindingButton({
  label,
  context,
  value,
  onCommit,
  notify
}: {
  readonly label: string;
  readonly context: string;
  readonly value: string | null;
  readonly onCommit: (value: string | null) => void;
  readonly notify: (message: string) => void;
}) {
  const [capturing, setCapturing] = useState(false);
  useEffect(() => {
    if (!capturing) return;
    const capture = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === "Escape") {
        setCapturing(false);
        return;
      }
      if (!isPropellerBindingAllowed(event.code)) {
        notify(
          "That key already controls the aircraft. Choose a number, arrow, or other unused key."
        );
        return;
      }
      onCommit(event.code);
      setCapturing(false);
    };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [capturing, notify, onCommit]);
  return (
    <span className="flight-key-binding">
      <small>{label}</small>
      <button
        type="button"
        className={capturing ? "is-capturing" : ""}
        aria-label={`${context} ${label.toLowerCase()} power key: ${capturing ? "waiting for a key" : displayKeyboardCode(value)}`}
        onClick={() => setCapturing(true)}
      >
        <kbd>{capturing ? "Press key…" : displayKeyboardCode(value)}</kbd>
      </button>
      {value !== null && (
        <button
          type="button"
          className="flight-key-binding__clear"
          aria-label={`Clear ${context} ${label.toLowerCase()} power key`}
          onClick={() => onCommit(null)}
        >
          ×
        </button>
      )}
    </span>
  );
}

export function FlightLab(props: FlightLabProps) {
  const notify = props.notify;
  const battery = props.project.vehicle.batteries[0];
  const model = useMemo<FlightModel>(() => {
    const aspectRatio =
      props.project.vehicle.reference.spanM ** 2 / props.project.vehicle.reference.areaM2;
    const batteryEnergyWh =
      battery === undefined
        ? 1
        : battery.series *
          battery.parallel *
          battery.cellOpenCircuitVoltageV *
          battery.capacityAh *
          battery.stateOfCharge;
    const nominalVoltageV =
      battery === undefined ? 22.2 : battery.series * battery.cellOpenCircuitVoltageV;
    const estimatedElectricalPowerW = Math.max(
      1,
      props.analysis.propellers.reduce(
        (sum, item) => sum + Math.abs(item.result.shaftPowerW) / 0.86,
        0
      )
    );
    const batteryPowerLimitW =
      battery === undefined
        ? estimatedElectricalPowerW
        : nominalVoltageV * battery.maxContinuousCurrentA;
    const motorPowerLimitW = props.project.vehicle.propulsionUnits.reduce(
      (sum, unit) => sum + unit.motor.maxPowerW,
      0
    );
    const maximumPowerW = Math.min(
      estimatedElectricalPowerW,
      batteryPowerLimitW,
      Math.max(1, motorPowerLimitW)
    );
    const powerLimitRatio = clamp(maximumPowerW / estimatedElectricalPowerW, 0, 1);
    const rawThrustByUnitId = new Map<string, number>();
    const configuredTotalThrustN = props.project.vehicle.propulsionUnits.reduce((sum, unit) => {
      const calculated = props.analysis.propellers.find((item) => item.unitId === unit.id)?.result
        .thrustN;
      const thrustN =
        configuredMotorThrustN(props.project, unit.motorComponentId) ??
        Math.max(0, calculated ?? props.analysis.propeller.thrustN);
      rawThrustByUnitId.set(unit.id, thrustN);
      return sum + thrustN;
    }, 0);
    const thrustPowerScale = powerLimitRatio ** (2 / 3);
    const maximumThrustByUnitId = new Map(
      [...rawThrustByUnitId].map(
        ([unitId, thrustN]) => [unitId, thrustN * thrustPowerScale] as const
      )
    );
    const maximumTotalThrustN = configuredTotalThrustN * thrustPowerScale;
    const aircraftPhysics = deriveAircraftPhysics(
      props.project,
      props.geometryAssets,
      maximumThrustByUnitId,
      props.analysis.designPoint.finiteWingLiftSlopePerRad
    );
    return {
      massKg: props.analysis.mass.massKg,
      inertiaBodyKgM2: props.analysis.mass.inertiaAtCgKgM2,
      centerOfGravityBodyM: props.analysis.mass.centerOfGravityM,
      densityKgM3: props.analysis.atmosphere.densityKgM3,
      wingAreaM2: props.project.vehicle.reference.areaM2,
      wingSpanM: props.project.vehicle.reference.spanM,
      meanChordM: props.project.vehicle.reference.chordM,
      liftSlopePerRad: props.analysis.designPoint.finiteWingLiftSlopePerRad,
      zeroLiftAngleRad: (-2 * Math.PI) / 180,
      maximumLiftCoefficient: 1.35,
      minimumLiftCoefficient: -1.35,
      zeroLiftDragCoefficient:
        props.analysis.zeroLiftGeometryDrag.totalBaseCoefficient +
        props.analysisOptions.additionalDragCounts / 10_000,
      inducedDragFactor: 1 / (Math.PI * 0.82 * aspectRatio),
      sideForceSlopePerRad: -0.8,
      maximumTotalThrustN,
      maximumPowerW,
      batteryEnergyWh,
      nominalVoltageV,
      surfaces: aircraftPhysics.surfaces,
      panels: aircraftPhysics.panels,
      propulsors: aircraftPhysics.propulsors
    };
  }, [
    battery,
    props.analysis,
    props.analysisOptions.additionalDragCounts,
    props.geometryAssets,
    props.project
  ]);
  const hasBattery = battery !== undefined && battery.stateOfCharge > 0;
  const hasPropulsion = model.propulsors.length > 0 && model.maximumTotalThrustN > 0;
  const canPoweredFlight = hasBattery && hasPropulsion;
  const aerodynamicControls = [...model.surfaces, ...model.panels];
  const hasRollSurface = aerodynamicControls.some((surface) =>
    ["roll", "elevon", "flaperon"].includes(surface.control)
  );
  const hasPitchSurface = aerodynamicControls.some((surface) =>
    ["pitch", "elevon"].includes(surface.control)
  );
  const hasYawSurface = aerodynamicControls.some((surface) => surface.control === "yaw");
  const hasFlapSurface = aerodynamicControls.some((surface) =>
    ["flap", "brake", "flaperon"].includes(surface.control)
  );
  const canGlide = aerodynamicControls.length > 0;

  const [preset, setPreset] = useState<FlightPreset>(canPoweredFlight ? "hover" : "cruise");
  const [mode, setMode] = useState<FlightMode>(canPoweredFlight ? "stabilize" : "manual");
  const [running, setRunning] = useState(false);
  const [timeScale, setTimeScale] = useState(1);
  const [pilot, setPilot] = useState<PilotInput>(() =>
    initialPilot(model, canPoweredFlight ? "hover" : "cruise")
  );
  const [flight, setFlight] = useState(() =>
    createInitialFlightState(model, canPoweredFlight ? "hover" : "cruise")
  );
  const [windNorthMS, setWindNorthMS] = useState(0);
  const [windEastMS, setWindEastMS] = useState(0);
  const [windUpMS, setWindUpMS] = useState(0);
  const [programSource, setProgramSource] = useState(
    () => localStorage.getItem("aerocel.flight.program") ?? DEFAULT_PROGRAM
  );
  const [compileResult, setCompileResult] = useState<ProgramCompileResult>(() =>
    compileFlightProgram(localStorage.getItem("aerocel.flight.program") ?? DEFAULT_PROGRAM)
  );
  const [inputMethod, setInputMethod] = useState<FlightInputMethod>(initialInputMethod);
  const [pressedKeyboardCodes, setPressedKeyboardCodes] = useState<readonly string[]>([]);
  const [gamepadName, setGamepadName] = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState(initialViewportHeight);
  const [focusMode, setFocusMode] = useState(false);
  const [automation, setAutomation] = useState<AutomationSettings>({
    targetAltitudeM: 30,
    targetAirspeedMS: 0,
    targetHeadingRad: 0,
    maximumBankRad: (35 * Math.PI) / 180,
    program: compileFlightProgram(DEFAULT_PROGRAM).program
  });
  const pilotRef = useRef(pilot);
  const modeRef = useRef(mode);
  const automationRef = useRef(automation);
  const windRef = useRef<readonly [number, number, number]>([0, 0, 0]);
  const projectIdRef = useRef(props.project.projectId);

  useEffect(() => {
    pilotRef.current = pilot;
  }, [pilot]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    if (canPoweredFlight || mode === "manual") return;
    setMode("manual");
    setPilot((current) => ({ ...current, throttle: 0, propellerControl: "aircraft" }));
  }, [canPoweredFlight, mode]);
  useEffect(() => {
    automationRef.current = automation;
  }, [automation]);
  useEffect(() => {
    windRef.current = [windNorthMS, windEastMS, -windUpMS];
  }, [windEastMS, windNorthMS, windUpMS]);

  const resetFlight = (nextPreset = preset): void => {
    const availablePreset = canPoweredFlight ? nextPreset : "cruise";
    setPreset(availablePreset);
    setRunning(false);
    const nextPilot = initialPilot(model, availablePreset);
    setPilot(nextPilot);
    setFlight(createInitialFlightState(model, availablePreset));
    setMode(
      canPoweredFlight ? (availablePreset === "hover" ? "stabilize" : "altitude_hold") : "manual"
    );
    setAutomation((current) => ({
      ...current,
      targetAltitudeM: availablePreset === "hover" ? 30 : 40,
      targetAirspeedMS: availablePreset === "hover" ? 0 : 22
    }));
  };

  const chooseInputMethod = (nextMethod: FlightInputMethod): void => {
    setInputMethod(nextMethod);
    localStorage.setItem("aerocel.flight.inputMethod", nextMethod);
    setPressedKeyboardCodes([]);
    setPilot((current) => ({ ...current, roll: 0, pitch: 0, yaw: 0 }));
  };

  const choosePropellerControl = (selection: PilotInput["propellerControl"]): void => {
    if (selection === "individual") {
      chooseInputMethod("keyboard");
      setMode("manual");
    }
    setPilot((current) => ({
      ...current,
      propellerControl: selection,
      propellerThrottles:
        selection === "individual"
          ? Object.fromEntries(
              model.propulsors.map((item) => [item.id, current.propellerThrottles[item.id] ?? 0])
            )
          : current.propellerThrottles
    }));
  };

  const commitPropellerBinding = (
    propellerComponentId: string,
    key: "throttleUpKey" | "throttleDownKey",
    value: string | null
  ): void => {
    if (value !== null) {
      const duplicate = model.propulsors.find(
        (item) =>
          item.propellerComponentId !== propellerComponentId &&
          (item.throttleUpKey === value || item.throttleDownKey === value)
      );
      if (duplicate !== undefined) {
        props.notify(`${displayKeyboardCode(value)} is already used by ${duplicate.name}.`);
        return;
      }
    }
    props.setProject((current) =>
      setComponentBehaviorValue(current, propellerComponentId, key, value)
    );
  };

  const startGlideTest = useCallback((): void => {
    const nextPilot = initialPilot(model, "cruise");
    setPreset("cruise");
    setPilot({ ...nextPilot, throttle: 0 });
    setFlight(createInitialFlightState(model, "cruise"));
    setMode("manual");
    setRunning(true);
    notify("Glide test started with every propeller at zero power.");
  }, [model, notify]);

  useEffect(() => {
    if (projectIdRef.current === props.project.projectId) return;
    projectIdRef.current = props.project.projectId;
    const availablePreset = canPoweredFlight ? "hover" : "cruise";
    setPreset(availablePreset);
    setRunning(false);
    setPilot(initialPilot(model, availablePreset));
    setFlight(createInitialFlightState(model, availablePreset));
    setMode(canPoweredFlight ? "stabilize" : "manual");
    setAutomation((current) => ({
      ...current,
      targetAltitudeM: 30,
      targetAirspeedMS: 0,
      targetHeadingRad: 0
    }));
  }, [canPoweredFlight, model, props.project.projectId]);

  useEffect(() => {
    if (!running) return;
    let frameId = 0;
    let previousTime = performance.now();
    let accumulatorS = 0;
    const simulationStepS = 1 / 60;
    const animate = (time: number): void => {
      accumulatorS += Math.min(0.1, (time - previousTime) / 1_000) * timeScale;
      previousTime = time;
      const stepCount = Math.min(12, Math.floor(accumulatorS / simulationStepS));
      if (stepCount > 0) {
        accumulatorS -= stepCount * simulationStepS;
        setFlight((current) => {
          let next = current;
          for (let index = 0; index < stepCount; index += 1) {
            next = stepInteractiveFlight(
              model,
              next,
              pilotRef.current,
              modeRef.current,
              automationRef.current,
              windRef.current,
              simulationStepS
            );
          }
          return next;
        });
      }
      frameId = window.requestAnimationFrame(animate);
    };
    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, [model, running, timeScale]);

  useEffect(() => {
    if (["crashed", "landed", "battery_depleted"].includes(flight.phase)) setRunning(false);
  }, [flight.phase]);

  useEffect(() => {
    if (inputMethod !== "keyboard") {
      setPressedKeyboardCodes([]);
      return;
    }
    const pressed = new Set<string>();
    const customCodes = new Set(
      model.propulsors.flatMap((item) =>
        [item.throttleUpKey, item.throttleDownKey].filter((code): code is string => code !== null)
      )
    );
    let frameId = 0;
    let previousTime = performance.now();
    const isTypingTarget = (target: EventTarget | null): boolean =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;
    const syncPressedKeys = (): void => setPressedKeyboardCodes([...pressed]);
    const updateAxes = (): void => {
      const axes = keyboardFlightAxes(pressed);
      setPilot((current) =>
        current.roll === axes.roll && current.pitch === axes.pitch && current.yaw === axes.yaw
          ? current
          : { ...current, ...axes }
      );
    };
    const releaseAll = (): void => {
      pressed.clear();
      syncPressedKeys();
      updateAxes();
    };
    const keyDown = (event: KeyboardEvent): void => {
      if (
        isTypingTarget(event.target) ||
        (!isFlightKeyboardCode(event.code) && !customCodes.has(event.code))
      )
        return;
      pressed.add(event.code);
      syncPressedKeys();
      updateAxes();
      if (
        pilotRef.current.propellerControl === "aircraft" &&
        !event.repeat &&
        ["ShiftLeft", "ShiftRight", "Shift", "ControlLeft", "ControlRight", "Control"].includes(
          event.code
        )
      ) {
        setPilot((current) => ({
          ...current,
          throttle: applyKeyboardThrottle(current.throttle, pressed, 0.08)
        }));
      }
      if (!event.repeat && event.code === "KeyQ") {
        setPilot((current) => ({
          ...current,
          tiltRad: clamp(current.tiltRad + (5 * Math.PI) / 180, 0, Math.PI / 2)
        }));
      }
      if (!event.repeat && event.code === "KeyE") {
        setPilot((current) => ({
          ...current,
          tiltRad: clamp(current.tiltRad - (5 * Math.PI) / 180, 0, Math.PI / 2)
        }));
      }
      if (!event.repeat && event.code === "Space" && (running || canPoweredFlight || canGlide)) {
        if (running) setRunning(false);
        else if (canPoweredFlight) setRunning(true);
        else startGlideTest();
      }
      event.preventDefault();
    };
    const keyUp = (event: KeyboardEvent): void => {
      if (!isFlightKeyboardCode(event.code) && !customCodes.has(event.code)) return;
      pressed.delete(event.code);
      syncPressedKeys();
      updateAxes();
      event.preventDefault();
    };
    const updateThrottle = (time: number): void => {
      const elapsedSeconds = (time - previousTime) / 1_000;
      previousTime = time;
      if (
        pilotRef.current.propellerControl === "aircraft" &&
        keyboardThrottleDirection(pressed) !== 0
      ) {
        setPilot((current) => {
          const throttle = applyKeyboardThrottle(current.throttle, pressed, elapsedSeconds);
          return throttle === current.throttle ? current : { ...current, throttle };
        });
      }
      if (pilotRef.current.propellerControl === "individual") {
        setPilot((current) => {
          let changed = false;
          const propellerThrottles = { ...current.propellerThrottles };
          for (const propulsor of model.propulsors) {
            const previous = propellerThrottles[propulsor.id] ?? 0;
            const next = applyIndividualPropellerThrottle(
              previous,
              propulsor.throttleUpKey !== null && pressed.has(propulsor.throttleUpKey),
              propulsor.throttleDownKey !== null && pressed.has(propulsor.throttleDownKey),
              elapsedSeconds
            );
            propellerThrottles[propulsor.id] = next;
            changed ||= next !== previous;
          }
          return changed ? { ...current, propellerThrottles } : current;
        });
      }
      frameId = window.requestAnimationFrame(updateThrottle);
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", releaseAll);
    frameId = window.requestAnimationFrame(updateThrottle);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", releaseAll);
    };
  }, [canGlide, canPoweredFlight, inputMethod, model.propulsors, running, startGlideTest]);

  useEffect(() => {
    if (!focusMode) return;
    const exitOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setFocusMode(false);
    };
    window.addEventListener("keydown", exitOnEscape);
    return () => window.removeEventListener("keydown", exitOnEscape);
  }, [focusMode]);

  useEffect(() => {
    let frameId = 0;
    const poll = (): void => {
      const gamepad = navigator
        .getGamepads?.()
        .find((candidate): candidate is Gamepad => candidate?.connected === true);
      if (gamepad === undefined) {
        setGamepadName(null);
      } else {
        setGamepadName(gamepad.id);
        const deadband = (value: number): number => (Math.abs(value) < 0.06 ? 0 : value);
        const yaw = clamp(deadband(gamepad.axes[0] ?? 0), -1, 1);
        const throttle = clamp((1 - (gamepad.axes[1] ?? 0)) / 2, 0, 1);
        const roll = clamp(deadband(gamepad.axes[2] ?? 0), -1, 1);
        const pitch = clamp(-deadband(gamepad.axes[3] ?? 0), -1, 1);
        if (inputMethod === "controller") {
          setPilot((current) =>
            current.yaw === yaw &&
            current.throttle === throttle &&
            current.roll === roll &&
            current.pitch === pitch
              ? current
              : { ...current, yaw, throttle, roll, pitch }
          );
        }
      }
      frameId = window.requestAnimationFrame(poll);
    };
    frameId = window.requestAnimationFrame(poll);
    return () => window.cancelAnimationFrame(frameId);
  }, [inputMethod]);

  const telemetry = deriveFlightTelemetry(model, flight);
  const flightViewportOptions: ViewportOptions = {
    ...props.viewportOptions,
    orthographic: false,
    showAxes: false,
    showCg: false,
    showThrust: false,
    showSlipstream: false,
    exploded: false
  };
  const envelopeWarning =
    Math.abs(telemetry.angleOfAttackRad) > (13 * Math.PI) / 180 ||
    Math.abs(telemetry.sideslipRad) > (15 * Math.PI) / 180 ||
    telemetry.loadFactor > 3.5;
  const insufficientHoverThrust = model.maximumTotalThrustN < model.massKg * 9.80665;
  const displayedPhase = !running && flight.phase === "flying" ? "paused" : flight.phase;
  const pressedKeyboardSet = new Set(pressedKeyboardCodes);
  const strongestSurfaceLoads = [...flight.diagnostics.surfaceLoads]
    .sort(
      (left, right) =>
        right.liftN + right.dragN + right.sideForceN - (left.liftN + left.dragN + left.sideForceN)
    )
    .slice(0, 6);
  const controlSurfaceDeflections = new Map(
    model.surfaces.flatMap((surface): readonly [string, number][] => {
      let command = 0;
      if (surface.control === "roll") command = flight.appliedControls.roll * surface.controlSign;
      else if (surface.control === "pitch") {
        command = flight.appliedControls.pitch * surface.controlSign;
      } else if (surface.control === "yaw") {
        command = flight.appliedControls.yaw * surface.controlSign;
      } else if (surface.control === "flap" || surface.control === "brake") {
        command = flight.appliedControls.flaps;
      } else if (surface.control === "elevon") {
        const rollSign = surface.positionBodyM[1] < 0 ? 1 : -1;
        const pitchSign = surface.positionBodyM[0] < 0 ? -1 : 1;
        command = clamp(
          flight.appliedControls.roll * rollSign + flight.appliedControls.pitch * pitchSign,
          -1,
          1
        );
      } else if (surface.control === "flaperon") {
        const rollSign = surface.positionBodyM[1] < 0 ? 1 : -1;
        command = clamp(
          flight.appliedControls.roll * rollSign + flight.appliedControls.flaps,
          -1,
          1
        );
      } else return [];
      return [[surface.componentId, command * surface.controlEffectivenessRad]];
    })
  );

  return (
    <div className="scroll-workspace flight-lab">
      <header className="workspace-header flight-lab__header">
        <div>
          <small>FLIGHT SIMULATOR</small>
          <h1>Fly your {props.project.vehicle.name} model</h1>
          <div className="workspace-header__description">
            <p>
              Choose keyboard or controller controls, then fly by hand. You can also set automatic
              targets or write a simple route program.
            </p>
            <InfoTip label="What this simulator does">
              It calculates the aircraft’s movement, airflow forces, motor thrust, wind, and battery
              use many times per second. It is useful for learning and early design work, but it is
              not proof that a real aircraft will fly safely.
            </InfoTip>
          </div>
        </div>
        <div className="workspace-actions">
          <span className={`flight-phase flight-phase--${displayedPhase}`}>{displayedPhase}</span>
          <button className="button button--quiet" type="button" onClick={() => resetFlight()}>
            <RotateCcw size={15} /> Reset
          </button>
          <button
            className="button button--primary"
            type="button"
            onClick={() => {
              if (running) setRunning(false);
              else if (canPoweredFlight) setRunning(true);
              else startGlideTest();
            }}
            disabled={
              ["crashed", "landed", "battery_depleted"].includes(flight.phase) ||
              (!running && !canPoweredFlight && !canGlide)
            }
            title={
              !canPoweredFlight && canGlide
                ? "Start a manual glide with every motor off."
                : !canPoweredFlight
                  ? "Add an aerodynamic surface before starting a glide."
                  : undefined
            }
          >
            {running ? <Pause size={15} /> : <Play size={15} />}
            {running ? "Pause" : canPoweredFlight ? "Fly" : "Start glide"}
          </button>
        </div>
      </header>

      <section className="flight-preflight section-card" aria-label="Flight readiness">
        <div className="flight-preflight__summary">
          <span className={hasPropulsion ? "is-ready" : "is-missing"}>
            <strong>{model.propulsors.length}</strong>
            <small>usable propellers</small>
          </span>
          <span className={hasBattery ? "is-ready" : "is-missing"}>
            <strong>{hasBattery ? "Ready" : "Missing"}</strong>
            <small>charged battery</small>
          </span>
          <span className={model.surfaces.length > 0 ? "is-ready" : "is-missing"}>
            <strong>{model.surfaces.length}</strong>
            <small>air surfaces</small>
          </span>
          <span className={model.panels.length > 0 ? "is-ready" : "is-missing"}>
            <strong>{model.panels.length}</strong>
            <small>body pressure panels</small>
          </span>
        </div>
        {!canPoweredFlight && (
          <div className="flight-preflight__blocker" role="status">
            <AlertTriangle size={17} />
            <span>
              <strong>Manual glide is available</strong>
              <p>
                {!hasPropulsion
                  ? "No propeller thrust will be added. Real movable surfaces can still control the aircraft while it has airspeed."
                  : "The propellers stay off until a charged battery is added. Real movable surfaces still work in a glide."}
              </p>
            </span>
            <button
              type="button"
              className="button button--quiet"
              disabled={!canGlide}
              onClick={startGlideTest}
            >
              Start glide · motors off
            </button>
          </div>
        )}
        <div className="flight-axis-checks">
          <span className={hasPitchSurface ? "is-ready" : "is-missing"}>
            Pitch: {hasPitchSurface ? "movable surface found" : "no elevator, elevon, or canard"}
          </span>
          <span className={hasRollSurface ? "is-ready" : "is-missing"}>
            Bank: {hasRollSurface ? "movable surface found" : "no aileron, elevon, or flaperon"}
          </span>
          <span className={hasYawSurface ? "is-ready" : "is-missing"}>
            Turn: {hasYawSurface ? "rudder found" : "no rudder"}
          </span>
        </div>
      </section>

      <section
        className={`flight-stage section-card ${focusMode ? "flight-stage--fullscreen" : ""}`}
        aria-label="Interactive flight simulator viewport"
      >
        <div className="flight-stage__toolbar">
          <span>
            <Radio size={15} /> LIVE · {MODE_LABELS[mode].toUpperCase()}
          </span>
          <div className="flight-stage__tools">
            <label className="flight-viewport-size">
              <span>View height</span>
              <input
                type="range"
                min={360}
                max={800}
                step={20}
                value={viewportHeight}
                aria-label="Simulator viewport height"
                disabled={focusMode}
                onChange={(event) => {
                  const nextHeight = Number(event.target.value);
                  setViewportHeight(nextHeight);
                  localStorage.setItem("aerocel.flight.viewportHeight", String(nextHeight));
                }}
              />
              <output>{viewportHeight}px</output>
            </label>
            <div className="segmented-control" aria-label="Simulation speed">
              {[1, 2, 4].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={timeScale === value ? "is-active" : ""}
                  onClick={() => setTimeScale(value)}
                >
                  {value}×
                </button>
              ))}
            </div>
            <button
              type="button"
              className="flight-focus-button"
              aria-label={focusMode ? "Exit simulator focus mode" : "Open simulator focus mode"}
              aria-pressed={focusMode}
              title={
                focusMode ? "Exit focus mode (Esc)" : "Fill the application with the simulator"
              }
              onClick={() => setFocusMode((current) => !current)}
            >
              {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              <span>{focusMode ? "Exit focus" : "Focus"}</span>
            </button>
          </div>
        </div>
        <div
          className="flight-stage__viewport"
          style={focusMode ? undefined : { height: `${viewportHeight}px` }}
        >
          <AircraftViewport
            project={props.project}
            selectedId={props.selectedId}
            onSelect={props.onSelect}
            options={flightViewportOptions}
            cgBodyM={props.analysis.mass.centerOfGravityM}
            slipstreamRadiusM={
              (((props.project.vehicle.components.find(
                (component) => component.type === "propeller"
              )?.properties.diameterM as number | undefined) ?? 0.43) *
                props.analysis.slipstream.contractionRatio) /
              2
            }
            geometryAssets={props.geometryAssets}
            motorTiltRad={flight.motorTiltRad}
            controlSurfaceDeflections={controlSurfaceDeflections}
            flightPose={{
              positionNedM: flight.rigidBody.positionNedM,
              attitudeBodyToNed: flight.rigidBody.attitudeBodyToNed,
              trailNedM: flight.trailNedM
            }}
          />
          <div className="flight-hud flight-hud--top">
            <span>
              <small>AIRSPEED</small>
              <strong>{telemetry.airspeedMS.toFixed(1)}</strong> m/s
            </span>
            <span>
              <small>ALTITUDE</small>
              <strong>{telemetry.altitudeM.toFixed(1)}</strong> m
            </span>
            <span>
              <small>VERTICAL</small>
              <strong>{telemetry.verticalSpeedMS.toFixed(1)}</strong> m/s
            </span>
            <span>
              <small>HEADING</small>
              <strong>{((telemetry.headingRad * 180) / Math.PI).toFixed(0)}°</strong>
            </span>
            <span>
              <small>BATTERY</small>
              <strong>{telemetry.batteryPercent.toFixed(0)}</strong>%
            </span>
          </div>
          <div className="flight-attitude">
            <div
              className="flight-attitude__horizon"
              style={{
                transform: `translateY(${clamp((telemetry.pitchRad * 180) / Math.PI, -25, 25) * 1.4}px) rotate(${(-telemetry.rollRad * 180) / Math.PI}deg)`
              }}
            />
            <span>−30</span>
            <strong>+</strong>
            <span>+30</span>
          </div>
          <div className="flight-hud flight-hud--bottom">
            {props.advancedMode && (
              <>
                <span>α {((telemetry.angleOfAttackRad * 180) / Math.PI).toFixed(1)}°</span>
                <span>β {((telemetry.sideslipRad * 180) / Math.PI).toFixed(1)}°</span>
              </>
            )}
            <span>{telemetry.loadFactor.toFixed(2)} g</span>
            <span>{telemetry.powerW.toFixed(0)} W</span>
            <span>TILT {((flight.motorTiltRad * 180) / Math.PI).toFixed(0)}°</span>
            <span>T+{telemetry.timeS.toFixed(1)} s</span>
          </div>
        </div>
      </section>

      {envelopeWarning && (
        <div className="notice notice--warning flight-envelope-warning">
          <AlertTriangle size={17} />
          <span>
            <strong>The quick flight model is outside its reliable range</strong>
            <p>
              Ease the controls and reduce the turn or climb. Behaviour after a stall is only a
              rough approximation.
            </p>
          </span>
        </div>
      )}

      {hasPropulsion && insufficientHoverThrust && (
        <div className="notice notice--warning flight-envelope-warning">
          <AlertTriangle size={17} />
          <span>
            <strong>The selected motors cannot hold this weight in a hover</strong>
            <p>
              Estimated total thrust is lower than the aircraft’s weight. Use a tested stronger
              power system, reduce weight, or start in cruise.
            </p>
          </span>
        </div>
      )}

      <div className="flight-control-grid">
        <section className="section-card remote-panel">
          <div className="section-card__header">
            <span>
              <small>FLIGHT CONTROLS</small>
              <h2 className="heading-with-help">
                Choose how to fly
                <InfoTip label="Control choices">
                  Keyboard uses the keys shown below. Controller uses the on-screen sticks or a
                  connected USB or Bluetooth game controller. Only the selected control type can
                  move the aircraft.
                </InfoTip>
              </h2>
            </span>
            {inputMethod === "keyboard" ? (
              <span className="remote-link is-connected">
                <Keyboard size={14} /> Keyboard active
              </span>
            ) : (
              <span className={gamepadName === null ? "remote-link" : "remote-link is-connected"}>
                <Gamepad2 size={14} /> {gamepadName === null ? "On-screen sticks" : "Gamepad live"}
              </span>
            )}
          </div>
          <div className="control-method-selector" role="group" aria-label="Choose flight controls">
            <button
              type="button"
              className={inputMethod === "controller" ? "is-active" : ""}
              aria-pressed={inputMethod === "controller"}
              onClick={() => chooseInputMethod("controller")}
            >
              <Gamepad2 size={16} />
              <span>
                <strong>Controller</strong>
                <small>Sticks or gamepad</small>
              </span>
            </button>
            <button
              type="button"
              className={inputMethod === "keyboard" ? "is-active" : ""}
              aria-pressed={inputMethod === "keyboard"}
              onClick={() => chooseInputMethod("keyboard")}
            >
              <Keyboard size={16} />
              <span>
                <strong>Keyboard</strong>
                <small>W, A, S, D + keys</small>
              </span>
            </button>
          </div>
          <div className="propeller-control-choice">
            <div className="heading-with-help">
              <strong>How propellers respond</strong>
              <InfoTip label="Propeller control mode" align="right">
                Aircraft controls use one throttle and a physical motor mixer for hovering.
                Individual propellers lets you change each motor separately with your own keys. In
                forward flight, bank, pitch, and rudder still come only from matching movable parts.
              </InfoTip>
            </div>
            <div
              className="control-method-selector"
              role="group"
              aria-label="Propeller control mode"
            >
              <button
                type="button"
                className={pilot.propellerControl === "aircraft" ? "is-active" : ""}
                aria-pressed={pilot.propellerControl === "aircraft"}
                disabled={!hasPropulsion}
                onClick={() => choosePropellerControl("aircraft")}
              >
                <Gauge size={16} />
                <span>
                  <strong>Aircraft controls</strong>
                  <small>One throttle</small>
                </span>
              </button>
              <button
                type="button"
                className={pilot.propellerControl === "individual" ? "is-active" : ""}
                aria-pressed={pilot.propellerControl === "individual"}
                disabled={!hasPropulsion}
                onClick={() => choosePropellerControl("individual")}
              >
                <Keyboard size={16} />
                <span>
                  <strong>Individual propellers</strong>
                  <small>Separate keys and power</small>
                </span>
              </button>
            </div>
          </div>
          <div className="mode-selector" aria-label="Flight mode">
            {(["manual", "stabilize", "altitude_hold", "return_home"] as const).map((selection) => (
              <button
                key={selection}
                type="button"
                className={mode === selection ? "is-active" : ""}
                disabled={
                  (!canPoweredFlight && selection !== "manual") ||
                  (pilot.propellerControl === "individual" && selection !== "manual")
                }
                title={
                  !canPoweredFlight && selection !== "manual"
                    ? "Automatic and stabilized modes need usable propulsion. Manual glide remains available."
                    : undefined
                }
                onClick={() => setMode(selection)}
              >
                {MODE_LABELS[selection]}
              </button>
            ))}
          </div>
          {inputMethod === "controller" ? (
            <div className="remote-sticks">
              <RemoteStick
                label="LEFT STICK"
                x={pilot.yaw}
                y={pilot.throttle * 2 - 1}
                xLabel="Yaw"
                yLabel="Throttle"
                onChange={(x, y) =>
                  setPilot((current) => ({ ...current, yaw: x, throttle: (y + 1) / 2 }))
                }
                onRelease={() => setPilot((current) => ({ ...current, yaw: 0 }))}
              />
              <RemoteStick
                label="RIGHT STICK"
                x={pilot.roll}
                y={pilot.pitch}
                xLabel="Roll"
                yLabel="Pitch"
                onChange={(x, y) => setPilot((current) => ({ ...current, roll: x, pitch: y }))}
                onRelease={() => setPilot((current) => ({ ...current, roll: 0, pitch: 0 }))}
              />
            </div>
          ) : (
            <div className="keyboard-flight-controls" aria-label="Keyboard flight key map">
              <div className="keyboard-key-grid">
                {(
                  [
                    [
                      "W",
                      hasPitchSurface ? "Elevator: nose down" : "No pitch surface",
                      "pitch-down"
                    ],
                    ["S", hasPitchSurface ? "Elevator: nose up" : "No pitch surface", "pitch-up"],
                    ["A", hasRollSurface ? "Ailerons: bank left" : "No bank surface", "left"],
                    ["D", hasRollSurface ? "Ailerons: bank right" : "No bank surface", "right"],
                    ["Z", hasYawSurface ? "Rudder left" : "No rudder", "yaw-left"],
                    ["X", hasYawSurface ? "Rudder right" : "No rudder", "yaw-right"],
                    [
                      "Shift",
                      pilot.propellerControl === "aircraft"
                        ? "More throttle"
                        : "Use propeller keys",
                      "throttle-up"
                    ],
                    [
                      "Ctrl",
                      pilot.propellerControl === "aircraft"
                        ? "Less throttle"
                        : "Use propeller keys",
                      "throttle-down"
                    ]
                  ] as const
                ).map(([key, label, control]) => (
                  <div
                    key={control}
                    className={`keyboard-key ${isKeyboardControlPressed(pressedKeyboardSet, control) ? "is-active" : ""}`}
                  >
                    <kbd>{key}</kbd>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <div className="keyboard-live-readout" aria-live="polite">
                <span>
                  <small>Pitch</small>
                  <strong>{pilot.pitch === 0 ? "Center" : pilot.pitch < 0 ? "Down" : "Up"}</strong>
                </span>
                <span>
                  <small>Bank</small>
                  <strong>{pilot.roll === 0 ? "Center" : pilot.roll < 0 ? "Left" : "Right"}</strong>
                </span>
                <span>
                  <small>Rudder</small>
                  <strong>{pilot.yaw === 0 ? "Center" : pilot.yaw < 0 ? "Left" : "Right"}</strong>
                </span>
                <span>
                  <small>Throttle</small>
                  <strong>
                    {pilot.propellerControl === "aircraft"
                      ? `${(pilot.throttle * 100).toFixed(0)}%`
                      : "Separate"}
                  </strong>
                </span>
              </div>
            </div>
          )}
          {pilot.propellerControl === "individual" && (
            <div className="individual-propeller-controls">
              <div className="individual-propeller-controls__header">
                <strong>Individual propeller power</strong>
                <span>Hold a saved key or use + / −</span>
              </div>
              {model.propulsors.map((propulsor) => {
                const throttle = pilot.propellerThrottles[propulsor.id] ?? 0;
                return (
                  <article key={propulsor.id} className="individual-propeller-row">
                    <div>
                      <strong>{propulsor.name}</strong>
                      <small>
                        Position{" "}
                        {propulsor.positionBodyM.map((value) => value.toFixed(2)).join(", ")} m
                      </small>
                    </div>
                    <output>{(throttle * 100).toFixed(0)}%</output>
                    <div className="individual-propeller-row__buttons">
                      <button
                        type="button"
                        aria-label={`Reduce ${propulsor.name} power`}
                        onClick={() =>
                          setPilot((current) => ({
                            ...current,
                            propellerThrottles: {
                              ...current.propellerThrottles,
                              [propulsor.id]: clamp(
                                (current.propellerThrottles[propulsor.id] ?? 0) - 0.05,
                                0,
                                1
                              )
                            }
                          }))
                        }
                      >
                        −
                      </button>
                      <button
                        type="button"
                        aria-label={`Increase ${propulsor.name} power`}
                        onClick={() =>
                          setPilot((current) => ({
                            ...current,
                            propellerThrottles: {
                              ...current.propellerThrottles,
                              [propulsor.id]: clamp(
                                (current.propellerThrottles[propulsor.id] ?? 0) + 0.05,
                                0,
                                1
                              )
                            }
                          }))
                        }
                      >
                        +
                      </button>
                    </div>
                    <FlightKeyBindingButton
                      label="More"
                      context={propulsor.name}
                      value={propulsor.throttleUpKey}
                      onCommit={(value) =>
                        commitPropellerBinding(
                          propulsor.propellerComponentId,
                          "throttleUpKey",
                          value
                        )
                      }
                      notify={props.notify}
                    />
                    <FlightKeyBindingButton
                      label="Less"
                      context={propulsor.name}
                      value={propulsor.throttleDownKey}
                      onCommit={(value) =>
                        commitPropellerBinding(
                          propulsor.propellerComponentId,
                          "throttleDownKey",
                          value
                        )
                      }
                      notify={props.notify}
                    />
                    <span className="individual-propeller-row__bar">
                      <span style={{ width: `${throttle * 100}%` }} />
                    </span>
                  </article>
                );
              })}
            </div>
          )}
          <ChannelSlider
            label="Motor tilt"
            value={(pilot.tiltRad * 180) / Math.PI}
            minimum={0}
            maximum={90}
            step={1}
            unit="deg"
            onChange={(value) =>
              setPilot((current) => ({ ...current, tiltRad: (value * Math.PI) / 180 }))
            }
          />
          {hasFlapSurface && (
            <ChannelSlider
              label="Flaps / air brakes"
              value={pilot.flaps * 100}
              minimum={0}
              maximum={100}
              step={1}
              unit="%"
              onChange={(value) => setPilot((current) => ({ ...current, flaps: value / 100 }))}
            />
          )}
          <div className="remote-presets">
            <button
              type="button"
              className={preset === "hover" ? "is-active" : ""}
              disabled={!canPoweredFlight}
              title={
                !canPoweredFlight
                  ? "Hover needs usable propulsion and a charged battery."
                  : undefined
              }
              onClick={() => resetFlight("hover")}
            >
              Hover start
            </button>
            <button
              type="button"
              className={preset === "cruise" ? "is-active" : ""}
              onClick={() => resetFlight("cruise")}
            >
              Cruise start
            </button>
          </div>
          <p className="control-hint">
            {!hasPropulsion
              ? "No propellers are connected, so throttle and motor tilt do nothing. W/S moves real pitch surfaces, A/D moves real bank surfaces, Z/X moves a real rudder, and flaps still change the surface forces."
              : inputMethod === "keyboard"
                ? pilot.propellerControl === "individual"
                  ? "Hold each saved propeller key to change that motor. W/S moves real pitch surfaces, A/D moves real bank surfaces, and Z/X moves a real rudder. Missing parts mean no response."
                  : "Hold Shift or Ctrl to change throttle. W/S moves real pitch surfaces, A/D moves real bank surfaces, and Z/X moves a real rudder. Q/E changes motor tilt."
                : "Use the on-screen sticks or a standard connected gamepad. The left stick handles throttle and turning; the right stick handles pitch and bank."}
          </p>
        </section>

        <section className="section-card autopilot-panel">
          <div className="section-card__header">
            <span>
              <small>AUTOMATIC FLIGHT</small>
              <h2 className="heading-with-help">
                Automatic flight targets
                <InfoTip label="Automatic targets" align="right">
                  Choose the height, speed, and direction you want. The built-in practice controller
                  moves the virtual controls to try to reach them.
                </InfoTip>
              </h2>
            </span>
            <span className="controller-source">
              <Gauge size={14} /> {flight.appliedControls.source}
            </span>
          </div>
          {!canPoweredFlight && (
            <div className="flight-automation-disabled" role="status">
              <AlertTriangle size={15} />
              <span>
                <strong>Automatic modes are off</strong>
                <small>Manual surface control stays available for gliding.</small>
              </span>
            </div>
          )}
          <ChannelSlider
            label="Target altitude"
            value={automation.targetAltitudeM}
            minimum={0}
            maximum={120}
            step={1}
            unit="m"
            disabled={!canPoweredFlight}
            onChange={(targetAltitudeM) =>
              setAutomation((current) => ({ ...current, targetAltitudeM }))
            }
          />
          <ChannelSlider
            label="Target airspeed"
            value={automation.targetAirspeedMS}
            minimum={0}
            maximum={35}
            step={1}
            unit="m/s"
            disabled={!canPoweredFlight}
            onChange={(targetAirspeedMS) =>
              setAutomation((current) => ({ ...current, targetAirspeedMS }))
            }
          />
          <ChannelSlider
            label="Target heading"
            value={(automation.targetHeadingRad * 180) / Math.PI}
            minimum={0}
            maximum={360}
            step={1}
            unit="deg"
            disabled={!canPoweredFlight}
            onChange={(value) =>
              setAutomation((current) => ({
                ...current,
                targetHeadingRad: (value * Math.PI) / 180
              }))
            }
          />
          <ChannelSlider
            label="North wind"
            value={windNorthMS}
            minimum={-15}
            maximum={15}
            step={0.5}
            unit="m/s"
            onChange={setWindNorthMS}
          />
          <ChannelSlider
            label="East wind"
            value={windEastMS}
            minimum={-15}
            maximum={15}
            step={0.5}
            unit="m/s"
            onChange={setWindEastMS}
          />
          {props.advancedMode && (
            <ChannelSlider
              label="Upward wind"
              value={windUpMS}
              minimum={-10}
              maximum={10}
              step={0.5}
              unit="m/s"
              onChange={setWindUpMS}
            />
          )}
          <div className="autopilot-readout">
            <span>
              <small>ROLL</small>
              <strong>{((telemetry.rollRad * 180) / Math.PI).toFixed(1)}°</strong>
            </span>
            <span>
              <small>PITCH</small>
              <strong>{((telemetry.pitchRad * 180) / Math.PI).toFixed(1)}°</strong>
            </span>
            <span>
              <small>WAYPOINT</small>
              <strong>{flight.activeWaypointIndex + 1}</strong>
            </span>
          </div>
        </section>

        <section className="section-card behavior-panel">
          <div className="section-card__header">
            <span>
              <small>PROGRAM A ROUTE</small>
              <h2 className="heading-with-help">
                Write a simple flight plan
                <InfoTip label="Flight plan language">
                  Each line is one safe simulator command. For example, ALTITUDE 40 asks for 40
                  metres and WAYPOINT 120 0 40 adds a route point. It cannot run general computer
                  code.
                </InfoTip>
              </h2>
            </span>
            <Braces size={18} />
          </div>
          <textarea
            aria-label="Flight behavior program"
            spellCheck={false}
            value={programSource}
            onChange={(event) => {
              const nextProgramSource = event.target.value;
              setProgramSource(nextProgramSource);
              setCompileResult(compileFlightProgram(nextProgramSource));
            }}
          />
          {compileResult.diagnostics.length > 0 ? (
            <div className="program-diagnostics" role="alert">
              {compileResult.diagnostics.map((diagnostic) => (
                <span key={diagnostic}>
                  <AlertTriangle size={13} /> {diagnostic}
                </span>
              ))}
            </div>
          ) : (
            <div className="program-ready">
              <CheckCircle2 size={14} /> Program valid ·{" "}
              {compileResult.program?.waypoints.length ?? 0}
              {" waypoints"}
            </div>
          )}
          <div className="behavior-actions">
            <button
              type="button"
              className="button button--quiet"
              onClick={() => {
                const result = compileFlightProgram(programSource);
                setCompileResult(result);
                localStorage.setItem("aerocel.flight.program", programSource);
                props.notify(
                  result.program === null
                    ? "Behavior program has errors."
                    : "Behavior program compiled successfully."
                );
              }}
            >
              <Braces size={15} /> Check program
            </button>
            <button
              type="button"
              className="button button--primary"
              disabled={compileResult.program === null}
              onClick={() => {
                if (compileResult.program === null) return;
                setAutomation((current) => ({ ...current, program: compileResult.program }));
                setMode("program");
                props.notify("Program loaded. Press Fly to execute the mission.");
              }}
            >
              <Send size={15} /> Load into simulator
            </button>
          </div>
          <p className="control-hint">
            Commands: ALTITUDE, AIRSPEED, HEADING, WAYPOINT north east altitude, LAND, and FAILSAFE
            RETURN_HOME or LAND. Programs are parsed locally; arbitrary code is never executed.
          </p>
        </section>

        <section className="section-card flight-telemetry-panel">
          <div className="section-card__header">
            <span>
              <small>LIVE FLIGHT NUMBERS</small>
              <h2 className="heading-with-help">
                Forces, battery, and position
                <InfoTip label="Live flight numbers" align="right">
                  Lift pushes the aircraft up, drag slows it down, and thrust comes from the
                  propellers. Current shows how quickly electrical energy is being used.
                </InfoTip>
              </h2>
            </span>
            <Wind size={18} />
          </div>
          <div className="flight-telemetry-grid">
            <span>
              <small>LIFT</small>
              <strong>{telemetry.liftN.toFixed(1)} N</strong>
            </span>
            <span>
              <small>DRAG</small>
              <strong>{telemetry.dragN.toFixed(1)} N</strong>
            </span>
            <span>
              <small>THRUST</small>
              <strong>{telemetry.thrustN.toFixed(1)} N</strong>
            </span>
            <span>
              <small>CURRENT</small>
              <strong>{telemetry.currentA.toFixed(1)} A</strong>
            </span>
            <span>
              <small>NORTH / EAST</small>
              <strong>
                {telemetry.northM.toFixed(0)} / {telemetry.eastM.toFixed(0)} m
              </strong>
            </span>
            <span>
              <small>DISTANCE</small>
              <strong>{flight.distanceTravelledM.toFixed(0)} m</strong>
            </span>
          </div>
          {props.advancedMode && strongestSurfaceLoads.length > 0 && (
            <div className="surface-load-table" aria-label="Strongest air loads by part">
              <div className="surface-load-table__heading">
                <strong>Air force by part</strong>
                <InfoTip label="Air force by part" align="right">
                  Every row is calculated at that part’s actual size, angle, and position. Pressure
                  is local air pressure from motion and wind, not a CFD pressure map.
                </InfoTip>
              </div>
              <div className="surface-load-table__columns" aria-hidden="true">
                <span>Part</span>
                <span>Pressure</span>
                <span>Lift</span>
                <span>Drag</span>
              </div>
              {strongestSurfaceLoads.map((load) => (
                <button
                  key={load.componentId}
                  type="button"
                  className={props.selectedId === load.componentId ? "is-selected" : ""}
                  onClick={() => props.onSelect(load.componentId)}
                >
                  <strong>{load.name}</strong>
                  <span>{load.dynamicPressurePa.toFixed(0)} Pa</span>
                  <span>{load.liftN.toFixed(1)} N</span>
                  <span>{load.dragN.toFixed(1)} N</span>
                </button>
              ))}
            </div>
          )}
          <div
            className="battery-track"
            aria-label={`${telemetry.batteryPercent.toFixed(0)}% battery`}
          >
            <span style={{ width: `${telemetry.batteryPercent}%` }} />
          </div>
          <div className="flight-model-note">
            <Battery size={15} />
            <p>
              Live flight uses local air flow on each enabled part and pressure panels on imported
              meshes. Controls only act through matching movable surfaces or real propeller forces.
              Calibrate the coefficients with VSPAERO, CFD, wind-tunnel, or flight-test data before
              making real-flight decisions.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
