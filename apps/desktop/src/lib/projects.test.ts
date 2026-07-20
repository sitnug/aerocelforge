import { describe, expect, it } from "vitest";
import { createBlankProject, isLegacyExampleProject, uniqueProjectFileName } from "./projects";

describe("blank project files", () => {
  it("creates a valid file with no example aircraft or fake engineering data", () => {
    const project = createBlankProject("My aircraft", new Date("2026-07-20T12:00:00.000Z"));

    expect(project.name).toBe("My aircraft");
    expect(project.vehicle.components).toEqual([]);
    expect(project.vehicle.propulsionUnits).toEqual([]);
    expect(project.vehicle.batteries).toEqual([]);
    expect(project.createdAt).toBe("2026-07-20T12:00:00.000Z");
  });

  it("creates a portable, unique managed file name", () => {
    expect(uniqueProjectFileName("Åircraft: Mk/1", ["Aircraft Mk 1.aerocel.json"])).toBe(
      "Aircraft Mk 1 2.aerocel.json"
    );
  });

  it("recognizes only the retired built-in sample", () => {
    expect(
      isLegacyExampleProject({ name: "Kestrel — Reference Concept", revision: "Baseline" })
    ).toBe(true);
    expect(isLegacyExampleProject({ name: "My Kestrel", revision: "Baseline" })).toBe(false);
  });
});
