import type { Matrix3, Vector3 } from "@aerocel/math-core";
import { add3, cross3, dot3, magnitude3, scale3, subtract3 } from "@aerocel/math-core";

export interface TriangleMesh {
  readonly vertices: readonly Vector3[];
  readonly faces: readonly (readonly [number, number, number])[];
}

export interface MeshInspection {
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly boundingBoxM: Vector3;
  readonly surfaceAreaM2: number;
  readonly signedVolumeM3: number;
  readonly volumeM3: number;
  readonly openEdgeCount: number;
  readonly nonManifoldEdgeCount: number;
  readonly duplicateFaceCount: number;
  readonly degenerateFaceCount: number;
  readonly normalsLikelyInverted: boolean;
  readonly watertight: boolean;
  readonly status: "pass" | "warning" | "fatal";
  readonly notes: readonly string[];
}

function edgeKey(left: number, right: number): string {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function faceKey(face: readonly [number, number, number]): string {
  return [...face].sort((left, right) => left - right).join(":");
}

export function inspectTriangleMesh(mesh: TriangleMesh): MeshInspection {
  if (mesh.vertices.length === 0 || mesh.faces.length === 0) {
    throw new Error("Mesh inspection requires vertices and triangular faces");
  }

  const minimum: [number, number, number] = [Infinity, Infinity, Infinity];
  const maximum: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const vertex of mesh.vertices) {
    for (const axis of [0, 1, 2] as const) {
      const coordinate = vertex[axis];
      if (!Number.isFinite(coordinate)) {
        throw new Error("Mesh contains a non-finite vertex coordinate");
      }
      minimum[axis] = Math.min(minimum[axis], coordinate);
      maximum[axis] = Math.max(maximum[axis], coordinate);
    }
  }

  const edgeCounts = new Map<string, number>();
  const seenFaces = new Set<string>();
  let duplicateFaceCount = 0;
  let degenerateFaceCount = 0;
  let surfaceAreaM2 = 0;
  let signedVolumeM3 = 0;

  for (const face of mesh.faces) {
    if (face.some((index) => index < 0 || index >= mesh.vertices.length)) {
      throw new Error("Mesh face references an invalid vertex index");
    }
    const key = faceKey(face);
    if (seenFaces.has(key)) duplicateFaceCount += 1;
    seenFaces.add(key);

    const a = mesh.vertices[face[0]];
    const b = mesh.vertices[face[1]];
    const c = mesh.vertices[face[2]];
    if (a === undefined || b === undefined || c === undefined) {
      throw new Error("Mesh face references an unavailable vertex");
    }
    const normal = cross3(subtract3(b, a), subtract3(c, a));
    const area = magnitude3(normal) / 2;
    if (area <= 1e-14) degenerateFaceCount += 1;
    surfaceAreaM2 += area;
    signedVolumeM3 += dot3(a, cross3(b, c)) / 6;

    const edges = [edgeKey(face[0], face[1]), edgeKey(face[1], face[2]), edgeKey(face[2], face[0])];
    for (const edge of edges) edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
  }

  const counts = [...edgeCounts.values()];
  const openEdgeCount = counts.filter((count) => count === 1).length;
  const nonManifoldEdgeCount = counts.filter((count) => count > 2).length;
  const watertight = openEdgeCount === 0 && nonManifoldEdgeCount === 0;
  const notes: string[] = [];
  if (openEdgeCount > 0) notes.push(`${openEdgeCount} open edges detected`);
  if (nonManifoldEdgeCount > 0) notes.push(`${nonManifoldEdgeCount} non-manifold edges detected`);
  if (duplicateFaceCount > 0) notes.push(`${duplicateFaceCount} duplicate faces detected`);
  if (degenerateFaceCount > 0) notes.push(`${degenerateFaceCount} degenerate faces detected`);
  if (signedVolumeM3 < 0)
    notes.push("Signed volume is negative; surface normals are likely inverted");

  return {
    vertexCount: mesh.vertices.length,
    triangleCount: mesh.faces.length,
    boundingBoxM: [maximum[0] - minimum[0], maximum[1] - minimum[1], maximum[2] - minimum[2]],
    surfaceAreaM2,
    signedVolumeM3,
    volumeM3: Math.abs(signedVolumeM3),
    openEdgeCount,
    nonManifoldEdgeCount,
    duplicateFaceCount,
    degenerateFaceCount,
    normalsLikelyInverted: signedVolumeM3 < 0,
    watertight,
    status:
      nonManifoldEdgeCount > 0 || degenerateFaceCount > 0
        ? "fatal"
        : watertight
          ? "pass"
          : "warning",
    notes
  };
}

export interface ComponentMass {
  readonly id: string;
  readonly massKg: number;
  readonly positionM: Vector3;
  readonly inertiaAtCgKgM2: Matrix3;
  readonly uncertaintyKg: number;
}

export interface CombinedMassProperties {
  readonly massKg: number;
  readonly centerOfGravityM: Vector3;
  readonly inertiaAtCgKgM2: Matrix3;
  readonly rssMassUncertaintyKg: number;
  readonly componentCount: number;
}

export function combineMassProperties(
  components: readonly ComponentMass[]
): CombinedMassProperties {
  const active = components.filter((component) => component.massKg > 0);
  const massKg = active.reduce((sum, component) => sum + component.massKg, 0);
  if (massKg <= 0) throw new Error("At least one positive component mass is required");

  const weighted = active.reduce<Vector3>(
    (sum, component) => add3(sum, scale3(component.positionM, component.massKg)),
    [0, 0, 0]
  );
  const centerOfGravityM = scale3(weighted, 1 / massKg);
  const inertia = [0, 0, 0, 0, 0, 0, 0, 0, 0];

  for (const component of active) {
    const [x, y, z] = subtract3(component.positionM, centerOfGravityM);
    const parallelAxis = [
      y * y + z * z,
      -x * y,
      -x * z,
      -x * y,
      x * x + z * z,
      -y * z,
      -x * z,
      -y * z,
      x * x + y * y
    ];
    for (let index = 0; index < 9; index += 1) {
      inertia[index] =
        (inertia[index] ?? 0) +
        (component.inertiaAtCgKgM2[index] ?? 0) +
        component.massKg * (parallelAxis[index] ?? 0);
    }
  }

  return {
    massKg,
    centerOfGravityM,
    inertiaAtCgKgM2: inertia as unknown as Matrix3,
    rssMassUncertaintyKg: Math.sqrt(
      active.reduce((sum, component) => sum + component.uncertaintyKg ** 2, 0)
    ),
    componentCount: active.length
  };
}

export interface CantileverBeamInput {
  readonly lengthM: number;
  readonly endLoadN: number;
  readonly elasticModulusPa: number;
  readonly secondMomentM4: number;
  readonly outerFiberM: number;
}

export interface CantileverBeamResult {
  readonly rootMomentNm: number;
  readonly rootBendingStressPa: number;
  readonly tipDeflectionM: number;
  readonly fidelity: "preliminary_beam";
}

export function estimateCantileverBeam(input: CantileverBeamInput): CantileverBeamResult {
  if (
    input.lengthM <= 0 ||
    input.elasticModulusPa <= 0 ||
    input.secondMomentM4 <= 0 ||
    input.outerFiberM <= 0
  ) {
    throw new Error("Beam geometry and material properties must be positive");
  }
  const rootMomentNm = input.endLoadN * input.lengthM;
  return {
    rootMomentNm,
    rootBendingStressPa: (rootMomentNm * input.outerFiberM) / input.secondMomentM4,
    tipDeflectionM:
      (input.endLoadN * input.lengthM ** 3) / (3 * input.elasticModulusPa * input.secondMomentM4),
    fidelity: "preliminary_beam"
  };
}
