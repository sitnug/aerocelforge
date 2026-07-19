import {
  inspectTriangleMesh,
  type MeshInspection,
  type TriangleMesh
} from "@aerocel/geometry-core";
import * as THREE from "three";

export type GeometryImportFormat =
  | "auto"
  | "step"
  | "iges"
  | "stl"
  | "obj"
  | "gltf"
  | "ply"
  | "dae"
  | "3mf"
  | "vsp3"
  | "urdf"
  | "sdf"
  | "dxf"
  | "dat"
  | "csv";

export type GeometryUnit = "mm" | "cm" | "m" | "in" | "ft";

export interface GeometryFormatDefinition {
  readonly id: Exclude<GeometryImportFormat, "auto">;
  readonly label: string;
  readonly extensions: readonly string[];
  readonly mode: "local_mesh" | "external_adapter" | "section_data";
  readonly capability: string;
  readonly description: string;
}

export const GEOMETRY_FORMATS: readonly GeometryFormatDefinition[] = [
  {
    id: "step",
    label: "STEP / STP · editable B-rep",
    extensions: ["step", "stp"],
    mode: "external_adapter",
    capability: "OpenCascade geometry service",
    description: "Preserves solids, faces, and CAD topology through the B-rep adapter."
  },
  {
    id: "iges",
    label: "IGES / IGS · B-rep or surfaces",
    extensions: ["iges", "igs"],
    mode: "external_adapter",
    capability: "OpenCascade geometry service",
    description: "Imports trimmed surfaces or solids through the B-rep adapter."
  },
  {
    id: "stl",
    label: "STL · triangle mesh",
    extensions: ["stl"],
    mode: "local_mesh",
    capability: "Built in",
    description: "ASCII and binary STL with topology, scale, area, and volume inspection."
  },
  {
    id: "obj",
    label: "OBJ · polygon mesh",
    extensions: ["obj"],
    mode: "local_mesh",
    capability: "Built in",
    description: "Triangulates polygon faces and supports positive or relative indices."
  },
  {
    id: "gltf",
    label: "glTF / GLB · scene mesh",
    extensions: ["gltf", "glb"],
    mode: "local_mesh",
    capability: "Built in · embedded resources only",
    description: "Applies scene transforms; external URLs are rejected for untrusted imports."
  },
  {
    id: "ply",
    label: "PLY · point or triangle mesh",
    extensions: ["ply"],
    mode: "local_mesh",
    capability: "Built in",
    description: "Reads common ASCII and binary PLY triangle geometry."
  },
  {
    id: "dae",
    label: "COLLADA / DAE · scene mesh",
    extensions: ["dae"],
    mode: "local_mesh",
    capability: "Built in · embedded geometry only",
    description: "Applies COLLADA scene transforms; external textures and references are rejected."
  },
  {
    id: "3mf",
    label: "3MF · packaged manufacturing mesh",
    extensions: ["3mf"],
    mode: "external_adapter",
    capability: "Sandboxed archive adapter",
    description: "Requires an isolated archive reader with decompression limits."
  },
  {
    id: "vsp3",
    label: "OpenVSP VSP3 · parametric vehicle",
    extensions: ["vsp3"],
    mode: "external_adapter",
    capability: "OpenVSP service",
    description: "Uses OpenVSP itself so parametric geometry is not flattened silently."
  },
  {
    id: "urdf",
    label: "URDF · articulated assembly",
    extensions: ["urdf"],
    mode: "external_adapter",
    capability: "Robotics assembly adapter",
    description: "Requires related mesh assets and explicit ROS package resolution."
  },
  {
    id: "sdf",
    label: "SDF · simulation assembly",
    extensions: ["sdf"],
    mode: "external_adapter",
    capability: "Gazebo model adapter",
    description: "Requires related model assets and versioned SDF interpretation."
  },
  {
    id: "dxf",
    label: "DXF · section curves",
    extensions: ["dxf"],
    mode: "external_adapter",
    capability: "DXF section adapter",
    description: "Imports explicit section layers and curves after unit confirmation."
  },
  {
    id: "dat",
    label: "DAT · airfoil coordinates",
    extensions: ["dat"],
    mode: "section_data",
    capability: "Built in · section inspection",
    description: "Inspects two-dimensional airfoil coordinates; it is not a 3D component mesh."
  },
  {
    id: "csv",
    label: "CSV · section coordinates",
    extensions: ["csv"],
    mode: "section_data",
    capability: "Built in · section inspection",
    description: "Inspects the first two numeric columns as section coordinates."
  }
];

export interface GeometryImportOptions {
  readonly requestedFormat: GeometryImportFormat;
  readonly originalUnits: GeometryUnit;
}

export interface ImportedGeometryInspection {
  readonly fileName: string;
  readonly format: string;
  readonly formatId: Exclude<GeometryImportFormat, "auto"> | null;
  readonly sizeBytes: number;
  readonly sourceSha256: string;
  readonly inspection: MeshInspection | null;
  readonly mesh: TriangleMesh | null;
  readonly status: "inspected" | "adapter_required" | "section_only" | "unsupported";
  readonly explanation: string;
  readonly warnings: readonly string[];
}

const UNIT_SCALE_M: Readonly<Record<GeometryUnit, number>> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  in: 0.0254,
  ft: 0.3048
};
export const MAX_LOCAL_FILE_BYTES = 25 * 1024 * 1024;
const MAX_LOCAL_TRIANGLES = 1_000_000;

export function formatDefinition(
  format: Exclude<GeometryImportFormat, "auto">
): GeometryFormatDefinition {
  const definition = GEOMETRY_FORMATS.find((candidate) => candidate.id === format);
  if (definition === undefined) throw new Error(`Unknown geometry format: ${format}`);
  return definition;
}

export function detectGeometryFormat(fileName: string): GeometryFormatDefinition | null {
  const extension = fileName.split(".").at(-1)?.toLowerCase() ?? "";
  return GEOMETRY_FORMATS.find((candidate) => candidate.extensions.includes(extension)) ?? null;
}

export function acceptForGeometryFormat(format: GeometryImportFormat): string {
  const definitions = format === "auto" ? GEOMETRY_FORMATS : [formatDefinition(format)];
  return definitions
    .flatMap((definition) => definition.extensions.map((item) => `.${item}`))
    .join(",");
}

function assertLocalComplexity(triangleCount: number): void {
  if (triangleCount > MAX_LOCAL_TRIANGLES) {
    throw new Error(
      `Mesh contains ${triangleCount.toLocaleString()} triangles; the local inspection limit is ${MAX_LOCAL_TRIANGLES.toLocaleString()}. Use the isolated geometry service for larger assets.`
    );
  }
}

function parseAsciiStl(content: string): TriangleMesh {
  const vertices: [number, number, number][] = [];
  const faces: [number, number, number][] = [];
  const map = new Map<string, number>();
  const triangle: number[] = [];
  for (const match of content.matchAll(/\bvertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/gu)) {
    const vertex: [number, number, number] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (vertex.some((value) => !Number.isFinite(value))) {
      throw new Error("STL contains an invalid vertex");
    }
    const key = vertex.join(",");
    let index = map.get(key);
    if (index === undefined) {
      index = vertices.length;
      vertices.push(vertex);
      map.set(key, index);
    }
    triangle.push(index);
    if (triangle.length === 3) {
      faces.push(triangle.splice(0, 3) as [number, number, number]);
      assertLocalComplexity(faces.length);
    }
  }
  if (faces.length === 0) throw new Error("No ASCII STL triangles were found");
  return { vertices, faces };
}

function looksLikeBinaryStl(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 84) return false;
  const triangleCount = new DataView(buffer).getUint32(80, true);
  return 84 + triangleCount * 50 === buffer.byteLength;
}

function parseBinaryStl(buffer: ArrayBuffer): TriangleMesh {
  const view = new DataView(buffer);
  if (buffer.byteLength < 84) throw new Error("Binary STL is shorter than its header");
  const triangleCount = view.getUint32(80, true);
  assertLocalComplexity(triangleCount);
  if (84 + triangleCount * 50 !== buffer.byteLength) {
    throw new Error("Binary STL length does not match its triangle count");
  }
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
      if (vertex.some((value) => !Number.isFinite(value))) {
        throw new Error("Binary STL contains a non-finite vertex");
      }
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
      if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
        throw new Error("OBJ contains an invalid vertex");
      }
      vertices.push(values as [number, number, number]);
    } else if (line.startsWith("f ")) {
      const indices = line
        .slice(2)
        .trim()
        .split(/\s+/u)
        .map((token) => Number(token.split("/")[0]))
        .map((index) => (index < 0 ? vertices.length + index : index - 1));
      if (
        indices.length < 3 ||
        indices.some((index) => !Number.isInteger(index) || index < 0 || index >= vertices.length)
      ) {
        throw new Error("OBJ contains an invalid or unsupported face index");
      }
      for (let index = 1; index < indices.length - 1; index += 1) {
        faces.push([indices[0] as number, indices[index] as number, indices[index + 1] as number]);
        assertLocalComplexity(faces.length);
      }
    }
  }
  if (vertices.length === 0 || faces.length === 0) {
    throw new Error("OBJ contains no usable triangle geometry");
  }
  return { vertices, faces };
}

function addGeometryToMesh(
  geometry: THREE.BufferGeometry,
  transform: THREE.Matrix4,
  vertices: [number, number, number][],
  faces: [number, number, number][],
  vertexMap: Map<string, number>
): void {
  const positions = geometry.getAttribute("position");
  if (!(positions instanceof THREE.BufferAttribute)) return;
  const index = geometry.getIndex();
  const cornerCount = index?.count ?? positions.count;
  const triangleCount = Math.floor(cornerCount / 3);
  assertLocalComplexity(faces.length + triangleCount);
  const mapCorner = (corner: number): number => {
    const sourceIndex = index?.getX(corner) ?? corner;
    const point = new THREE.Vector3(
      positions.getX(sourceIndex),
      positions.getY(sourceIndex),
      positions.getZ(sourceIndex)
    ).applyMatrix4(transform);
    const key = [point.x, point.y, point.z].map((value) => value.toPrecision(10)).join(",");
    let targetIndex = vertexMap.get(key);
    if (targetIndex === undefined) {
      targetIndex = vertices.length;
      vertices.push([point.x, point.y, point.z]);
      vertexMap.set(key, targetIndex);
    }
    return targetIndex;
  };
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    faces.push([mapCorner(triangle * 3), mapCorner(triangle * 3 + 1), mapCorner(triangle * 3 + 2)]);
  }
}

function objectToTriangleMesh(root: THREE.Object3D): TriangleMesh {
  const vertices: [number, number, number][] = [];
  const faces: [number, number, number][] = [];
  const vertexMap = new Map<string, number>();
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) {
      throw new Error("Skinned glTF meshes must be baked to static geometry before import");
    }
    if (object instanceof THREE.Mesh) {
      const geometry: unknown = object.geometry;
      if (!(geometry instanceof THREE.BufferGeometry)) {
        throw new Error("Scene mesh does not expose supported buffer geometry");
      }
      addGeometryToMesh(
        geometry as THREE.BufferGeometry,
        object.matrixWorld,
        vertices,
        faces,
        vertexMap
      );
    }
  });
  if (faces.length === 0) throw new Error("Scene contains no triangle mesh geometry");
  return { vertices, faces };
}

function bufferGeometryToTriangleMesh(geometry: THREE.BufferGeometry): TriangleMesh {
  const vertices: [number, number, number][] = [];
  const faces: [number, number, number][] = [];
  addGeometryToMesh(geometry, new THREE.Matrix4(), vertices, faces, new Map());
  if (faces.length === 0) throw new Error("File contains no triangle mesh geometry");
  return { vertices, faces };
}

function rejectExternalGltfResources(content: string): void {
  const parsed = JSON.parse(content) as {
    readonly buffers?: readonly { readonly uri?: string }[];
    readonly images?: readonly { readonly uri?: string }[];
  };
  const uris = [...(parsed.buffers ?? []), ...(parsed.images ?? [])]
    .map((item) => item.uri)
    .filter((uri): uri is string => uri !== undefined);
  if (uris.some((uri) => !uri.startsWith("data:"))) {
    throw new Error(
      "This glTF references external files or URLs. Use a self-contained GLB or embed all resources before importing untrusted geometry."
    );
  }
}

async function parseGltf(buffer: ArrayBuffer, extension: string): Promise<TriangleMesh> {
  if (extension === "gltf") {
    rejectExternalGltfResources(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
  } else {
    const view = new DataView(buffer);
    if (
      buffer.byteLength < 20 ||
      view.getUint32(0, true) !== 0x46546c67 ||
      view.getUint32(8, true) !== buffer.byteLength
    ) {
      throw new Error("GLB header is invalid");
    }
    const jsonLength = view.getUint32(12, true);
    const jsonType = view.getUint32(16, true);
    if (jsonType !== 0x4e4f534a || 20 + jsonLength > buffer.byteLength) {
      throw new Error("GLB JSON chunk is invalid");
    }
    rejectExternalGltfResources(
      new TextDecoder("utf-8", { fatal: true }).decode(buffer.slice(20, 20 + jsonLength))
    );
  }
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const gltf = await new Promise<{ readonly scene: THREE.Group }>((resolve, reject) => {
    new GLTFLoader().parse(buffer, "", resolve, reject);
  });
  return objectToTriangleMesh(gltf.scene);
}

async function parsePly(buffer: ArrayBuffer): Promise<TriangleMesh> {
  const { PLYLoader } = await import("three/examples/jsm/loaders/PLYLoader.js");
  const geometry = new PLYLoader().parse(buffer);
  try {
    return bufferGeometryToTriangleMesh(geometry);
  } finally {
    geometry.dispose();
  }
}

async function parseDae(buffer: ArrayBuffer): Promise<TriangleMesh> {
  const content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  if (/<(?:init_from|ref)>\s*(?!data:)[^<#\s][^<]*</iu.test(content)) {
    throw new Error(
      "This COLLADA file contains an external asset reference. Embed or remove external assets before importing untrusted geometry."
    );
  }
  const { ColladaLoader } = await import("three/examples/jsm/loaders/ColladaLoader.js");
  const parsed = new ColladaLoader().parse(content, "");
  if (parsed === null) throw new Error("COLLADA parser returned no scene");
  return objectToTriangleMesh(parsed.scene);
}

function parseSectionCoordinates(content: string, csv: boolean): TriangleMesh {
  const outline: [number, number, number][] = [];
  for (const rawLine of content.split(/\r?\n/u)) {
    const cleaned = rawLine.trim();
    if (cleaned === "" || cleaned.startsWith("#") || cleaned.startsWith("//")) continue;
    const values = (csv ? cleaned.split(",") : cleaned.split(/\s+/u)).slice(0, 2).map(Number);
    if (values.length === 2 && values.every(Number.isFinite)) {
      outline.push([values[0] as number, values[1] as number, 0]);
    }
  }
  if (outline.length < 3) throw new Error("Section file contains fewer than three coordinate rows");
  const centroid: [number, number, number] = [
    outline.reduce((sum, point) => sum + point[0], 0) / outline.length,
    outline.reduce((sum, point) => sum + point[1], 0) / outline.length,
    0
  ];
  const vertices = [...outline, centroid];
  const faces: [number, number, number][] = [];
  const centerIndex = vertices.length - 1;
  for (let index = 0; index < outline.length; index += 1) {
    faces.push([centerIndex, index, (index + 1) % outline.length]);
  }
  return { vertices, faces };
}

function scaleMesh(mesh: TriangleMesh, scaleM: number): TriangleMesh {
  return {
    vertices: mesh.vertices.map((vertex) => [
      vertex[0] * scaleM,
      vertex[1] * scaleM,
      vertex[2] * scaleM
    ]),
    faces: mesh.faces
  };
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function parseLocalMesh(
  definition: GeometryFormatDefinition,
  extension: string,
  buffer: ArrayBuffer
): Promise<TriangleMesh> {
  switch (definition.id) {
    case "stl":
      return looksLikeBinaryStl(buffer)
        ? parseBinaryStl(buffer)
        : parseAsciiStl(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
    case "obj":
      return parseObj(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
    case "gltf":
      return parseGltf(buffer, extension);
    case "ply":
      return parsePly(buffer);
    case "dae":
      return parseDae(buffer);
    default:
      throw new Error(`No local mesh parser is registered for ${definition.label}`);
  }
}

export async function inspectGeometryFile(
  file: File,
  options: GeometryImportOptions = { requestedFormat: "auto", originalUnits: "m" }
): Promise<ImportedGeometryInspection> {
  if (file.size === 0) throw new Error("The selected file is empty");
  if (file.size > MAX_LOCAL_FILE_BYTES) {
    throw new Error(
      `The selected file is ${(file.size / 1024 / 1024).toFixed(1)} MB; local imports are limited to ${MAX_LOCAL_FILE_BYTES / 1024 / 1024} MB.`
    );
  }
  const detected = detectGeometryFormat(file.name);
  if (detected === null) {
    const buffer = await file.arrayBuffer();
    return {
      fileName: file.name,
      format: "Unknown",
      formatId: null,
      sizeBytes: file.size,
      sourceSha256: await sha256(buffer),
      inspection: null,
      mesh: null,
      status: "unsupported",
      explanation: "The file extension does not match a registered geometry or section format.",
      warnings: []
    };
  }
  if (options.requestedFormat !== "auto" && detected.id !== options.requestedFormat) {
    throw new Error(
      `The selected file is ${detected.label}, but the import type is ${formatDefinition(options.requestedFormat).label}. Change the type or choose a matching file.`
    );
  }
  const buffer = await file.arrayBuffer();
  const sourceSha256 = await sha256(buffer);
  if (detected.mode === "external_adapter") {
    return {
      fileName: file.name,
      format: detected.label,
      formatId: detected.id,
      sizeBytes: file.size,
      sourceSha256,
      inspection: null,
      mesh: null,
      status: "adapter_required",
      explanation: `${detected.capability} is required. The source hash was recorded, but no geometry was converted or approximated.`,
      warnings: [detected.description]
    };
  }
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  const rawMesh =
    detected.mode === "section_data"
      ? parseSectionCoordinates(
          new TextDecoder("utf-8", { fatal: true }).decode(buffer),
          detected.id === "csv"
        )
      : await parseLocalMesh(detected, extension, buffer);
  const mesh = scaleMesh(rawMesh, UNIT_SCALE_M[options.originalUnits]);
  const inspection = inspectTriangleMesh(mesh);
  const sectionOnly = detected.mode === "section_data";
  return {
    fileName: file.name,
    format: detected.label,
    formatId: detected.id,
    sizeBytes: file.size,
    sourceSha256,
    inspection,
    mesh,
    status: sectionOnly ? "section_only" : "inspected",
    explanation: sectionOnly
      ? "Coordinate section inspected locally. Assign it in Rapid Aero; it cannot be added as a volumetric component."
      : `${detected.label} inspected locally after applying ${options.originalUnits} → metre scaling.`,
    warnings: [
      detected.description,
      "Confirm the bounding box and coordinate orientation before committing this source to the assembly."
    ]
  };
}
