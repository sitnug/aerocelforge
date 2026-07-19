import {
  inspectTriangleMesh,
  type MeshInspection,
  type TriangleMesh
} from "@aerocel/geometry-core";

export interface ImportedGeometryInspection {
  readonly fileName: string;
  readonly format: string;
  readonly sizeBytes: number;
  readonly inspection: MeshInspection | null;
  readonly status: "inspected" | "adapter_required" | "unsupported";
  readonly explanation: string;
}

function parseAsciiStl(content: string): TriangleMesh {
  const vertices: [number, number, number][] = [];
  const faces: [number, number, number][] = [];
  const map = new Map<string, number>();
  const triangle: number[] = [];
  for (const match of content.matchAll(/\bvertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/gu)) {
    const vertex: [number, number, number] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (vertex.some((value) => !Number.isFinite(value)))
      throw new Error("STL contains an invalid vertex");
    const key = vertex.join(",");
    let index = map.get(key);
    if (index === undefined) {
      index = vertices.length;
      vertices.push(vertex);
      map.set(key, index);
    }
    triangle.push(index);
    if (triangle.length === 3) faces.push(triangle.splice(0, 3) as [number, number, number]);
  }
  if (faces.length === 0) throw new Error("No ASCII STL triangles were found");
  return { vertices, faces };
}

function parseBinaryStl(buffer: ArrayBuffer): TriangleMesh {
  const view = new DataView(buffer);
  if (buffer.byteLength < 84) throw new Error("Binary STL is shorter than its header");
  const triangleCount = view.getUint32(80, true);
  if (84 + triangleCount * 50 !== buffer.byteLength)
    throw new Error("Binary STL length does not match its triangle count");
  const vertices: [number, number, number][] = [];
  const faces: [number, number, number][] = [];
  const map = new Map<string, number>();
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const face: number[] = [];
    const offset = 84 + triangleIndex * 50 + 12;
    for (let vertexIndex = 0; vertexIndex < 3; vertexIndex += 1) {
      const vertexOffset = offset + vertexIndex * 12;
      const vertex: [number, number, number] = [
        view.getFloat32(vertexOffset, true),
        view.getFloat32(vertexOffset + 4, true),
        view.getFloat32(vertexOffset + 8, true)
      ];
      const key = vertex.map((value) => value.toPrecision(9)).join(",");
      let index = map.get(key);
      if (index === undefined) {
        index = vertices.length;
        vertices.push(vertex);
        map.set(key, index);
      }
      face.push(index);
    }
    faces.push(face as [number, number, number]);
  }
  return { vertices, faces };
}

function parseObj(content: string): TriangleMesh {
  const vertices: [number, number, number][] = [];
  const faces: [number, number, number][] = [];
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.startsWith("v ")) {
      const values = line.slice(2).trim().split(/\s+/u).slice(0, 3).map(Number);
      if (values.length !== 3 || values.some((value) => !Number.isFinite(value)))
        throw new Error("OBJ contains an invalid vertex");
      vertices.push(values as [number, number, number]);
    } else if (line.startsWith("f ")) {
      const indices = line
        .slice(2)
        .trim()
        .split(/\s+/u)
        .map((token) => Number(token.split("/")[0]) - 1);
      if (indices.length < 3 || indices.some((index) => !Number.isInteger(index) || index < 0))
        throw new Error("OBJ contains an unsupported face");
      for (let index = 1; index < indices.length - 1; index += 1) {
        faces.push([indices[0] as number, indices[index] as number, indices[index + 1] as number]);
      }
    }
  }
  if (vertices.length === 0 || faces.length === 0)
    throw new Error("OBJ contains no usable geometry");
  return { vertices, faces };
}

export async function inspectGeometryFile(file: File): Promise<ImportedGeometryInspection> {
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (["step", "stp", "iges", "igs"].includes(extension)) {
    return {
      fileName: file.name,
      format: extension.toUpperCase(),
      sizeBytes: file.size,
      inspection: null,
      status: "adapter_required",
      explanation:
        "B-rep import requires the OpenCASCADE geometry service. The untouched source file has not been modified."
    };
  }
  if (extension === "stl") {
    const buffer = await file.arrayBuffer();
    const header = new TextDecoder().decode(buffer.slice(0, Math.min(buffer.byteLength, 256)));
    const mesh = header.trimStart().startsWith("solid")
      ? parseAsciiStl(new TextDecoder().decode(buffer))
      : parseBinaryStl(buffer);
    return {
      fileName: file.name,
      format: "STL",
      sizeBytes: file.size,
      inspection: inspectTriangleMesh(mesh),
      status: "inspected",
      explanation:
        "Tessellated mesh inspected locally. STL is not editable B-rep CAD and carries no reliable unit metadata."
    };
  }
  if (extension === "obj") {
    const inspection = inspectTriangleMesh(parseObj(await file.text()));
    return {
      fileName: file.name,
      format: "OBJ",
      sizeBytes: file.size,
      inspection,
      status: "inspected",
      explanation:
        "Triangulated OBJ topology inspected locally. Confirm units and scale before adding it to a vehicle."
    };
  }
  return {
    fileName: file.name,
    format: extension.toUpperCase() || "Unknown",
    sizeBytes: file.size,
    inspection: null,
    status: "unsupported",
    explanation:
      "This foundation build preserves the file choice but has no verified importer for this format yet."
  };
}
