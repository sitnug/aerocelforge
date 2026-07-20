import type { AerocelProject, VehicleComponent } from "@aerocel/simulation-schema";

type Vehicle = AerocelProject["vehicle"];
type Joint = Vehicle["joints"][number];
type PropulsionUnit = Vehicle["propulsionUnits"][number];
type Battery = Vehicle["batteries"][number];

export interface ComponentClipboard {
  readonly rootId: string;
  readonly components: readonly VehicleComponent[];
  readonly joints: readonly Joint[];
  readonly propulsionUnits: readonly PropulsionUnit[];
  readonly batteries: readonly Battery[];
}

export interface PasteResult {
  readonly project: AerocelProject;
  readonly selectedId: string;
  readonly componentCount: number;
}

export function copyComponentTree(
  project: AerocelProject,
  rootId: string
): ComponentClipboard | null {
  if (!project.vehicle.components.some((component) => component.id === rootId)) return null;
  const componentIds = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const component of project.vehicle.components) {
      if (
        component.parentId !== null &&
        componentIds.has(component.parentId) &&
        !componentIds.has(component.id)
      ) {
        componentIds.add(component.id);
        changed = true;
      }
    }
  }
  return structuredClone({
    rootId,
    components: project.vehicle.components.filter((component) => componentIds.has(component.id)),
    joints: project.vehicle.joints.filter((joint) => componentIds.has(joint.childComponentId)),
    propulsionUnits: project.vehicle.propulsionUnits.filter(
      (unit) =>
        componentIds.has(unit.motorComponentId) && componentIds.has(unit.propellerComponentId)
    ),
    batteries: project.vehicle.batteries.filter((battery) => componentIds.has(battery.id))
  });
}

export function pasteComponentTree(
  project: AerocelProject,
  clipboard: ComponentClipboard,
  createId: () => string = () => crypto.randomUUID()
): PasteResult {
  const existingComponentIds = new Set(project.vehicle.components.map((component) => component.id));
  const existingNames = new Set(project.vehicle.components.map((component) => component.name));
  const copyBaseName = `${clipboard.components.find((item) => item.id === clipboard.rootId)?.name ?? "Part"} copy`;
  let copyName = copyBaseName;
  let copyNumber = 2;
  while (existingNames.has(copyName)) copyName = `${copyBaseName} ${copyNumber++}`;
  const componentIds = new Map(clipboard.components.map((component) => [component.id, createId()]));
  const jointIds = new Map(clipboard.joints.map((joint) => [joint.id, createId()]));
  const copiedComponents = clipboard.components.map((component) => {
    const id = componentIds.get(component.id) as string;
    const isRoot = component.id === clipboard.rootId;
    return {
      ...structuredClone(component),
      id,
      name: isRoot ? copyName : component.name,
      parentId: isRoot
        ? component.parentId !== null && existingComponentIds.has(component.parentId)
          ? component.parentId
          : null
        : component.parentId === null
          ? null
          : (componentIds.get(component.parentId) ?? component.parentId),
      transform: {
        ...component.transform,
        translationM: isRoot
          ? [
              component.transform.translationM[0],
              component.transform.translationM[1] + 0.1,
              component.transform.translationM[2]
            ]
          : component.transform.translationM
      }
    } satisfies VehicleComponent;
  });
  const copiedJoints = clipboard.joints
    .filter(
      (joint) =>
        componentIds.has(joint.parentComponentId) ||
        existingComponentIds.has(joint.parentComponentId)
    )
    .map((joint) => ({
      ...structuredClone(joint),
      id: jointIds.get(joint.id) as string,
      name: `${joint.name} copy`,
      parentComponentId: componentIds.get(joint.parentComponentId) ?? joint.parentComponentId,
      childComponentId: componentIds.get(joint.childComponentId) ?? joint.childComponentId
    }));
  const copiedPropulsionUnits = clipboard.propulsionUnits.map((unit) => ({
    ...structuredClone(unit),
    id: createId(),
    name: `${unit.name} copy`,
    motorComponentId: componentIds.get(unit.motorComponentId) as string,
    propellerComponentId: componentIds.get(unit.propellerComponentId) as string,
    jointId: unit.jointId === null ? null : (jointIds.get(unit.jointId) ?? null)
  }));
  const copiedBatteries = clipboard.batteries.map((battery) => ({
    ...structuredClone(battery),
    id: componentIds.get(battery.id) as string,
    name: `${battery.name} copy`
  }));
  return {
    project: {
      ...project,
      updatedAt: new Date().toISOString(),
      vehicle: {
        ...project.vehicle,
        components: [...project.vehicle.components, ...copiedComponents],
        joints: [...project.vehicle.joints, ...copiedJoints],
        propulsionUnits: [...project.vehicle.propulsionUnits, ...copiedPropulsionUnits],
        batteries: [...project.vehicle.batteries, ...copiedBatteries]
      }
    },
    selectedId: componentIds.get(clipboard.rootId) as string,
    componentCount: copiedComponents.length
  };
}
