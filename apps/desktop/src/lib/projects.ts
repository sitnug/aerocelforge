import { parseProject, SCHEMA_VERSION, type AerocelProject } from "@aerocel/simulation-schema";

export function createBlankProject(name: string, now = new Date()): AerocelProject {
  const cleanName = name.trim();
  if (cleanName.length === 0 || cleanName.length > 80) {
    throw new Error("Project name must contain 1–80 characters");
  }
  const timestamp = now.toISOString();
  return parseProject({
    schemaVersion: SCHEMA_VERSION,
    projectId: crypto.randomUUID(),
    name: cleanName,
    revision: "1",
    description: "Blank Aerocel Forge aircraft project.",
    createdAt: timestamp,
    updatedAt: timestamp,
    conventions: {
      internalUnits: "SI",
      bodyFrame: "FRD",
      worldFrame: "NED",
      angles: "radians",
      pressure: "absolute_pascal"
    },
    vehicle: {
      name: cleanName,
      description: "Import your own aircraft model to begin.",
      reference: {
        areaM2: 1,
        spanM: 1,
        chordM: 1,
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
  });
}

export function uniqueProjectFileName(
  projectName: string,
  existingFileNames: readonly string[]
): string {
  const normalizedExisting = new Set(existingFileNames.map((item) => item.toLowerCase()));
  const safeBase =
    projectName
      .normalize("NFKD")
      .replaceAll(/[^\x20-\x7e]/gu, "")
      .replaceAll(/[^a-zA-Z0-9 _-]+/gu, " ")
      .replaceAll(/\s+/gu, " ")
      .trim()
      .slice(0, 72) || "My aircraft";
  let suffix = 1;
  let candidate = `${safeBase}.aerocel.json`;
  while (normalizedExisting.has(candidate.toLowerCase())) {
    suffix += 1;
    candidate = `${safeBase.slice(0, 68)} ${suffix}.aerocel.json`;
  }
  return candidate;
}

export function isLegacyExampleProject(project: {
  readonly name: string;
  readonly revision: string;
}): boolean {
  return project.name === "Kestrel — Reference Concept" && project.revision === "Baseline";
}
