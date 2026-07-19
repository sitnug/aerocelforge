import { Line, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import type { AerocelProject, VehicleComponent } from "@aerocel/simulation-schema";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";

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
  readonly options: ViewportOptions;
  readonly cgBodyM: readonly [number, number, number];
  readonly slipstreamRadiusM: number;
}

const bodyToScene = (position: readonly [number, number, number]): [number, number, number] => [
  position[0],
  -position[2],
  position[1]
];

function taperedPrism(
  lengthX: number,
  spanZ: number,
  tipRatio: number,
  thicknessY: number
): THREE.BufferGeometry {
  const rootHalf = lengthX / 2;
  const tipHalf = (lengthX * tipRatio) / 2;
  const halfThickness = thicknessY / 2;
  const vertices = new Float32Array([
    -rootHalf,
    -halfThickness,
    -spanZ / 2,
    rootHalf,
    -halfThickness,
    -spanZ / 2,
    -tipHalf,
    -halfThickness,
    spanZ / 2,
    tipHalf,
    -halfThickness,
    spanZ / 2,
    -rootHalf,
    halfThickness,
    -spanZ / 2,
    rootHalf,
    halfThickness,
    -spanZ / 2,
    -tipHalf,
    halfThickness,
    spanZ / 2,
    tipHalf,
    halfThickness,
    spanZ / 2
  ]);
  const indices = [
    0, 1, 3, 0, 3, 2, 4, 7, 5, 4, 6, 7, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5,
    7, 1, 7, 3
  ];
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

function Selectable({
  component,
  selected,
  onSelect,
  children,
  position,
  rotation
}: SelectableProps) {
  const [hovered, setHovered] = useState(false);
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
  explodedOffset
}: {
  readonly component: VehicleComponent;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
  readonly explodedOffset: number;
}) {
  const isHorizontalTail = component.type === "horizontal_stabilizer";
  const isWing = component.type === "wing";
  const dimensions = component.geometry.boundingBoxM;
  const geometry = useMemo(
    () =>
      taperedPrism(
        dimensions[0],
        dimensions[1],
        isWing ? 0.56 : 0.68,
        Math.max(0.02, dimensions[2])
      ),
    [dimensions, isWing]
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  const bodyPosition = [...component.transform.translationM] as [number, number, number];
  if (component.type === "wing") bodyPosition[1] += Math.sign(bodyPosition[1]) * explodedOffset;
  const position = bodyToScene(bodyPosition);
  const rotation: [number, number, number] = isHorizontalTail ? [0, 0, 0] : [0, 0, 0];
  return (
    <Selectable
      component={component}
      selected={selected}
      onSelect={onSelect}
      position={position}
      rotation={rotation}
    >
      <mesh
        geometry={geometry}
        castShadow
        receiveShadow
        rotation={[0, component.transform.rotationRad[0], 0]}
      >
        <meshStandardMaterial
          color={selected ? "#77f2d2" : component.visual.color}
          roughness={0.54}
          metalness={0.08}
          emissive={selected ? "#123f35" : "#000000"}
        />
      </mesh>
    </Selectable>
  );
}

function ComponentMesh({
  component,
  selected,
  onSelect,
  tiltRad,
  options
}: {
  readonly component: VehicleComponent;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
  readonly tiltRad: number;
  readonly options: ViewportOptions;
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
  if (component.type === "wing" || component.type === "horizontal_stabilizer") {
    return (
      <SurfaceMesh
        component={component}
        selected={selected}
        onSelect={onSelect}
        explodedOffset={options.exploded ? 0.18 : 0}
      />
    );
  }
  if (component.type === "vertical_stabilizer") {
    return (
      <Selectable
        component={component}
        selected={selected}
        onSelect={onSelect}
        position={[x, y + 0.11, z]}
      >
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <coneGeometry args={[0.19, 0.34, 3]} />
          {commonMaterial}
        </mesh>
      </Selectable>
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

function Scene({ project, selectedId, onSelect, options, cgBodyM }: AircraftViewportProps) {
  const motorTilt = new Map(
    project.vehicle.joints.map((joint) => [joint.childComponentId, joint.actualRad] as const)
  );
  const propellerTilt = new Map(
    project.vehicle.components
      .filter((component) => component.type === "propeller" && component.parentId !== null)
      .map((component) => [component.id, motorTilt.get(component.parentId as string) ?? 0] as const)
  );
  return (
    <>
      <color attach="background" args={["#101714"]} />
      <fog attach="fog" args={["#101714", 6.5, 11]} />
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
        <gridHelper args={[12, 48, "#315349", "#1c2b27"]} position={[0, -0.45, 0]} />
      )}
      {options.showAxes && <axesHelper args={[0.55]} position={[-1.4, -0.4, 1.1]} />}
      <group rotation={[0, -0.13, 0]}>
        {project.vehicle.components
          .filter((component) => component.visible)
          .map((component) => (
            <ComponentMesh
              key={component.id}
              component={component}
              selected={selectedId === component.id}
              onSelect={onSelect}
              tiltRad={motorTilt.get(component.id) ?? propellerTilt.get(component.id) ?? 0}
              options={options}
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
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.07}
        minDistance={1.7}
        maxDistance={8}
      />
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
          : { position: [3.5, 2.4, 4.2], fov: 34, near: 0.01, far: 100 }
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
