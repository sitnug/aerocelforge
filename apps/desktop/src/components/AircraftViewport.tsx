import { Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import type { AerocelProject, VehicleComponent } from "@aerocel/simulation-schema";
import type { TriangleMesh } from "@aerocel/geometry-core";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { halfSurfaceSpanDirection } from "../lib/aircraftPresentation";

export interface ViewportOptions {
  readonly orthographic: boolean;
  readonly showGrid: boolean;
  readonly showAxes: boolean;
  readonly showCg: boolean;
  readonly showThrust: boolean;
  readonly showSlipstream: boolean;
  readonly exploded: boolean;
}

interface AircraftViewportProps {
  readonly project: AerocelProject;
  readonly selectedId: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly onPartContextMenu?: (id: string, clientX: number, clientY: number) => void;
  readonly options: ViewportOptions;
  readonly cgBodyM: readonly [number, number, number];
  readonly slipstreamRadiusM: number;
  readonly geometryAssets?: ReadonlyMap<string, TriangleMesh>;
  readonly flightPose?: FlightViewportPose;
  readonly motorTiltRad?: number;
  readonly controlSurfaceDeflections?: ReadonlyMap<string, number>;
}

export interface FlightViewportPose {
  readonly positionNedM: readonly [number, number, number];
  readonly attitudeBodyToNed: readonly [number, number, number, number];
  readonly trailNedM: readonly (readonly [number, number, number])[];
}

const bodyToScene = (position: readonly [number, number, number]): [number, number, number] => [
  position[0],
  -position[2],
  position[1]
];

const attitudeToSceneQuaternion = (
  attitudeBodyToNed: readonly [number, number, number, number]
): [number, number, number, number] => {
  const [w, x, y, z] = attitudeBodyToNed;
  return [x, -z, y, w];
};

function FlightCameraRig({ pose }: { readonly pose: FlightViewportPose }) {
  const { camera } = useThree();
  const desiredPosition = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const sceneQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const localOffset = useMemo(() => new THREE.Vector3(-5.2, 2.4, 4.2), []);
  const localLookAhead = useMemo(() => new THREE.Vector3(1.5, 0.15, 0), []);
  const vehiclePosition = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    const position = bodyToScene(pose.positionNedM);
    const [qx, qy, qz, qw] = attitudeToSceneQuaternion(pose.attitudeBodyToNed);
    sceneQuaternion.set(qx, qy, qz, qw);
    desiredPosition.copy(localOffset).applyQuaternion(sceneQuaternion);
    vehiclePosition.set(...position);
    desiredPosition.add(vehiclePosition);
    lookTarget.copy(localLookAhead).applyQuaternion(sceneQuaternion);
    lookTarget.add(vehiclePosition);
    camera.position.lerp(desiredPosition, 1 - Math.exp(-delta * 3.5));
    camera.lookAt(lookTarget);
  });
  return null;
}

function taperedPrism(
  lengthX: number,
  spanZ: number,
  tipRatio: number,
  thicknessY: number,
  spanDirection: 1 | -1 = 1,
  tipOffsetX = 0
): THREE.BufferGeometry {
  const rootHalf = lengthX / 2;
  const tipHalf = (lengthX * tipRatio) / 2;
  const halfThickness = thicknessY / 2;
  const rootZ = (-spanZ / 2) * spanDirection;
  const tipZ = (spanZ / 2) * spanDirection;
  const vertices = new Float32Array([
    -rootHalf,
    -halfThickness,
    rootZ,
    rootHalf,
    -halfThickness,
    rootZ,
    -tipHalf + tipOffsetX,
    -halfThickness,
    tipZ,
    tipHalf + tipOffsetX,
    -halfThickness,
    tipZ,
    -rootHalf,
    halfThickness,
    rootZ,
    rootHalf,
    halfThickness,
    rootZ,
    -tipHalf + tipOffsetX,
    halfThickness,
    tipZ,
    tipHalf + tipOffsetX,
    halfThickness,
    tipZ
  ]);
  const baseIndices = [
    0, 1, 3, 0, 3, 2, 4, 7, 5, 4, 6, 7, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5,
    7, 1, 7, 3
  ];
  const indices =
    spanDirection === 1
      ? baseIndices
      : baseIndices.flatMap((value, index, values) =>
          index % 3 === 0 ? [value, values[index + 2] ?? value, values[index + 1] ?? value] : []
        );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

interface SelectableProps {
  readonly component: VehicleComponent;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
  readonly children: React.ReactNode;
  readonly position?: [number, number, number];
  readonly rotation?: [number, number, number];
}

const PartContextMenuContext = createContext<
  ((id: string, clientX: number, clientY: number) => void) | undefined
>(undefined);

function Selectable({
  component,
  selected,
  onSelect,
  children,
  position,
  rotation
}: SelectableProps) {
  const [hovered, setHovered] = useState(false);
  const onPartContextMenu = useContext(PartContextMenuContext);
  useEffect(() => {
    if (hovered) document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "default";
    };
  }, [hovered]);
  const handleClick = (event: ThreeEvent<MouseEvent>): void => {
    event.stopPropagation();
    onSelect(component.id);
  };
  return (
    <group
      {...(position === undefined ? {} : { position })}
      {...(rotation === undefined ? {} : { rotation })}
      onClick={handleClick}
      onContextMenu={(event) => {
        if (onPartContextMenu === undefined) return;
        event.stopPropagation();
        event.nativeEvent.preventDefault();
        onSelect(component.id);
        onPartContextMenu(component.id, event.nativeEvent.clientX, event.nativeEvent.clientY);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      scale={selected ? 1.018 : hovered ? 1.008 : 1}
    >
      {children}
      {selected && <pointLight color="#55e8c3" intensity={0.45} distance={0.6} />}
    </group>
  );
}

function SurfaceMesh({
  component,
  selected,
  onSelect,
  explodedOffset,
  deflectionRad
}: {
  readonly component: VehicleComponent;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
  readonly explodedOffset: number;
  readonly deflectionRad: number;
}) {
  const isVertical = component.type === "vertical_stabilizer" || component.type === "rudder";
  const isHalfSurface =
    component.type === "wing" || Math.abs(component.transform.translationM[1]) > 0.08;
  const dimensions = component.geometry.boundingBoxM;
  const centerBodyYM = component.transform.translationM[1];
  const geometries = useMemo(() => {
    const thickness = Math.max(0.02, dimensions[2]);
    if (isVertical) {
      const geometry = taperedPrism(
        dimensions[0],
        Math.max(dimensions[2], 0.01),
        0.62,
        Math.max(dimensions[1], 0.012),
        1,
        -dimensions[0] * 0.1
      );
      geometry.rotateX(Math.PI / 2);
      return [geometry];
    }
    if (!isHalfSurface) {
      return [
        taperedPrism(dimensions[0], dimensions[1] / 2, 0.64, thickness, -1, -0.025),
        taperedPrism(dimensions[0], dimensions[1] / 2, 0.64, thickness, 1, -0.025)
      ].map((geometry, index) =>
        geometry.translate(0, 0, index === 0 ? -dimensions[1] / 4 : dimensions[1] / 4)
      );
    }
    const spanDirection = halfSurfaceSpanDirection(centerBodyYM);
    return [
      taperedPrism(
        dimensions[0],
        dimensions[1],
        0.56,
        thickness,
        spanDirection,
        -dimensions[0] * 0.12
      )
    ];
  }, [centerBodyYM, dimensions, isHalfSurface, isVertical]);
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);
  const bodyPosition = [...component.transform.translationM] as [number, number, number];
  if (component.type === "wing") bodyPosition[1] += Math.sign(bodyPosition[1]) * explodedOffset;
  const position = bodyToScene(bodyPosition);
  const [roll, pitch, yaw] = component.transform.rotationRad;
  const rotation: [number, number, number] = isVertical
    ? [roll, -yaw - deflectionRad, pitch]
    : [roll, -yaw, pitch + deflectionRad];
  return (
    <Selectable
      component={component}
      selected={selected}
      onSelect={onSelect}
      position={position}
      rotation={rotation}
    >
      {geometries.map((geometry, index) => (
        <mesh key={index} geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial
            color={selected ? "#77f2d2" : component.visual.color}
            roughness={0.54}
            metalness={0.08}
            transparent={component.visual.opacity < 1}
            opacity={component.visual.opacity}
            emissive={selected ? "#123f35" : "#000000"}
          />
        </mesh>
      ))}
    </Selectable>
  );
}

function ImportedComponentMesh({
  component,
  mesh,
  selected,
  onSelect
}: {
  readonly component: VehicleComponent;
  readonly mesh: TriangleMesh | null;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
}) {
  const geometry = useMemo(() => {
    if (mesh === null) return null;
    const converted = new Float32Array(mesh.vertices.length * 3);
    mesh.vertices.forEach((vertex, index) => {
      const scene = bodyToScene(vertex);
      converted[index * 3] = scene[0];
      converted[index * 3 + 1] = scene[1];
      converted[index * 3 + 2] = scene[2];
    });
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(converted, 3));
    buffer.setIndex(mesh.faces.flatMap((face) => [...face]));
    buffer.computeVertexNormals();
    return buffer;
  }, [mesh]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  const position = bodyToScene(component.transform.translationM);
  const [roll, pitch, yaw] = component.transform.rotationRad;
  const [scaleX, scaleY, scaleZ] = component.transform.scale;
  return (
    <group position={position} rotation={[roll, -yaw, pitch]} scale={[scaleX, scaleZ, scaleY]}>
      <Selectable component={component} selected={selected} onSelect={onSelect}>
        {geometry === null ? (
          <mesh castShadow receiveShadow>
            <boxGeometry
              args={[
                Math.max(component.geometry.boundingBoxM[0], 0.01),
                Math.max(component.geometry.boundingBoxM[2], 0.01),
                Math.max(component.geometry.boundingBoxM[1], 0.01)
              ]}
            />
            <meshBasicMaterial color="#ffb45b" wireframe transparent opacity={0.72} />
          </mesh>
        ) : (
          <mesh geometry={geometry} castShadow receiveShadow>
            <meshStandardMaterial
              color={selected ? "#77f2d2" : component.visual.color}
              roughness={0.52}
              metalness={0.06}
              side={THREE.DoubleSide}
              transparent={component.visual.opacity < 1}
              opacity={component.visual.opacity}
              emissive={selected ? "#123f35" : "#000000"}
            />
          </mesh>
        )}
      </Selectable>
    </group>
  );
}

function ComponentMesh({
  component,
  selected,
  onSelect,
  tiltRad,
  options,
  importedMesh,
  controlDeflectionRad
}: {
  readonly component: VehicleComponent;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
  readonly tiltRad: number;
  readonly options: ViewportOptions;
  readonly importedMesh: TriangleMesh | null;
  readonly controlDeflectionRad: number;
}) {
  const [x, y, z] = bodyToScene(component.transform.translationM);
  const commonMaterial = (
    <meshStandardMaterial
      color={selected ? "#77f2d2" : component.visual.color}
      roughness={0.48}
      metalness={component.type === "motor" ? 0.62 : 0.08}
      transparent={component.visual.opacity < 1}
      opacity={component.visual.opacity}
      emissive={selected ? "#123f35" : "#000000"}
      side={THREE.DoubleSide}
    />
  );

  if (component.geometry.kind === "mesh") {
    return (
      <ImportedComponentMesh
        component={component}
        mesh={importedMesh}
        selected={selected}
        onSelect={onSelect}
      />
    );
  }

  if (component.type === "fuselage") {
    return (
      <Selectable
        component={component}
        selected={selected}
        onSelect={onSelect}
        position={[x, y, z]}
      >
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <capsuleGeometry args={[0.14, 1.14, 12, 32]} />
          {commonMaterial}
        </mesh>
        <mesh position={[0.62, -0.015, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
          <coneGeometry args={[0.14, 0.3, 32]} />
          {commonMaterial}
        </mesh>
      </Selectable>
    );
  }
  if (
    [
      "wing",
      "horizontal_stabilizer",
      "vertical_stabilizer",
      "canard",
      "control_surface",
      "flap",
      "aileron",
      "elevator",
      "rudder",
      "elevon",
      "flaperon",
      "spoiler",
      "air_brake"
    ].includes(component.type)
  ) {
    return (
      <SurfaceMesh
        component={component}
        selected={selected}
        onSelect={onSelect}
        explodedOffset={options.exploded ? 0.18 : 0}
        deflectionRad={controlDeflectionRad}
      />
    );
  }
  if (component.type === "motor") {
    return (
      <Selectable
        component={component}
        selected={selected}
        onSelect={onSelect}
        position={[x, y, z]}
        rotation={[0, 0, tiltRad]}
      >
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.05, 0.065, 0.15, 24]} />
          {commonMaterial}
        </mesh>
        {options.showThrust && (
          <group position={[-0.2, 0, 0]}>
            <Line
              points={[
                [0, 0, 0],
                [-0.48, 0, 0]
              ]}
              color="#ffb45b"
              lineWidth={2.1}
            />
            <mesh position={[-0.5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <coneGeometry args={[0.035, 0.11, 12]} />
              <meshBasicMaterial color="#ffb45b" />
            </mesh>
          </group>
        )}
        {options.showSlipstream && (
          <mesh position={[-0.44, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.13, 0.2, 0.8, 28, 1, true]} />
            <meshBasicMaterial
              color="#44dcb7"
              transparent
              opacity={0.07}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        )}
      </Selectable>
    );
  }
  if (component.type === "propeller") {
    const parentMotor = component.parentId;
    const propTilt = parentMotor === null ? 0 : tiltRad;
    return (
      <Selectable
        component={component}
        selected={selected}
        onSelect={onSelect}
        position={[x, y, z]}
        rotation={[0, 0, propTilt]}
      >
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <circleGeometry
            args={[((component.properties.diameterM as number | undefined) ?? 0.43) / 2, 48]}
          />
          <meshBasicMaterial
            color={selected ? "#8affe0" : component.visual.color}
            transparent
            opacity={selected ? 0.28 : 0.11}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry
            args={[
              0.018,
              0.012,
              ((component.properties.diameterM as number | undefined) ?? 0.43) * 0.94
            ]}
          />
          <meshStandardMaterial color="#60736d" roughness={0.45} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.035, 18]} />
          <meshStandardMaterial color="#15211f" metalness={0.6} roughness={0.32} />
        </mesh>
      </Selectable>
    );
  }
  if (component.type === "battery" || component.type === "payload") {
    const dimensions = component.geometry.boundingBoxM;
    return (
      <Selectable
        component={component}
        selected={selected}
        onSelect={onSelect}
        position={[x, y, z]}
      >
        <mesh castShadow>
          <boxGeometry args={[dimensions[0], dimensions[2], dimensions[1]]} />
          {commonMaterial}
        </mesh>
      </Selectable>
    );
  }
  return null;
}

function Scene({
  project,
  selectedId,
  onSelect,
  options,
  cgBodyM,
  geometryAssets,
  flightPose,
  motorTiltRad,
  controlSurfaceDeflections,
  onPartContextMenu
}: AircraftViewportProps) {
  const motorTilt = new Map(
    project.vehicle.joints.map((joint) => [joint.childComponentId, joint.actualRad] as const)
  );
  const propellerTilt = new Map(
    project.vehicle.components
      .filter((component) => component.type === "propeller" && component.parentId !== null)
      .map((component) => [component.id, motorTilt.get(component.parentId as string) ?? 0] as const)
  );
  const vehiclePosition =
    flightPose === undefined ? ([0, 0, 0] as const) : bodyToScene(flightPose.positionNedM);
  const vehicleQuaternion =
    flightPose === undefined ? undefined : attitudeToSceneQuaternion(flightPose.attitudeBodyToNed);
  return (
    <>
      <color attach="background" args={["#101714"]} />
      <fog
        attach="fog"
        args={["#101714", flightPose === undefined ? 6.5 : 90, flightPose === undefined ? 11 : 360]}
      />
      <ambientLight intensity={0.7} />
      <hemisphereLight color="#d8fff3" groundColor="#0b100f" intensity={1.1} />
      <directionalLight
        position={[3, 5, 4]}
        intensity={2.4}
        color="#f0fff9"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#65a8ff" />
      {options.showGrid && (
        <gridHelper
          args={
            flightPose === undefined
              ? [12, 48, "#315349", "#1c2b27"]
              : [400, 80, "#315349", "#1c2b27"]
          }
          position={flightPose === undefined ? [0, -0.45, 0] : [0, 0, 0]}
        />
      )}
      {options.showAxes && flightPose === undefined && (
        <axesHelper args={[0.55]} position={[-1.4, -0.4, 1.1]} />
      )}
      {flightPose !== undefined && flightPose.trailNedM.length > 1 && (
        <Line
          points={flightPose.trailNedM.map(bodyToScene)}
          color="#55e8c3"
          lineWidth={1.5}
          transparent
          opacity={0.7}
        />
      )}
      <PartContextMenuContext.Provider value={onPartContextMenu}>
        <group
          position={vehiclePosition}
          {...(vehicleQuaternion === undefined
            ? { rotation: [0, -0.13, 0] as [number, number, number] }
            : { quaternion: vehicleQuaternion })}
        >
          {project.vehicle.components
            .filter((component) => component.visible)
            .map((component) => (
              <ComponentMesh
                key={component.id}
                component={component}
                selected={selectedId === component.id}
                onSelect={onSelect}
                tiltRad={
                  motorTiltRad ??
                  motorTilt.get(component.id) ??
                  propellerTilt.get(component.id) ??
                  0
                }
                options={options}
                importedMesh={
                  component.geometry.sourceSha256 === null
                    ? null
                    : (geometryAssets?.get(component.geometry.sourceSha256) ?? null)
                }
                controlDeflectionRad={controlSurfaceDeflections?.get(component.id) ?? 0}
              />
            ))}
          {options.showCg && (
            <group position={bodyToScene(cgBodyM)}>
              <mesh>
                <sphereGeometry args={[0.055, 20, 20]} />
                <meshBasicMaterial color="#ffbe59" depthTest={false} />
              </mesh>
              <Line
                points={[
                  [-0.16, 0, 0],
                  [0.16, 0, 0]
                ]}
                color="#ffbe59"
                lineWidth={1.4}
              />
              <Line
                points={[
                  [0, -0.16, 0],
                  [0, 0.16, 0]
                ]}
                color="#ffbe59"
                lineWidth={1.4}
              />
              <Line
                points={[
                  [0, 0, -0.16],
                  [0, 0, 0.16]
                ]}
                color="#ffbe59"
                lineWidth={1.4}
              />
            </group>
          )}
        </group>
      </PartContextMenuContext.Provider>
      {flightPose === undefined ? (
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.07}
          minDistance={1.7}
          maxDistance={8}
        />
      ) : (
        <FlightCameraRig pose={flightPose} />
      )}
    </>
  );
}

export function AircraftViewport(props: AircraftViewportProps) {
  return (
    <Canvas
      key={props.options.orthographic ? "ortho" : "perspective"}
      orthographic={props.options.orthographic}
      camera={
        props.options.orthographic
          ? { position: [3.5, 2.4, 4.2], zoom: 170, near: 0.01, far: 100 }
          : {
              position: [3.5, 2.4, 4.2],
              fov: props.flightPose === undefined ? 34 : 46,
              near: 0.01,
              far: props.flightPose === undefined ? 100 : 1_000
            }
      }
      dpr={[1, 2]}
      shadows="basic"
      gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
      onPointerMissed={() => props.onSelect(null)}
    >
      <Scene {...props} />
    </Canvas>
  );
}
