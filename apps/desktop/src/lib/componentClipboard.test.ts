import { describe, expect, it } from "vitest";
import { createBlankProject } from "./projects";
import { addBasicPart } from "./basicParts";
import { copyComponentTree, pasteComponentTree } from "./componentClipboard";

describe("component clipboard", () => {
  it("copies and pastes a motor with its propeller and propulsion setup", () => {
    const motorId = "00000000-0000-4000-8000-000000000001";
    const project = addBasicPart(createBlankProject("Clipboard"), "motor_propeller", motorId);
    const clipboard = copyComponentTree(project, motorId);
    expect(clipboard?.components).toHaveLength(2);
    expect(clipboard?.propulsionUnits).toHaveLength(1);

    let id = 10;
    const pasted = pasteComponentTree(
      project,
      clipboard!,
      () => `00000000-0000-4000-8000-${String(id++).padStart(12, "0")}`
    );
    expect(pasted.componentCount).toBe(2);
    expect(pasted.project.vehicle.components).toHaveLength(4);
    expect(pasted.project.vehicle.propulsionUnits).toHaveLength(2);
    expect(pasted.project.vehicle.components.at(-2)?.name).toContain("copy");
    expect(pasted.project.vehicle.components.at(-1)?.parentId).toBe(pasted.selectedId);
  });
});
