import { describe, expect, it } from "vitest";
import {
  acceptForGeometryFormat,
  detectGeometryFormat,
  inspectGeometryFile,
  requireSingleGeometryFile
} from "./importers";

describe("geometry format registry", () => {
  it("detects grouped extensions and narrows file picker acceptance", () => {
    expect(detectGeometryFormat("wing.STP")?.id).toBe("step");
    expect(detectGeometryFormat("vehicle.glb")?.id).toBe("gltf");
    expect(acceptForGeometryFormat("iges")).toBe(".iges,.igs");
  });

  it("accepts exactly one dropped file and rejects ambiguous drops", () => {
    const file = new File(["solid empty"], "body.stl");
    expect(requireSingleGeometryFile([file])).toBe(file);
    expect(() => requireSingleGeometryFile([])).toThrow("exactly one");
    expect(() => requireSingleGeometryFile([file, file])).toThrow("exactly one");
  });
});

describe("hardened geometry inspection", () => {
  it("scales an ASCII STL from millimetres to metres", async () => {
    const file = new File(
      [
        `solid wing
facet normal 0 0 1
outer loop
vertex 0 0 0
vertex 1000 0 0
vertex 0 500 0
endloop
endfacet
endsolid wing`
      ],
      "wing.stl"
    );
    const result = await inspectGeometryFile(file, {
      requestedFormat: "stl",
      originalUnits: "mm"
    });
    expect(result.status).toBe("inspected");
    expect(result.inspection?.boundingBoxM).toEqual([1, 0.5, 0]);
    expect(result.sourceSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("supports relative OBJ face indices", async () => {
    const file = new File(["v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n"], "surface.obj");
    const result = await inspectGeometryFile(file, {
      requestedFormat: "obj",
      originalUnits: "m"
    });
    expect(result.inspection?.triangleCount).toBe(1);
  });

  it("rejects an explicit format mismatch", async () => {
    const file = new File(["v 0 0 0"], "body.obj");
    await expect(
      inspectGeometryFile(file, { requestedFormat: "stl", originalUnits: "m" })
    ).rejects.toThrow("but the import type is");
  });

  it("gates B-rep data without flattening it", async () => {
    const file = new File(["ISO-10303-21;"], "fuselage.step");
    const result = await inspectGeometryFile(file, {
      requestedFormat: "step",
      originalUnits: "mm"
    });
    expect(result.status).toBe("adapter_required");
    expect(result.mesh).toBeNull();
    expect(result.explanation).toContain("no geometry was converted or approximated");
  });

  it("inspects DAT coordinates as section-only data", async () => {
    const file = new File(["NACA example\n1 0\n0.5 0.1\n0 0\n0.5 -0.1\n1 0\n"], "naca.dat");
    const result = await inspectGeometryFile(file, {
      requestedFormat: "dat",
      originalUnits: "m"
    });
    expect(result.status).toBe("section_only");
    expect(result.inspection?.boundingBoxM).toEqual([1, 0.2, 0]);
  });

  it("rejects network-capable references in untrusted glTF", async () => {
    const file = new File(
      [
        JSON.stringify({
          asset: { version: "2.0" },
          buffers: [{ uri: "https://example.test/a.bin" }]
        })
      ],
      "remote.gltf"
    );
    await expect(
      inspectGeometryFile(file, { requestedFormat: "gltf", originalUnits: "m" })
    ).rejects.toThrow("external files or URLs");
  });
});
