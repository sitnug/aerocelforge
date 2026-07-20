import type { AerocelProject, VehicleComponent } from "@aerocel/simulation-schema";
import { Gauge, Weight } from "lucide-react";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  setComponentBehaviorValue,
  configuredMotorThrustN,
  setComponentEngineeringValue,
  type EngineeringPropertyKey
} from "../lib/componentProperties";
import { componentAerodynamicEnabled, defaultAerodynamicEnabled } from "../lib/aircraftPhysics";
import { displayKeyboardCode, isPropellerBindingAllowed } from "../lib/flightInput";
import { InfoTip } from "./InfoTip";
import { NumericInput } from "./NumericInput";

interface NumberPropertyFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  readonly help: string;
  readonly minimum: number;
  readonly maximum?: number;
  readonly step: number;
  readonly integer?: boolean;
  readonly onCommit: (value: number) => void;
}

function NumberPropertyField({
  id,
  label,
  value,
  unit,
  help,
  minimum,
  maximum,
  step,
  integer = false,
  onCommit
}: NumberPropertyFieldProps) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
  }, [value]);

  return (
    <label
      className={`engineering-number-field ${error === null ? "" : "field--error"}`}
      htmlFor={id}
    >
      <span className="inline-help-label">
        {label}
        <InfoTip label={label} align="right">
          {help}
        </InfoTip>
      </span>
      <span className="engineering-number-field__control">
        <NumericInput
          id={id}
          value={value}
          minimum={minimum}
          maximum={maximum}
          step={step}
          integer={integer}
          ariaInvalid={error !== null}
          onCommit={onCommit}
          onValidationError={setError}
        />
        <small>{unit}</small>
      </span>
      {error !== null && (
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
    </label>
  );
}

function KeyBindingField({
  label,
  value,
  help,
  onCommit,
  notify
}: {
  readonly label: string;
  readonly value: string | null;
  readonly help: string;
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
    <div className="key-binding-field">
      <span className="inline-help-label">
        {label}
        <InfoTip label={label} align="right">
          {help}
        </InfoTip>
      </span>
      <span>
        <button
          type="button"
          className={capturing ? "is-capturing" : ""}
          aria-label={`${label}: ${capturing ? "waiting for a key" : displayKeyboardCode(value)}`}
          onClick={() => setCapturing(true)}
        >
          <kbd>{capturing ? "Press a key…" : displayKeyboardCode(value)}</kbd>
        </button>
        {value !== null && (
          <button
            type="button"
            className="key-binding-clear"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={() => onCommit(null)}
          >
            Clear
          </button>
        )}
      </span>
    </div>
  );
}

interface ComponentPropertiesEditorProps {
  readonly component: VehicleComponent;
  readonly project: AerocelProject;
  readonly setProject: Dispatch<SetStateAction<AerocelProject>>;
  readonly estimatedThrustN: number;
  readonly advancedMode: boolean;
  readonly notify: (message: string) => void;
}

export function ComponentPropertiesEditor({
  component,
  project,
  setProject,
  estimatedThrustN,
  advancedMode,
  notify
}: ComponentPropertiesEditorProps) {
  const propulsionUnit = project.vehicle.propulsionUnits.find(
    (unit) => unit.motorComponentId === component.id || unit.propellerComponentId === component.id
  );
  const battery = project.vehicle.batteries.find((item) => item.id === component.id);
  const commit = (key: EngineeringPropertyKey, value: number): void => {
    try {
      setProject((current) => setComponentEngineeringValue(current, component.id, key, value));
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : "That property could not be changed.");
    }
  };
  const commitBehavior = (
    key: "aeroEnabled" | "throttleUpKey" | "throttleDownKey",
    value: boolean | string | null
  ): void => {
    try {
      setProject((current) => setComponentBehaviorValue(current, component.id, key, value));
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : "That setting could not be changed.");
    }
  };
  const fieldId = (name: string): string => `part-${component.id}-${name}`;
  const propertyNumber = (name: string, fallback: number): number => {
    const value = Number(component.properties[name]);
    return Number.isFinite(value) ? value : fallback;
  };

  const motorFields = component.type === "motor" && (
    <>
      <div className="property-summary">
        <Gauge size={16} />
        <span>
          <small>CURRENT PROPELLER ESTIMATE</small>
          <strong>{estimatedThrustN.toFixed(1)} N at the selected RPM</strong>
        </span>
      </div>
      <div className="engineering-fields">
        <NumberPropertyField
          id={fieldId("maximum-thrust")}
          label="Maximum thrust"
          value={configuredMotorThrustN(project, component.id) ?? estimatedThrustN}
          unit="N"
          help="The strongest push expected from this motor and propeller together. The flight simulator uses this as the motor's limit. Replace the estimate with a thrust-stand result when you have one."
          minimum={0.1}
          step={0.1}
          onCommit={(value) => commit("maximumThrustN", value)}
        />
        <NumberPropertyField
          id={fieldId("maximum-power")}
          label="Maximum power"
          value={propulsionUnit?.motor.maxPowerW ?? propertyNumber("motorMaxPowerW", 1_000)}
          unit="W"
          help="The highest electrical power the motor should use. Check the motor maker's data sheet and do not treat short burst power as continuous power."
          minimum={1}
          step={10}
          onCommit={(value) => commit("motorMaxPowerW", value)}
        />
        <NumberPropertyField
          id={fieldId("maximum-current")}
          label="Maximum current"
          value={propulsionUnit?.motor.maxCurrentA ?? propertyNumber("motorMaxCurrentA", 40)}
          unit="A"
          help="The most current the motor should draw. The speed controller and battery must safely supply at least this much."
          minimum={0.1}
          step={0.5}
          onCommit={(value) => commit("motorMaxCurrentA", value)}
        />
        <NumberPropertyField
          id={fieldId("motor-kv")}
          label="Motor speed rating"
          value={propulsionUnit?.motor.kvRpmPerVolt ?? propertyNumber("motorKvRpmPerVolt", 500)}
          unit="KV"
          help="KV means unloaded revolutions per minute for each volt. It is a speed rating, not power and not kilovolts."
          minimum={1}
          step={10}
          onCommit={(value) => commit("motorKvRpmPerVolt", value)}
        />
        {advancedMode && (
          <NumberPropertyField
            id={fieldId("motor-resistance")}
            label="Winding resistance"
            value={propulsionUnit?.motor.windingResistanceOhm ?? 0.05}
            unit="Ω"
            help="Electrical resistance inside the motor windings. It affects heat, current, and voltage loss. Use a measured or manufacturer value."
            minimum={0.0001}
            step={0.001}
            onCommit={(value) => commit("motorWindingResistanceOhm", value)}
          />
        )}
      </div>
    </>
  );

  const propellerFields = component.type === "propeller" && (
    <>
      <div className="engineering-fields">
        <NumberPropertyField
          id={fieldId("propeller-diameter")}
          label="Propeller diameter"
          value={propulsionUnit?.diameterM ?? propertyNumber("diameterM", 0.3)}
          unit="m"
          help="The full tip-to-tip size of the propeller. A larger propeller usually makes more thrust but needs more torque and clearance."
          minimum={0.01}
          step={0.01}
          onCommit={(value) => commit("diameterM", value)}
        />
        <NumberPropertyField
          id={fieldId("propeller-pitch")}
          label="Propeller pitch"
          value={propulsionUnit?.pitchM ?? propertyNumber("pitchM", 0.12)}
          unit="m"
          help="The ideal forward distance for one turn, like the pitch of a screw. More pitch can increase speed and motor load."
          minimum={0.001}
          step={0.01}
          onCommit={(value) => commit("pitchM", value)}
        />
        <NumberPropertyField
          id={fieldId("propeller-blades")}
          label="Blade count"
          value={propulsionUnit?.bladeCount ?? 2}
          unit="blades"
          help="How many blades are on this propeller. More blades can make more thrust in limited space, but usually reduce efficiency."
          minimum={1}
          maximum={12}
          step={1}
          integer
          onCommit={(value) => commit("bladeCount", value)}
        />
      </div>
      <div className="propeller-key-bindings">
        <h4>Individual motor keys</h4>
        <p>These keys change only this propeller when Fly is set to Individual propellers.</p>
        <KeyBindingField
          label="More power key"
          value={
            typeof component.properties.throttleUpKey === "string"
              ? component.properties.throttleUpKey
              : null
          }
          help="Hold this key to increase only this propeller's power. Aircraft control keys such as W, A, S, D, Shift, and Ctrl are kept separate."
          onCommit={(value) => commitBehavior("throttleUpKey", value)}
          notify={notify}
        />
        <KeyBindingField
          label="Less power key"
          value={
            typeof component.properties.throttleDownKey === "string"
              ? component.properties.throttleDownKey
              : null
          }
          help="Hold this key to reduce only this propeller's power. Give every propeller its own pair of keys."
          onCommit={(value) => commitBehavior("throttleDownKey", value)}
          notify={notify}
        />
      </div>
    </>
  );

  const batteryFields = component.type === "battery" && (
    <div className="engineering-fields">
      <NumberPropertyField
        id={fieldId("battery-series")}
        label="Cells in series"
        value={battery?.series ?? propertyNumber("batterySeries", 4)}
        unit="S"
        help="Cells connected end-to-end. More series cells increase the battery voltage. A 6S battery has six cells in series."
        minimum={1}
        maximum={24}
        step={1}
        integer
        onCommit={(value) => commit("batterySeries", value)}
      />
      <NumberPropertyField
        id={fieldId("battery-capacity")}
        label="Battery capacity"
        value={battery?.capacityAh ?? propertyNumber("batteryCapacityAh", 5)}
        unit="Ah"
        help="How much charge the battery stores. More capacity usually gives longer flight time but adds weight."
        minimum={0.01}
        step={0.1}
        onCommit={(value) => commit("batteryCapacityAh", value)}
      />
      <NumberPropertyField
        id={fieldId("battery-current")}
        label="Safe continuous current"
        value={battery?.maxContinuousCurrentA ?? propertyNumber("batteryMaxCurrentA", 30)}
        unit="A"
        help="The current the battery can safely supply for the whole flight. Use the battery maker's continuous rating, not a short burst rating."
        minimum={0.1}
        step={1}
        onCommit={(value) => commit("batteryMaxCurrentA", value)}
      />
      <NumberPropertyField
        id={fieldId("battery-charge")}
        label="Starting charge"
        value={(battery?.stateOfCharge ?? propertyNumber("batteryStateOfCharge", 1)) * 100}
        unit="%"
        help="How full the battery is at the start of the simulation."
        minimum={0}
        maximum={100}
        step={1}
        onCommit={(value) => commit("batteryStateOfCharge", value / 100)}
      />
      {advancedMode && (
        <>
          <NumberPropertyField
            id={fieldId("battery-parallel")}
            label="Parallel cell groups"
            value={battery?.parallel ?? propertyNumber("batteryParallel", 1)}
            unit="P"
            help="Cell groups connected side-by-side. More parallel groups increase capacity and current capability."
            minimum={1}
            maximum={20}
            step={1}
            integer
            onCommit={(value) => commit("batteryParallel", value)}
          />
          <NumberPropertyField
            id={fieldId("battery-cell-voltage")}
            label="Cell voltage"
            value={battery?.cellOpenCircuitVoltageV ?? propertyNumber("batteryCellVoltageV", 4.2)}
            unit="V"
            help="Voltage of one cell before load is applied. Use a value that matches the battery chemistry and charge level."
            minimum={0.1}
            maximum={6}
            step={0.01}
            onCommit={(value) => commit("batteryCellVoltageV", value)}
          />
        </>
      )}
    </div>
  );

  const horizontalSurfaceTypes = [
    "wing",
    "horizontal_stabilizer",
    "canard",
    "control_surface",
    "flap",
    "aileron",
    "elevator",
    "elevon",
    "flaperon",
    "spoiler",
    "air_brake"
  ];
  const wingFields = horizontalSurfaceTypes.includes(component.type) && (
    <div className="engineering-fields">
      <NumberPropertyField
        id={fieldId("wing-root-chord")}
        label="Width at the body"
        value={propertyNumber("rootChordM", component.geometry.boundingBoxM[0])}
        unit="m"
        help="The front-to-back wing width where it joins the aircraft body. Engineers call this the root chord."
        minimum={0.001}
        step={0.01}
        onCommit={(value) => commit("rootChordM", value)}
      />
      <NumberPropertyField
        id={fieldId("wing-tip-chord")}
        label="Width at the tip"
        value={propertyNumber("tipChordM", component.geometry.boundingBoxM[0] * 0.6)}
        unit="m"
        help="The front-to-back wing width at its outer tip. Engineers call this the tip chord."
        minimum={0.001}
        step={0.01}
        onCommit={(value) => commit("tipChordM", value)}
      />
      <NumberPropertyField
        id={fieldId("wing-half-span")}
        label="Length from body to tip"
        value={propertyNumber("semiSpanM", component.geometry.boundingBoxM[1])}
        unit="m"
        help="The sideways distance from the aircraft centre to this wing tip. Engineers call this the semi-span."
        minimum={0.001}
        step={0.01}
        onCommit={(value) => commit("semiSpanM", value)}
      />
      {advancedMode && (
        <NumberPropertyField
          id={fieldId("wing-twist")}
          label="Tip twist"
          value={(propertyNumber("twistTipRad", 0) * 180) / Math.PI}
          unit="°"
          help="How much the wing tip is turned compared with the wing root. A small negative value can make the root stall first."
          minimum={-30}
          maximum={30}
          step={0.1}
          onCommit={(value) => commit("twistTipRad", (value * Math.PI) / 180)}
        />
      )}
    </div>
  );

  const verticalSurfaceFields = ["vertical_stabilizer", "rudder"].includes(component.type) && (
    <div className="engineering-fields">
      <NumberPropertyField
        id={fieldId("vertical-root-chord")}
        label="Width at the body"
        value={propertyNumber("rootChordM", component.geometry.boundingBoxM[0])}
        unit="m"
        help="The front-to-back width where this vertical surface joins the aircraft."
        minimum={0.001}
        step={0.01}
        onCommit={(value) => commit("rootChordM", value)}
      />
      <NumberPropertyField
        id={fieldId("vertical-tip-chord")}
        label="Width at the tip"
        value={propertyNumber("tipChordM", component.geometry.boundingBoxM[0] * 0.6)}
        unit="m"
        help="The front-to-back width at the top of this vertical surface."
        minimum={0.001}
        step={0.01}
        onCommit={(value) => commit("tipChordM", value)}
      />
      <NumberPropertyField
        id={fieldId("vertical-height")}
        label="Surface height"
        value={propertyNumber(
          "heightM",
          Math.max(component.geometry.boundingBoxM[2], component.geometry.boundingBoxM[1])
        )}
        unit="m"
        help="The distance from the bottom of the fin or rudder to its top."
        minimum={0.001}
        step={0.01}
        onCommit={(value) => commit("heightM", value)}
      />
    </div>
  );

  const fuselageFields = component.type === "fuselage" &&
    component.geometry.kind === "procedural" && (
      <div className="engineering-fields">
        <NumberPropertyField
          id={fieldId("body-length")}
          label="Body length"
          value={propertyNumber("lengthM", component.geometry.boundingBoxM[0])}
          unit="m"
          help="The full front-to-back length of the aircraft body."
          minimum={0.001}
          step={0.01}
          onCommit={(value) => commit("lengthM", value)}
        />
        <NumberPropertyField
          id={fieldId("body-radius")}
          label="Body radius"
          value={propertyNumber("radiusM", component.geometry.boundingBoxM[1] / 2)}
          unit="m"
          help="The distance from the centre of the body to its outside surface. Diameter is twice this value."
          minimum={0.001}
          step={0.01}
          onCommit={(value) => commit("radiusM", value)}
        />
      </div>
    );

  const poweredAccessoryFields = [
    "payload",
    "camera",
    "lidar",
    "flight_controller",
    "gps",
    "esc"
  ].includes(component.type) && (
    <div className="engineering-fields">
      <NumberPropertyField
        id={fieldId("accessory-power")}
        label="Power use"
        value={propertyNumber("powerW", 0)}
        unit="W"
        help="Electrical power this part uses while it is running. This is saved with the part for energy planning."
        minimum={0}
        step={1}
        onCommit={(value) => commit("powerW", value)}
      />
    </div>
  );

  const internalTypes = [
    "motor",
    "propeller",
    "rotor",
    "tilt_mechanism",
    "servo",
    "battery",
    "fuel_tank",
    "esc",
    "flight_controller",
    "camera",
    "lidar",
    "gps",
    "payload",
    "ballast",
    "parachute",
    "generic_mass",
    "collision_only",
    "visual_only",
    "cfd_excluded"
  ];
  const isLiftingSurface =
    horizontalSurfaceTypes.includes(component.type) ||
    ["vertical_stabilizer", "rudder"].includes(component.type);
  const isMovableAirSurface = [
    "control_surface",
    "flap",
    "aileron",
    "elevator",
    "rudder",
    "elevon",
    "flaperon",
    "spoiler",
    "air_brake"
  ].includes(component.type);
  const hasAirSettings =
    component.geometry.kind === "mesh" ||
    isLiftingSurface ||
    (!internalTypes.includes(component.type) && defaultAerodynamicEnabled(component));
  const airFields = hasAirSettings && (
    <section className="inspector-section inspector-section--engineering air-reaction-settings">
      <h3 className="heading-with-help">
        Air reaction
        <InfoTip label="Air reaction" align="right">
          When this is on, Fly calculates air force on this part at its actual position. Turning it
          off removes this part from the built-in flight air model.
        </InfoTip>
      </h3>
      <label className="compact-toggle">
        <input
          type="checkbox"
          checked={componentAerodynamicEnabled(component)}
          onChange={(event) => commitBehavior("aeroEnabled", event.target.checked)}
        />
        Let air push on this part
      </label>
      {componentAerodynamicEnabled(component) && (
        <div className="engineering-fields">
          {component.geometry.kind === "mesh" && (
            <small>
              The imported faces react from their real size and direction. You do not need to name
              an airfoil.
            </small>
          )}
          {isLiftingSurface && component.geometry.kind !== "mesh" ? (
            <>
              <NumberPropertyField
                id={fieldId("air-base-drag")}
                label="Clean drag"
                value={propertyNumber("aeroBaseDragCoefficient", 0.022)}
                unit="Cd"
                help="How strongly this surface slows the aircraft before extra drag from making lift is added. Use airfoil data when available."
                minimum={0}
                maximum={2}
                step={0.001}
                onCommit={(value) => commit("aeroBaseDragCoefficient", value)}
              />
              <NumberPropertyField
                id={fieldId("air-stall-angle")}
                label="Stall angle"
                value={(propertyNumber("aeroStallAngleRad", (15 * Math.PI) / 180) * 180) / Math.PI}
                unit="°"
                help="At about this airflow angle, smooth lift starts to break down. After it, the simulator reduces lift instead of holding an impossible constant value."
                minimum={3}
                maximum={45}
                step={0.5}
                onCommit={(value) => commit("aeroStallAngleRad", (value * Math.PI) / 180)}
              />
              {advancedMode && (
                <>
                  <NumberPropertyField
                    id={fieldId("air-lift-slope")}
                    label="Lift response"
                    value={propertyNumber("aeroLiftSlopePerRad", 4.7)}
                    unit="1/rad"
                    help="How quickly lift grows as this part meets the air at a steeper angle. Use a measured or solver-derived value for reliable results."
                    minimum={0.01}
                    maximum={12}
                    step={0.1}
                    onCommit={(value) => commit("aeroLiftSlopePerRad", value)}
                  />
                  <NumberPropertyField
                    id={fieldId("air-max-lift")}
                    label="Maximum lift strength"
                    value={propertyNumber("aeroMaximumLiftCoefficient", 1.35)}
                    unit="Cl"
                    help="The strongest lift coefficient allowed before the post-stall falloff."
                    minimum={0.05}
                    maximum={4}
                    step={0.05}
                    onCommit={(value) => commit("aeroMaximumLiftCoefficient", value)}
                  />
                  <NumberPropertyField
                    id={fieldId("air-control-effect")}
                    label="Full movement angle"
                    value={
                      (propertyNumber("aeroControlEffectivenessRad", (12 * Math.PI) / 180) * 180) /
                      Math.PI
                    }
                    unit="°"
                    help="How much this flap, aileron, elevator, or rudder changes its local airflow angle at full input. This only affects parts whose type is a movable control surface."
                    minimum={0}
                    maximum={45}
                    step={0.5}
                    onCommit={(value) =>
                      commit("aeroControlEffectivenessRad", (value * Math.PI) / 180)
                    }
                  />
                </>
              )}
            </>
          ) : (
            <>
              <NumberPropertyField
                id={fieldId("air-pressure")}
                label="Pressure drag strength"
                value={propertyNumber("aeroPressureCoefficient", 0.9)}
                unit="Cp"
                help="How strongly air pressure pushes on faces aimed into the airflow. Shape and mesh orientation change the resulting force and turning moment."
                minimum={0}
                maximum={3}
                step={0.05}
                onCommit={(value) => commit("aeroPressureCoefficient", value)}
              />
              {advancedMode && (
                <>
                  <NumberPropertyField
                    id={fieldId("air-skin-friction")}
                    label="Skin drag strength"
                    value={propertyNumber("aeroSkinFrictionCoefficient", 0.005)}
                    unit="Cf"
                    help="A simple estimate of the air rubbing along the part. Surface finish and Reynolds number affect the real value."
                    minimum={0}
                    maximum={0.2}
                    step={0.001}
                    onCommit={(value) => commit("aeroSkinFrictionCoefficient", value)}
                  />
                  {component.geometry.kind === "mesh" && (
                    <NumberPropertyField
                      id={fieldId("air-surface-force-limit")}
                      label="Surface force limit"
                      value={propertyNumber("aeroMaximumLiftCoefficient", 1.4)}
                      unit="C"
                      help="Stops the quick surface reaction from growing forever at steep wind angles. This is a safety limit for the fast model, not an airfoil lookup."
                      minimum={0.05}
                      maximum={4}
                      step={0.05}
                      onCommit={(value) => commit("aeroMaximumLiftCoefficient", value)}
                    />
                  )}
                  {component.geometry.kind === "mesh" && isMovableAirSurface && (
                    <NumberPropertyField
                      id={fieldId("air-mesh-control-effect")}
                      label="Full movement angle"
                      value={
                        (propertyNumber("aeroControlEffectivenessRad", (12 * Math.PI) / 180) *
                          180) /
                        Math.PI
                      }
                      unit="°"
                      help="How far this imported aileron, elevator, rudder, or flap turns at full input. Its mesh faces rotate by this amount in Fly."
                      minimum={0}
                      maximum={45}
                      step={0.5}
                      onCommit={(value) =>
                        commit("aeroControlEffectivenessRad", (value * Math.PI) / 180)
                      }
                    />
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );

  return (
    <>
      {(motorFields ||
        propellerFields ||
        batteryFields ||
        wingFields ||
        verticalSurfaceFields ||
        fuselageFields ||
        poweredAccessoryFields) && (
        <section className="inspector-section inspector-section--engineering">
          <h3 className="heading-with-help">
            How this part works
            <InfoTip label="Part settings" align="right">
              These numbers describe how the selected part behaves. Changes are autosaved and feed
              into the matching aircraft calculations when that part is connected.
            </InfoTip>
          </h3>
          {motorFields}
          {propellerFields}
          {batteryFields}
          {wingFields}
          {verticalSurfaceFields}
          {fuselageFields}
          {poweredAccessoryFields}
        </section>
      )}
      {airFields}
      <section className="inspector-section inspector-section--engineering">
        <h3 className="heading-with-help">
          Weight and appearance
          <InfoTip label="Weight and appearance" align="right">
            Weight changes the balance and flight response. The colour and visibility only change
            what you see in the 3D view.
          </InfoTip>
        </h3>
        <div className="property-summary property-summary--weight">
          <Weight size={16} />
          <span>
            <small>PART WEIGHT</small>
            <strong>
              {component.mass === null ? "Not entered" : `${component.mass.valueKg.toFixed(3)} kg`}
            </strong>
          </span>
        </div>
        <div className="engineering-fields">
          <NumberPropertyField
            id={fieldId("part-mass")}
            label="Part weight"
            value={component.mass?.valueKg ?? 0}
            unit="kg"
            help="Mass of this one part. It changes total aircraft weight and balance. Use a measured value when possible."
            minimum={0}
            step={0.01}
            onCommit={(value) => commit("massKg", value)}
          />
          {advancedMode && (
            <NumberPropertyField
              id={fieldId("mass-uncertainty")}
              label="Weight uncertainty"
              value={component.mass?.uncertaintyKg ?? 0}
              unit="kg"
              help="How far the real weight may be above or below the entered value. This helps reports show measurement confidence."
              minimum={0}
              step={0.01}
              onCommit={(value) => commit("massUncertaintyKg", value)}
            />
          )}
        </div>
        <div className="part-appearance-controls">
          <label className="compact-toggle">
            <input
              type="checkbox"
              checked={component.visible}
              onChange={(event) => {
                const visible = event.target.checked;
                setProject((current) => ({
                  ...current,
                  updatedAt: new Date().toISOString(),
                  vehicle: {
                    ...current.vehicle,
                    components: current.vehicle.components.map((item) =>
                      item.id === component.id ? { ...item, visible } : item
                    )
                  }
                }));
              }}
            />
            Show in 3D view
          </label>
          <label className="part-color-control">
            <span>Colour</span>
            <input
              type="color"
              value={component.visual.color}
              aria-label="Part colour"
              onChange={(event) => {
                const color = event.target.value;
                setProject((current) => ({
                  ...current,
                  updatedAt: new Date().toISOString(),
                  vehicle: {
                    ...current.vehicle,
                    components: current.vehicle.components.map((item) =>
                      item.id === component.id
                        ? { ...item, visual: { ...item.visual, color } }
                        : item
                    )
                  }
                }));
              }}
            />
          </label>
        </div>
      </section>
    </>
  );
}
