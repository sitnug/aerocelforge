import { describe, expect, it } from "vitest";
import { OpenFoamAdapter, validatePx4Mapping, validateRemoteHost } from "./index";

describe("solver adapter command safety", () => {
  it("rejects traversal in a case path", () => {
    const adapter = new OpenFoamAdapter();
    expect(() =>
      adapter.buildCommands(
        {
          id: "job",
          solverId: "openfoam",
          adapterVersion: "1.0.0",
          executionMode: "local_linux",
          resourceClass: "heavy",
          inputHash: "hash",
          input: {} as never,
          stages: [],
          createdAt: "2026-07-19T00:00:00.000Z"
        },
        "../escape"
      )
    ).toThrow(/Unsafe/);
  });
});

describe("integration configuration validation", () => {
  it("finds duplicate PX4 outputs", () => {
    const issues = validatePx4Mapping({
      airframe: "tiltrotor",
      modelName: "kestrel",
      parameterFile: null,
      mavlinkUdpPort: 14_560,
      actuatorMappings: [
        { output: 1, componentId: "a", function: "motor", minimum: 0, maximum: 1 },
        { output: 1, componentId: "b", function: "motor", minimum: 0, maximum: 1 }
      ]
    });
    expect(issues.join(" ")).toMatch(/more than once/);
  });

  it("never accepts private key material in a remote profile", () => {
    const issues = validateRemoteHost({
      id: "lab",
      displayName: "Lab",
      hostname: "solver.example.edu",
      port: 22,
      username: "engineer",
      identityFileReference: "-----BEGIN PRIVATE KEY-----",
      scheduler: "slurm",
      remoteRoot: "/scratch/aerocel",
      cpuLimit: 64,
      memoryLimitGb: 128
    });
    expect(issues.join(" ")).toMatch(/key reference/);
  });
});
