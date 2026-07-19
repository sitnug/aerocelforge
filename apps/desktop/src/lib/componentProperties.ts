import type { AerocelProject, VehicleComponent } from "@aerocel/simulation-schema";

export type EngineeringPropertyKey =
  | "maximumThrustN"
  | "motorKvRpmPerVolt"
  | "motorMaxCurrentA"
  | "motorMaxPowerW"
  | "motorWindingResistanceOhm"
  | "diameterM"
  | "pitchM"
  | "bladeCount"
  | "batterySeries"
  | "batteryParallel"
  | "batteryCapacityAh"
  | "batteryMaxCurrentA"
  | "batteryStateOfCharge"
  | "batteryCellVoltageV"
  | "rootChordM"
  | "tipChordM"
  | "semiSpanM"
  | "twistTipRad"
  | "lengthM"
  | "radiusM"
  | "powerW"
  | "massKg"
  | "massUncertaintyKg";

const POSITIVE_KEYS = new Set<EngineeringPropertyKey>([
  "maximumThrustN",
  "motorKvRpmPerVolt",
  "motorMaxCurrentA",
  "motorMaxPowerW",
  "motorWindingResistanceOhm",
  "diameterM",
  "pitchM",
  "bladeCount",
  "batterySeries",
  "batteryParallel",
  "batteryCapacityAh",
  "batteryMaxCurrentA",
  "batteryCellVoltageV",
  "rootChordM",
  "tipChordM",
  "semiSpanM",
  "lengthM",
  "radiusM"
]);

function makeMass(
  component: VehicleComponent,
  massKg: number
): NonNullable<VehicleComponent["mass"]> {
  const [x, y, z] = component.geometry.boundingBoxM;
  return {
    valueKg: massKg,
    cgLocalM: [0, 0, 0],
    inertiaKgM2: [
      (massKg * (y ** 2 + z ** 2)) / 12,
      0,
      0,
      0,
      (massKg * (x ** 2 + z ** 2)) / 12,
      0,
      0,
      0,
      (massKg * (x ** 2 + y ** 2)) / 12
    ],
    uncertaintyKg: 0,
    provenance: "user_entered",
    note: "Entered in the part editor; box inertia estimate"
  };
}

function wingArea(component: VehicleComponent): number {
  const root = Number(component.properties.rootChordM);
  const tip = Number(component.properties.tipChordM);
  const span = Number(component.properties.semiSpanM);
  return root > 0 && tip > 0 && span > 0 ? ((root + tip) * span) / 2 : 0;
}

function wingSpan(component: VehicleComponent): number {
  const span = Number(component.properties.semiSpanM);
  return span > 0 ? span : 0;
}

function updateComponent(
  component: VehicleComponent,
  key: EngineeringPropertyKey,
  value: number
): VehicleComponent {
  if (key === "massKg") {
    return {
      ...component,
      mass:
        component.mass === null
          ? makeMass(component, value)
          : { ...component.mass, valueKg: value, provenance: "user_entered" }
    };
  }
  if (key === "massUncertaintyKg") {
    const mass = component.mass ?? makeMass(component, 0);
    return { ...component, mass: { ...mass, uncertaintyKg: value, provenance: "user_entered" } };
  }

  const properties = { ...component.properties, [key]: value };
  let boundingBoxM = [...component.geometry.boundingBoxM] as [number, number, number];
  if (["rootChordM", "tipChordM", "semiSpanM"].includes(key)) {
    const root = key === "rootChordM" ? value : Number(properties.rootChordM);
    const tip = key === "tipChordM" ? value : Number(properties.tipChordM);
    const span = key === "semiSpanM" ? value : Number(properties.semiSpanM);
    boundingBoxM = [
      Math.max(root > 0 ? root : boundingBoxM[0], tip > 0 ? tip : 0),
      span > 0 ? span : boundingBoxM[1],
      boundingBoxM[2]
    ];
  }
  if (key === "lengthM") boundingBoxM[0] = value;
  if (key === "radiusM") {
    boundingBoxM[1] = value * 2;
    boundingBoxM[2] = value * 2;
  }
  return {
    ...component,
    properties,
    geometry: { ...component.geometry, boundingBoxM }
  };
}

export function setComponentEngineeringValue(
  project: AerocelProject,
  componentId: string,
  key: EngineeringPropertyKey,
  value: number
): AerocelProject {
  if (!Number.isFinite(value)) throw new Error("The value must be a real number.");
  if (POSITIVE_KEYS.has(key) && value <= 0) throw new Error("The value must be greater than zero.");
  if (["massKg", "massUncertaintyKg", "powerW"].includes(key) && value < 0) {
    throw new Error("The value cannot be negative.");
  }
  if (key === "batteryStateOfCharge" && (value < 0 || value > 1)) {
    throw new Error("Battery charge must be between 0% and 100%.");
  }
  if (
    ["bladeCount", "batterySeries", "batteryParallel"].includes(key) &&
    !Number.isInteger(value)
  ) {
    throw new Error("This value must be a whole number.");
  }

  const selected = project.vehicle.components.find((component) => component.id === componentId);
  if (selected === undefined) throw new Error("The selected part no longer exists.");
  const oldWingArea = project.vehicle.components
    .filter((component) => component.type === "wing")
    .reduce((sum, component) => sum + wingArea(component), 0);
  const oldWingSpan = project.vehicle.components
    .filter((component) => component.type === "wing")
    .reduce((sum, component) => sum + wingSpan(component), 0);
  const components = project.vehicle.components.map((component) =>
    component.id === componentId ? updateComponent(component, key, value) : component
  );
  const updatedSelected = components.find((component) => component.id === componentId);
  if (updatedSelected === undefined) throw new Error("The selected part could not be updated.");

  const propulsionUnits = project.vehicle.propulsionUnits.map((unit) => {
    if (unit.motorComponentId === componentId) {
      if (key === "motorKvRpmPerVolt") {
        return { ...unit, motor: { ...unit.motor, kvRpmPerVolt: value } };
      }
      if (key === "motorMaxCurrentA") {
        return { ...unit, motor: { ...unit.motor, maxCurrentA: value } };
      }
      if (key === "motorMaxPowerW") {
        return { ...unit, motor: { ...unit.motor, maxPowerW: value } };
      }
      if (key === "motorWindingResistanceOhm") {
        return { ...unit, motor: { ...unit.motor, windingResistanceOhm: value } };
      }
    }
    if (unit.propellerComponentId === componentId) {
      if (key === "diameterM") return { ...unit, diameterM: value };
      if (key === "pitchM") return { ...unit, pitchM: value };
      if (key === "bladeCount") return { ...unit, bladeCount: value };
    }
    return unit;
  });

  const batteries = project.vehicle.batteries.map((battery) => {
    if (battery.id !== componentId) return battery;
    if (key === "batterySeries") return { ...battery, series: value };
    if (key === "batteryParallel") return { ...battery, parallel: value };
    if (key === "batteryCapacityAh") return { ...battery, capacityAh: value };
    if (key === "batteryMaxCurrentA") return { ...battery, maxContinuousCurrentA: value };
    if (key === "batteryStateOfCharge") return { ...battery, stateOfCharge: value };
    if (key === "batteryCellVoltageV") return { ...battery, cellOpenCircuitVoltageV: value };
    return battery;
  });

  let reference = project.vehicle.reference;
  if (
    selected.type === "wing" &&
    ["rootChordM", "tipChordM", "semiSpanM"].includes(key) &&
    oldWingArea > 0 &&
    oldWingSpan > 0
  ) {
    const newWingArea = components
      .filter((component) => component.type === "wing")
      .reduce((sum, component) => sum + wingArea(component), 0);
    const newWingSpan = components
      .filter((component) => component.type === "wing")
      .reduce((sum, component) => sum + wingSpan(component), 0);
    const areaM2 = reference.areaM2 * (newWingArea / oldWingArea);
    const spanM = reference.spanM * (newWingSpan / oldWingSpan);
    reference = {
      ...reference,
      areaM2,
      spanM,
      chordM: areaM2 / spanM,
      provenance: "user_entered"
    };
  }

  return {
    ...project,
    updatedAt: new Date().toISOString(),
    vehicle: { ...project.vehicle, components, propulsionUnits, batteries, reference }
  };
}

export function configuredMotorThrustN(
  project: AerocelProject,
  motorComponentId: string
): number | null {
  const component = project.vehicle.components.find((item) => item.id === motorComponentId);
  const value = Number(component?.properties.maximumThrustN);
  return Number.isFinite(value) && value > 0 ? value : null;
}
