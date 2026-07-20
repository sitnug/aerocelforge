import type { AerocelProject } from "@aerocel/simulation-schema";

export interface ComponentDeletionPlan {
  readonly rootId: string;
  readonly rootName: string;
  readonly componentIds: readonly string[];
  readonly componentNames: readonly string[];
  readonly jointIds: readonly string[];
  readonly propulsionUnitIds: readonly string[];
}

export function planComponentDeletion(
  project: AerocelProject,
  rootId: string
): ComponentDeletionPlan {
  const root = project.vehicle.components.find((component) => component.id === rootId);
  if (root === undefined) throw new Error("The selected part no longer exists.");

  const componentIds = new Set<string>([rootId]);
  let foundChild = true;
  while (foundChild) {
    foundChild = false;
    for (const component of project.vehicle.components) {
      if (
        component.parentId !== null &&
        componentIds.has(component.parentId) &&
        !componentIds.has(component.id)
      ) {
        componentIds.add(component.id);
        foundChild = true;
      }
    }
  }

  const jointIds = project.vehicle.joints
    .filter(
      (joint) =>
        componentIds.has(joint.parentComponentId) || componentIds.has(joint.childComponentId)
    )
    .map((joint) => joint.id);
  const jointIdSet = new Set(jointIds);
  const propulsionUnitIds = project.vehicle.propulsionUnits
    .filter(
      (unit) =>
        componentIds.has(unit.motorComponentId) ||
        componentIds.has(unit.propellerComponentId) ||
        (unit.jointId !== null && jointIdSet.has(unit.jointId))
    )
    .map((unit) => unit.id);

  return {
    rootId,
    rootName: root.name,
    componentIds: [...componentIds],
    componentNames: project.vehicle.components
      .filter((component) => componentIds.has(component.id))
      .map((component) => component.name),
    jointIds,
    propulsionUnitIds
  };
}

export function applyComponentDeletion(
  project: AerocelProject,
  plan: ComponentDeletionPlan
): AerocelProject {
  const componentIds = new Set(plan.componentIds);
  const jointIds = new Set(plan.jointIds);
  const propulsionUnitIds = new Set(plan.propulsionUnitIds);
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    vehicle: {
      ...project.vehicle,
      components: project.vehicle.components.filter((component) => !componentIds.has(component.id)),
      joints: project.vehicle.joints.filter((joint) => !jointIds.has(joint.id)),
      propulsionUnits: project.vehicle.propulsionUnits.filter(
        (unit) => !propulsionUnitIds.has(unit.id)
      ),
      batteries: project.vehicle.batteries.filter((battery) => !componentIds.has(battery.id))
    }
  };
}
