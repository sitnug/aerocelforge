import type { AerocelProject } from "@aerocel/simulation-schema";
import type { TriangleMesh } from "@aerocel/geometry-core";
import {
  AlertTriangle,
  Battery,
  Braces,
  CheckCircle2,
  Gamepad2,
  Gauge,
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
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import type { AnalysisOptions, RapidAnalysis } from "../lib/analysis";
import { configuredMotorThrustN } from "../lib/componentProperties";
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
  readonly analysis: RapidAnalysis;
  readonly analysisOptions: AnalysisOptions;
  readonly selectedId: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly viewportOptions: ViewportOptions;
  readonly geometryAssets: ReadonlyMap<string, TriangleMesh>;
  readonly notify: (message: string) => void;
  readonly advancedMode: boolean;
}

const DEFAULT_PROGRAM = `# Kestrel autonomous survey circuit
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

function initialPilot(model: FlightModel, preset: FlightPreset): PilotInput {
  return {
    throttle:
      preset === "hover" ? clamp((model.massKg * 9.80665) / model.maximumTotalThrustN, 0, 1) : 0.42,
    roll: 0,
    pitch: 0,
    yaw: 0,
    tiltRad: preset === "hover" ? Math.PI / 2 : 0
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
  onChange
}: {
  readonly label: string;
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly unit: string;
  readonly onChange: (value: number) => void;
}) {
  return (
    <label className="flight-channel-slider">
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
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function FlightLab(props: FlightLabProps) {
  const battery = props.project.vehicle.batteries[0];
  const model = useMemo<FlightModel>(() => {
    const aspectRatio =
      props.project.vehicle.reference.spanM ** 2 / props.project.vehicle.reference.areaM2;
    const batteryEnergyWh =
      battery === undefined
        ? 200
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
    const configuredTotalThrustN = props.project.vehicle.propulsionUnits.reduce((sum, unit) => {
      const calculated = props.analysis.propellers.find((item) => item.unitId === unit.id)?.result
        .thrustN;
      return (
        sum +
        (configuredMotorThrustN(props.project, unit.motorComponentId) ??
          Math.max(0, calculated ?? props.analysis.propeller.thrustN))
      );
    }, 0);
    const maximumTotalThrustN = Math.max(
      0.001,
      configuredTotalThrustN * powerLimitRatio ** (2 / 3)
    );
    return {
      massKg: props.analysis.mass.massKg,
      inertiaBodyKgM2: props.analysis.mass.inertiaAtCgKgM2,
      densityKgM3: props.analysis.atmosphere.densityKgM3,
      wingAreaM2: props.project.vehicle.reference.areaM2,
      wingSpanM: props.project.vehicle.reference.spanM,
      meanChordM: props.project.vehicle.reference.chordM,
      liftSlopePerRad: props.analysis.designPoint.finiteWingLiftSlopePerRad,
      zeroLiftAngleRad: (-2 * Math.PI) / 180,
      maximumLiftCoefficient: 1.35,
      minimumLiftCoefficient: -1.35,
      zeroLiftDragCoefficient: 0.034 + props.analysisOptions.additionalDragCounts / 10_000,
      inducedDragFactor: 1 / (Math.PI * 0.82 * aspectRatio),
      sideForceSlopePerRad: -0.8,
      maximumTotalThrustN,
      maximumPowerW,
      batteryEnergyWh,
      nominalVoltageV
    };
  }, [battery, props.analysis, props.analysisOptions.additionalDragCounts, props.project]);

  const [preset, setPreset] = useState<FlightPreset>("hover");
  const [mode, setMode] = useState<FlightMode>("stabilize");
  const [running, setRunning] = useState(false);
  const [timeScale, setTimeScale] = useState(1);
  const [pilot, setPilot] = useState<PilotInput>(() => initialPilot(model, "hover"));
  const [flight, setFlight] = useState(() => createInitialFlightState(model, "hover"));
  const [windNorthMS, setWindNorthMS] = useState(0);
  const [windEastMS, setWindEastMS] = useState(0);
  const [programSource, setProgramSource] = useState(
    () => localStorage.getItem("aerocel.flight.program") ?? DEFAULT_PROGRAM
  );
  const [compileResult, setCompileResult] = useState<ProgramCompileResult>(() =>
    compileFlightProgram(localStorage.getItem("aerocel.flight.program") ?? DEFAULT_PROGRAM)
  );
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
    automationRef.current = automation;
  }, [automation]);
  useEffect(() => {
    windRef.current = [windNorthMS, windEastMS, 0];
  }, [windEastMS, windNorthMS]);

  const resetFlight = (nextPreset = preset): void => {
    setPreset(nextPreset);
    setRunning(false);
    const nextPilot = initialPilot(model, nextPreset);
    setPilot(nextPilot);
    setFlight(createInitialFlightState(model, nextPreset));
    setMode(nextPreset === "hover" ? "stabilize" : "altitude_hold");
    setAutomation((current) => ({
      ...current,
      targetAltitudeM: nextPreset === "hover" ? 30 : 40,
      targetAirspeedMS: nextPreset === "hover" ? 0 : 22
    }));
  };

  useEffect(() => {
    if (projectIdRef.current === props.project.projectId) return;
    projectIdRef.current = props.project.projectId;
    setPreset("hover");
    setRunning(false);
    setPilot(initialPilot(model, "hover"));
    setFlight(createInitialFlightState(model, "hover"));
    setMode("stabilize");
    setAutomation((current) => ({
      ...current,
      targetAltitudeM: 30,
      targetAirspeedMS: 0,
      targetHeadingRad: 0
    }));
  }, [model, props.project.projectId]);

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
    const pressed = new Set<string>();
    const isTypingTarget = (target: EventTarget | null): boolean =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;
    const updateAxis = (): void => {
      setPilot((current) => ({
        ...current,
        roll: pressed.has("ArrowLeft") ? -1 : pressed.has("ArrowRight") ? 1 : 0,
        pitch: pressed.has("ArrowUp") ? 1 : pressed.has("ArrowDown") ? -1 : 0,
        yaw: pressed.has("KeyA") ? -1 : pressed.has("KeyD") ? 1 : 0
      }));
    };
    const keyDown = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) return;
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD"].includes(event.code)
      ) {
        pressed.add(event.code);
        updateAxis();
        event.preventDefault();
      }
      if (!event.repeat && event.code === "KeyW") {
        setPilot((current) => ({ ...current, throttle: clamp(current.throttle + 0.04, 0, 1) }));
      }
      if (!event.repeat && event.code === "KeyS") {
        setPilot((current) => ({ ...current, throttle: clamp(current.throttle - 0.04, 0, 1) }));
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
      if (!event.repeat && event.code === "Space") {
        setRunning((current) => !current);
        event.preventDefault();
      }
    };
    const keyUp = (event: KeyboardEvent): void => {
      pressed.delete(event.code);
      updateAxis();
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, []);

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
        setPilot((current) =>
          current.yaw === yaw &&
          current.throttle === throttle &&
          current.roll === roll &&
          current.pitch === pitch
            ? current
            : { ...current, yaw, throttle, roll, pitch }
        );
      }
      frameId = window.requestAnimationFrame(poll);
    };
    frameId = window.requestAnimationFrame(poll);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

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

  return (
    <div className="scroll-workspace flight-lab">
      <header className="workspace-header flight-lab__header">
        <div>
          <small>FLIGHT SIMULATOR</small>
          <h1>Fly your {props.project.vehicle.name} model</h1>
          <div className="workspace-header__description">
            <p>
              Use the on-screen remote, keyboard, or gamepad. You can also set automatic targets or
              write a simple route program.
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
            onClick={() => setRunning((current) => !current)}
            disabled={["crashed", "landed", "battery_depleted"].includes(flight.phase)}
          >
            {running ? <Pause size={15} /> : <Play size={15} />}
            {running ? "Pause" : "Fly"}
          </button>
        </div>
      </header>

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

      {insufficientHoverThrust && (
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
              <small>REMOTE CONTROL</small>
              <h2 className="heading-with-help">
                On-screen remote
                <InfoTip label="Remote layout">
                  This uses the common “Mode 2” layout: the left stick controls power and turning;
                  the right stick controls nose up/down and banking left/right.
                </InfoTip>
              </h2>
            </span>
            <span className={gamepadName === null ? "remote-link" : "remote-link is-connected"}>
              <Gamepad2 size={14} /> {gamepadName === null ? "Awaiting gamepad" : "Gamepad live"}
            </span>
          </div>
          <div className="mode-selector" aria-label="Flight mode">
            {(["manual", "stabilize", "altitude_hold", "return_home"] as const).map((selection) => (
              <button
                key={selection}
                type="button"
                className={mode === selection ? "is-active" : ""}
                onClick={() => setMode(selection)}
              >
                {MODE_LABELS[selection]}
              </button>
            ))}
          </div>
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
          <div className="remote-presets">
            <button
              type="button"
              className={preset === "hover" ? "is-active" : ""}
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
            Keyboard: arrows pitch/roll · A/D yaw · W/S throttle · Q/E tilt · Space run/pause.
            Standard browser gamepads map automatically.
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
          <ChannelSlider
            label="Target altitude"
            value={automation.targetAltitudeM}
            minimum={0}
            maximum={120}
            step={1}
            unit="m"
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
          <div
            className="battery-track"
            aria-label={`${telemetry.batteryPercent.toFixed(0)}% battery`}
          >
            <span style={{ width: `${telemetry.batteryPercent}%` }} />
          </div>
          <div className="flight-model-note">
            <Battery size={15} />
            <p>
              This is a quick six-direction flight model built from the current aircraft, motor, and
              battery estimates. Use a real autopilot simulator and measured aircraft data before
              making real-flight decisions.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
