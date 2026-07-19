import { describe, expect, it } from "vitest";
import { generateEngineeringReportHtml } from "./index";

describe("report generation", () => {
  it("escapes project content and keeps provenance visible", () => {
    const html = generateEngineeringReportHtml({
      project: {
        schemaVersion: "1.0.0",
        projectId: "28637866-1aaf-4b75-8f13-5bf7c37c8c48",
        name: "<script>alert(1)</script>",
        revision: "A",
        description: "test",
        createdAt: "2026-07-19T00:00:00.000Z",
        updatedAt: "2026-07-19T00:00:00.000Z",
        conventions: {
          internalUnits: "SI",
          bodyFrame: "FRD",
          worldFrame: "NED",
          angles: "radians",
          pressure: "absolute_pascal"
        },
        vehicle: {
          name: "test",
          description: "",
          reference: {
            areaM2: 1,
            spanM: 2,
            chordM: 0.5,
            referencePointM: [0, 0, 0],
            provenance: "user_entered"
          },
          components: [],
          joints: [],
          propulsionUnits: [],
          batteries: []
        },
        environment: {
          altitudeM: 0,
          temperatureK: null,
          windNedMS: [0, 0, 0],
          turbulence: "none",
          provenance: "user_entered"
        },
        results: [],
        tags: [],
        warnings: []
      },
      manifest: {
        aerocelForgeVersion: "1.0.0",
        gitCommit: "dev",
        operatingSystem: "test",
        generatedAt: "now",
        projectInputHash: "hash",
        configurationHash: "hash",
        randomSeeds: [],
        solvers: []
      },
      results: [],
      validationSummary: [],
      warnings: []
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
