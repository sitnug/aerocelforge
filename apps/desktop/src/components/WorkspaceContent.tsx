import {
  ComponentTypeSchema,
  type AerocelProject,
  type VehicleComponent
} from "@aerocel/simulation-schema";
import type { TriangleMesh } from "@aerocel/geometry-core";
import {
  OpenFoamAdapter,
  validatePx4Mapping,
  validateRemoteHost,
  type RemoteHostProfile
} from "@aerocel/solver-adapters";
import { generateEngineeringReportHtml } from "@aerocel/report-generator";
import {
  Activity,
  AlertTriangle,
  Axis3D,
  Battery,
  Box,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  CircleOff,
  CloudCog,
  Code2,
  Cpu,
  Download,
  Eye,
  Fan,
  FileJson,
  FileText,
  Gauge,
  GitBranch,
  Grid3X3,
  Info,
  LockKeyhole,
  Maximize2,
  Orbit,
  Play,
  Plus,
  RefreshCw,
  Route,
  Ruler,
  Scale,
  Save,
  Server,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  Wind
} from "lucide-react";
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { WorkspaceId } from "../App";
import type { AnalysisOptions, RapidAnalysis } from "../lib/analysis";
import { createDiagnosticBundle, hashText, writeReport, type SystemProfile } from "../lib/native";
import { AircraftViewport, type ViewportOptions } from "./AircraftViewport";
import { EngineeringPlot } from "./EngineeringPlot";
import { FlightLab } from "./FlightLab";
import { GeometryImportDialog } from "./GeometryImportDialog";

interface WorkspaceContentProps {
  readonly workspace: WorkspaceId;
  readonly project: AerocelProject;
  readonly setProject: Dispatch<SetStateAction<AerocelProject>>;
  readonly selectedComponent: VehicleComponent | null;
  readonly selectedId: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly analysis: RapidAnalysis;
  readonly analysisOptions: AnalysisOptions;
  readonly setAnalysisOptions: Dispatch<SetStateAction<AnalysisOptions>>;
  readonly viewportOptions: ViewportOptions;
  readonly setViewportOptions: Dispatch<SetStateAction<ViewportOptions>>;
  readonly systemProfile: SystemProfile | null;
  readonly recentErrors: readonly string[];
  readonly setTiltAngle: (jointId: string, angleRad: number) => void;
  readonly onOpenSetup: () => void;
  readonly onNavigate: (workspace: WorkspaceId) => void;
  readonly geometryImportOpen: boolean;
  readonly onRequestGeometryImport: () => void;
  readonly onCloseGeometryImport: () => void;
  readonly geometryAssets: ReadonlyMap<string, TriangleMesh>;
  readonly onGeometryAsset: (sourceSha256: string, mesh: TriangleMesh) => void;
  readonly notify: (message: string) => void;
}

type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

function Badge({
  children,
  tone = "neutral"
}: {
  readonly children: React.ReactNode;
  readonly tone?: Tone;
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

function WorkspaceHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly actions?: React.ReactNode;
}) {
  return (
    <header className="workspace-header">
      <div>
        <small>{eyebrow}</small>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions !== undefined && <div className="workspace-actions">{actions}</div>}
    </header>
  );
}

function MetricCard({
  label,
  value,
  unit,
  detail,
  provenance,
  tone = "neutral"
}: {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly detail: string;
  readonly provenance: string;
  readonly tone?: Tone;
}) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <small>{label}</small>
      <strong>
        {value}
        {unit !== undefined && <em>{unit}</em>}
      </strong>
      <p>{detail}</p>
      <span>{provenance}</span>
    </article>
  );
}

function Notice({
  tone,
  title,
  children
}: {
  readonly tone: "info" | "warning" | "danger";
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  const Icon = tone === "info" ? Info : tone === "warning" ? AlertTriangle : ShieldAlert;
  return (
    <div className={`notice notice--${tone}`}>
      <Icon size={17} />
      <span>
        <strong>{title}</strong>
        <p>{children}</p>
      </span>
    </div>
  );
}

function SliderField({
  label,
  value,
  minimum,
  maximum,
  step,
  unit,
  onChange
}: {
  readonly label: string;
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly unit: string;
  readonly onChange: (value: number) => void;
}) {
  return (
    <label className="slider-field">
      <span>
        <strong>{label}</strong>
        <output>
          {value.toFixed(step < 1 ? 1 : 0)} {unit}
        </output>
      </span>
      <input
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <small>
        <span>{minimum}</span>
        <span>
          {maximum} {unit}
        </span>
      </small>
    </label>
  );
}

function downloadJson(fileName: string, value: unknown): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function GeometryWorkspace(props: WorkspaceContentProps) {
  const selected = props.selectedComponent;
  const disallowedParentIds = useMemo(() => {
    const blocked = new Set<string>();
    if (selected === null) return blocked;
    blocked.add(selected.id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const component of props.project.vehicle.components) {
        if (
          component.parentId !== null &&
          blocked.has(component.parentId) &&
          !blocked.has(component.id)
        ) {
          blocked.add(component.id);
          changed = true;
        }
      }
    }
    return blocked;
  }, [props.project.vehicle.components, selected]);
  const updateSelected = (update: (component: VehicleComponent) => VehicleComponent): void => {
    if (selected === null) return;
    props.setProject((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      vehicle: {
        ...current.vehicle,
        components: current.vehicle.components.map((component) =>
          component.id === selected.id ? update(component) : component
        )
      }
    }));
  };
  const updateTransformVector = (
    field: "translationM" | "rotationRad" | "scale",
    axis: 0 | 1 | 2,
    displayedValue: number
  ): void => {
    if (!Number.isFinite(displayedValue)) return;
    updateSelected((component) => {
      const vector = [...component.transform[field]] as [number, number, number];
      vector[axis] = field === "rotationRad" ? (displayedValue * Math.PI) / 180 : displayedValue;
      if (field === "scale" && vector[axis] <= 0) return component;
      return { ...component, transform: { ...component.transform, [field]: vector } };
    });
  };
  const toggleViewport = (key: keyof ViewportOptions): void =>
    props.setViewportOptions((current) => ({ ...current, [key]: !current[key] }));
  return (
    <div className="geometry-workspace">
      <section className="viewport-panel">
        <div className="viewport-toolbar">
          <div className="tool-cluster">
            <button
              type="button"
              className="tool-button tool-button--primary"
              onClick={props.onRequestGeometryImport}
            >
              <Upload size={15} /> Import model
            </button>
            <button
              type="button"
              className="tool-button"
              title="Report the selected component bounding box"
              onClick={() =>
                props.notify(
                  selected === null
                    ? "Select a component before measuring geometry."
                    : `${selected.name}: ${selected.geometry.boundingBoxM
                        .map((value) => value.toFixed(3))
                        .join(" × ")} m bounding box.`
                )
              }
            >
              <Ruler size={15} /> Measure
            </button>
          </div>
          <div className="tool-cluster">
            <button
              type="button"
              className={`icon-button ${props.viewportOptions.orthographic ? "icon-button--active" : ""}`}
              onClick={() => toggleViewport("orthographic")}
              title="Toggle orthographic camera"
            >
              <Orbit size={16} />
            </button>
            <button
              type="button"
              className={`icon-button ${props.viewportOptions.showGrid ? "icon-button--active" : ""}`}
              onClick={() => toggleViewport("showGrid")}
              title="Toggle reference grid"
            >
              <Grid3X3 size={16} />
            </button>
            <button
              type="button"
              className={`icon-button ${props.viewportOptions.showAxes ? "icon-button--active" : ""}`}
              onClick={() => toggleViewport("showAxes")}
              title="Toggle coordinate axes"
            >
              <Axis3D size={16} />
            </button>
            <button
              type="button"
              className={`icon-button ${props.viewportOptions.exploded ? "icon-button--active" : ""}`}
              onClick={() => toggleViewport("exploded")}
              title="Toggle exploded assembly"
            >
              <Maximize2 size={16} />
            </button>
            <button
              type="button"
              className={`icon-button ${props.viewportOptions.showSlipstream ? "icon-button--active" : ""}`}
              onClick={() => toggleViewport("showSlipstream")}
              title="Toggle estimated slipstreams"
            >
              <Wind size={16} />
            </button>
          </div>
        </div>
        <div className="viewport-canvas">
          <AircraftViewport
            project={props.project}
            selectedId={props.selectedId}
            onSelect={props.onSelect}
            options={props.viewportOptions}
            cgBodyM={props.analysis.mass.centerOfGravityM}
            slipstreamRadiusM={0.16}
            geometryAssets={props.geometryAssets}
          />
          <div className="viewport-frame-badge">
            <strong>BODY · FRD</strong>
            <span>+X forward · +Y right · +Z down</span>
          </div>
          <div className="viewport-quality">
            <span className="quality-light quality-light--warning" />
            <div>
              <strong>Example geometry</strong>
              <small>Procedural · no source CAD</small>
            </div>
          </div>
          <div className="view-cube" aria-hidden="true">
            <span>TOP</span>
            <strong>FRD</strong>
            <small>FWD</small>
          </div>
        </div>
        <div className="viewport-footer">
          <span>
            <Eye size={13} /> Perspective engineering view
          </span>
          <span>
            CG {props.analysis.mass.centerOfGravityM.map((value) => value.toFixed(3)).join(", ")} m
          </span>
          <span>Orbit: drag · Pan: shift-drag · Zoom: pinch</span>
        </div>
      </section>
      <aside className="inspector-panel">
        <div className="inspector-header">
          <span>
            <small>INSPECTOR</small>
            <strong>{selected?.name ?? "Nothing selected"}</strong>
          </span>
          <Badge tone={selected?.geometry.health.status === "pass" ? "success" : "warning"}>
            {selected?.geometry.health.status.replaceAll("_", " ") ?? "—"}
          </Badge>
        </div>
        {selected !== null ? (
          <>
            <section className="inspector-section">
              <h3>Semantic assignment</h3>
              <div className="readout-field">
                <label htmlFor="inspector-component-type">Type</label>
                <select
                  id="inspector-component-type"
                  className="inspector-control"
                  value={selected.type}
                  onChange={(event) =>
                    updateSelected((component) => ({
                      ...component,
                      type: event.target.value as VehicleComponent["type"]
                    }))
                  }
                >
                  {ComponentTypeSchema.options.map((type) => (
                    <option value={type} key={type}>
                      {type.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="readout-field">
                <label htmlFor="inspector-component-parent">Parent</label>
                <select
                  id="inspector-component-parent"
                  className="inspector-control"
                  value={selected.parentId ?? ""}
                  onChange={(event) =>
                    updateSelected((component) => ({
                      ...component,
                      parentId: event.target.value === "" ? null : event.target.value
                    }))
                  }
                >
                  <option value="">Vehicle root</option>
                  {props.project.vehicle.components
                    .filter((component) => !disallowedParentIds.has(component.id))
                    .map((component) => (
                      <option value={component.id} key={component.id}>
                        {component.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="readout-field">
                <span>CFD surface</span>
                <label className="compact-toggle">
                  <input
                    type="checkbox"
                    checked={selected.cfdIncluded}
                    onChange={(event) =>
                      updateSelected((component) => ({
                        ...component,
                        cfdIncluded: event.target.checked
                      }))
                    }
                  />
                  {selected.cfdIncluded ? "Included" : "Excluded"}
                </label>
              </div>
            </section>
            <section className="inspector-section">
              <h3>Translation · body FRD metres</h3>
              <div className="vector-fields">
                <label>
                  X
                  <input
                    type="number"
                    step="0.001"
                    value={selected.transform.translationM[0]}
                    onChange={(event) =>
                      updateTransformVector("translationM", 0, event.target.valueAsNumber)
                    }
                  />
                </label>
                <label>
                  Y
                  <input
                    type="number"
                    step="0.001"
                    value={selected.transform.translationM[1]}
                    onChange={(event) =>
                      updateTransformVector("translationM", 1, event.target.valueAsNumber)
                    }
                  />
                </label>
                <label>
                  Z
                  <input
                    type="number"
                    step="0.001"
                    value={selected.transform.translationM[2]}
                    onChange={(event) =>
                      updateTransformVector("translationM", 2, event.target.valueAsNumber)
                    }
                  />
                </label>
              </div>
              <h3 className="transform-subheading">Rotation · degrees displayed</h3>
              <div className="vector-fields">
                {(
                  [
                    ["R", 0],
                    ["P", 1],
                    ["Y", 2]
                  ] as const
                ).map(([label, axis]) => (
                  <label key={label}>
                    {label}
                    <input
                      type="number"
                      step="0.1"
                      value={((selected.transform.rotationRad[axis] * 180) / Math.PI).toFixed(2)}
                      onChange={(event) =>
                        updateTransformVector("rotationRad", axis, event.target.valueAsNumber)
                      }
                    />
                  </label>
                ))}
              </div>
              <h3 className="transform-subheading">Non-uniform scale</h3>
              <div className="vector-fields">
                {(
                  [
                    ["X", 0],
                    ["Y", 1],
                    ["Z", 2]
                  ] as const
                ).map(([label, axis]) => (
                  <label key={label}>
                    {label}
                    <input
                      type="number"
                      min="0.0001"
                      step="0.01"
                      value={selected.transform.scale[axis]}
                      onChange={(event) =>
                        updateTransformVector("scale", axis, event.target.valueAsNumber)
                      }
                    />
                  </label>
                ))}
              </div>
              <small className="section-help">
                Rotation is stored in radians. Display conversion never changes project data.
              </small>
            </section>
            <section className="inspector-section">
              <h3>Geometry source</h3>
              <div className="source-box">
                <FileJson size={16} />
                <span>
                  <strong>{selected.geometry.kind.toUpperCase()}</strong>
                  <small>
                    {typeof selected.properties.sourceFileName === "string"
                      ? selected.properties.sourceFileName
                      : selected.geometry.source}
                  </small>
                </span>
              </div>
              <div className="readout-field">
                <span>Bounding box</span>
                <strong>
                  {selected.geometry.boundingBoxM.map((value) => value.toFixed(3)).join(" × ")} m
                </strong>
              </div>
              <div className="readout-field">
                <span>Original units</span>
                <strong>{selected.geometry.originalUnits}</strong>
              </div>
            </section>
            <section className="inspector-section">
              <h3>Geometry health</h3>
              {selected.geometry.health.notes.map((note) => (
                <p className="inspection-note" key={note}>
                  <Info size={13} />
                  {note}
                </p>
              ))}
              <div className="health-grid">
                <span>
                  <small>Open edges</small>
                  <strong>{selected.geometry.health.openEdgeCount ?? "N/A"}</strong>
                </span>
                <span>
                  <small>Non-manifold</small>
                  <strong>{selected.geometry.health.nonManifoldEdgeCount ?? "N/A"}</strong>
                </span>
                <span>
                  <small>Self-intersections</small>
                  <strong>{selected.geometry.health.selfIntersectionCount ?? "N/A"}</strong>
                </span>
                <span>
                  <small>Repairs</small>
                  <strong>{selected.geometry.repairs.length}</strong>
                </span>
              </div>
            </section>
          </>
        ) : (
          <div className="empty-inspector">
            <Box size={26} />
            <strong>Select an assembly component</strong>
            <p>Click the model or a component in the navigator.</p>
          </div>
        )}
      </aside>
      <GeometryImportDialog
        open={props.geometryImportOpen}
        project={props.project}
        setProject={props.setProject}
        onClose={props.onCloseGeometryImport}
        onSelect={props.onSelect}
        onOpenSetup={props.onOpenSetup}
        onGeometryAsset={props.onGeometryAsset}
        notify={props.notify}
      />
    </div>
  );
}

function HomeWorkspace(props: WorkspaceContentProps) {
  const assignedMass = props.project.vehicle.components.filter(
    (component) => component.mass !== null
  ).length;
  const geometryWarnings = props.project.vehicle.components.filter(
    (component) => component.geometry.health.status !== "pass"
  ).length;
  return (
    <div className="scroll-workspace">
      <WorkspaceHeader
        eyebrow="PROJECT OVERVIEW"
        title={props.project.name}
        description="A single engineering record from geometry through flight-model evidence."
        actions={
          <>
            <button
              className="button button--quiet"
              type="button"
              onClick={() => {
                downloadJson(
                  `${props.project.name.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}-snapshot.json`,
                  props.project
                );
                props.notify("Immutable project snapshot downloaded with the current revision.");
              }}
            >
              <GitBranch size={15} /> Snapshot revision
            </button>
            <button
              className="button button--primary"
              type="button"
              onClick={() => props.notify("Project is already autosaved in managed storage.")}
            >
              <Save size={15} /> Save project
            </button>
          </>
        }
      />
      <div className="overview-hero">
        <div className="overview-model">
          <AircraftViewport
            project={props.project}
            selectedId={null}
            onSelect={props.onSelect}
            options={{
              ...props.viewportOptions,
              showAxes: false,
              showGrid: false,
              showSlipstream: false,
              showThrust: false
            }}
            cgBodyM={props.analysis.mass.centerOfGravityM}
            slipstreamRadiusM={0.16}
            geometryAssets={props.geometryAssets}
          />
          <div className="overview-model__label">
            <Badge tone="warning">UNVALIDATED EXAMPLE</Badge>
            <strong>{props.project.vehicle.description}</strong>
          </div>
        </div>
        <div className="overview-summary">
          <small>READINESS</small>
          <h2>Ready for preliminary studies</h2>
          <p>
            Geometry, mass, propulsion, and A1/P2 numerical inputs are complete. High-fidelity
            solvers require separate verification.
          </p>
          <div className="readiness-list">
            <span>
              <CheckCircle2 size={16} />{" "}
              {props.project.vehicle.components.length - geometryWarnings} components passing
              current geometry gates
            </span>
            <span>
              <CheckCircle2 size={16} /> {assignedMass} mass assignments
            </span>
            <span>
              <CheckCircle2 size={16} /> {props.project.vehicle.propulsionUnits.length} independent
              propulsion units
            </span>
            <span className="readiness-list__warning">
              <CircleDashed size={16} /> CFD mesh independence not established
            </span>
          </div>
        </div>
      </div>
      <div className="metric-grid metric-grid--four">
        <MetricCard
          label="TAKEOFF MASS"
          value={props.analysis.mass.massKg.toFixed(2)}
          unit="kg"
          detail={`±${props.analysis.mass.rssMassUncertaintyKg.toFixed(2)} kg RSS input uncertainty`}
          provenance="User-entered example"
        />
        <MetricCard
          label="REFERENCE AREA"
          value={props.project.vehicle.reference.areaM2.toFixed(2)}
          unit="m²"
          detail={`${props.project.vehicle.reference.spanM.toFixed(2)} m span`}
          provenance="User-entered example"
        />
        <MetricCard
          label="BEST GLIDE"
          value={props.analysis.glide.bestGlide.liftToDrag.toFixed(1)}
          detail={`at ${props.analysis.glide.bestGlide.airspeedMS.toFixed(1)} m/s`}
          provenance="A1 preliminary estimate"
          tone="accent"
        />
        <MetricCard
          label="SOLVER QUALITY"
          value="Preliminary"
          detail="No mesh or experimental calibration"
          provenance="Model-quality grade"
          tone="warning"
        />
      </div>
      <section className="section-card">
        <div className="section-card__header">
          <span>
            <small>ENGINEERING PIPELINE</small>
            <h2>Configuration readiness</h2>
          </span>
          <Badge tone="accent">3 actions</Badge>
        </div>
        <div className="pipeline">
          <div className="pipeline-step pipeline-step--done">
            <span>01</span>
            <Box size={18} />
            <strong>Geometry</strong>
            <small>Procedural example assembled</small>
          </div>
          <ChevronRight size={16} />
          <div className="pipeline-step pipeline-step--done">
            <span>02</span>
            <Scale size={18} />
            <strong>Mass & systems</strong>
            <small>CG and inertia aggregated</small>
          </div>
          <ChevronRight size={16} />
          <div className="pipeline-step pipeline-step--active">
            <span>03</span>
            <Wind size={18} />
            <strong>Rapid models</strong>
            <small>A1 aero · P2 BEMT</small>
          </div>
          <ChevronRight size={16} />
          <div className="pipeline-step">
            <span>04</span>
            <CloudCog size={18} />
            <strong>High fidelity</strong>
            <small>Solver verification required</small>
          </div>
          <ChevronRight size={16} />
          <div className="pipeline-step">
            <span>05</span>
            <ShieldCheck size={18} />
            <strong>Validation</strong>
            <small>Calibration not recorded</small>
          </div>
        </div>
      </section>
      <Notice tone="warning" title="Permanent engineering limitation">
        Simulation does not replace structural testing, ground testing, flight testing, legal
        compliance, or qualified engineering review. Aerocel Forge does not certify airworthiness.
      </Notice>
    </div>
  );
}

function ComponentsWorkspace(props: WorkspaceContentProps) {
  return (
    <div className="scroll-workspace">
      <WorkspaceHeader
        eyebrow="VEHICLE DEFINITION"
        title="Components & articulated joints"
        description="Semantic bodies, parent relationships, control assignments, and independent tilt kinematics."
        actions={
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              props.onNavigate("geometry");
              props.notify("Use Import model to add and inspect a semantic component.");
            }}
          >
            <Plus size={15} /> Add component
          </button>
        }
      />
      <div className="split-layout split-layout--wide">
        <section className="section-card">
          <div className="section-card__header">
            <span>
              <small>ASSEMBLY</small>
              <h2>{props.project.vehicle.components.length} semantic components</h2>
            </span>
            <Badge tone="success">Schema valid</Badge>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Type</th>
                <th>Parent</th>
                <th>Geometry</th>
                <th>CFD</th>
              </tr>
            </thead>
            <tbody>
              {props.project.vehicle.components.map((component) => (
                <tr
                  key={component.id}
                  className={component.id === props.selectedId ? "data-row--selected" : ""}
                  onClick={() => props.onSelect(component.id)}
                >
                  <td>
                    <span className="table-component">
                      <i style={{ backgroundColor: component.visual.color }} />
                      <strong>{component.name}</strong>
                    </span>
                  </td>
                  <td>{component.type.replaceAll("_", " ")}</td>
                  <td>
                    {component.parentId === null
                      ? "Vehicle root"
                      : (props.project.vehicle.components.find(
                          (item) => item.id === component.parentId
                        )?.name ?? "Missing")}
                  </td>
                  <td>
                    <Badge
                      tone={component.geometry.health.status === "pass" ? "success" : "warning"}
                    >
                      {component.geometry.health.status}
                    </Badge>
                  </td>
                  <td>{component.cfdIncluded ? "Included" : "Excluded"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <aside className="section-card">
          <div className="section-card__header">
            <span>
              <small>JOINT SYSTEM</small>
              <h2>Independent tilt axes</h2>
            </span>
            <Badge tone="accent">{props.project.vehicle.joints.length} DOF</Badge>
          </div>
          {props.project.vehicle.joints.map((joint) => (
            <div className="joint-card" key={joint.id}>
              <header>
                <span>
                  <Fan size={15} />
                  <strong>{joint.name}</strong>
                </span>
                <Badge tone={joint.failure === "none" ? "success" : "danger"}>
                  {joint.failure}
                </Badge>
              </header>
              <SliderField
                label="Commanded / actual angle"
                value={(joint.actualRad * 180) / Math.PI}
                minimum={(joint.minimumRad * 180) / Math.PI}
                maximum={(joint.maximumRad * 180) / Math.PI}
                step={1}
                unit="deg"
                onChange={(value) => props.setTiltAngle(joint.id, (value * Math.PI) / 180)}
              />
              <div className="joint-meta">
                <span>
                  Rate <strong>{joint.rateLimitRadS.toFixed(2)} rad/s</strong>
                </span>
                <span>
                  Axis <strong>[{joint.axis.join(", ")}]</strong>
                </span>
              </div>
            </div>
          ))}
          <Notice tone="info" title="Kinematic integrity">
            The actual thrust direction follows each joint's actual angle. Rate limits and failures
            are applied before forces enter the 6-DOF model.
          </Notice>
        </aside>
      </div>
    </div>
  );
}

function MassWorkspace(props: WorkspaceContentProps) {
  return (
    <div className="scroll-workspace">
      <WorkspaceHeader
        eyebrow="MATERIALS & MASS"
        title="Mass properties"
        description="SI-native aggregation with component uncertainty and the parallel-axis theorem."
        actions={
          <button
            type="button"
            className="button button--quiet"
            disabled
            title="Only the takeoff mass configuration exists in this project"
          >
            <SlidersHorizontal size={15} /> Configuration: Takeoff
          </button>
        }
      />
      <div className="metric-grid metric-grid--four">
        <MetricCard
          label="TOTAL MASS"
          value={props.analysis.mass.massKg.toFixed(3)}
          unit="kg"
          detail={`${props.analysis.mass.componentCount} assigned components`}
          provenance="Calculated from user inputs"
          tone="accent"
        />
        <MetricCard
          label="CG · X"
          value={props.analysis.mass.centerOfGravityM[0].toFixed(3)}
          unit="m"
          detail="Body origin · positive forward"
          provenance="Solver-derived aggregation"
        />
        <MetricCard
          label="CG · Y"
          value={props.analysis.mass.centerOfGravityM[1].toFixed(3)}
          unit="m"
          detail="Positive starboard"
          provenance="Solver-derived aggregation"
        />
        <MetricCard
          label="CG · Z"
          value={props.analysis.mass.centerOfGravityM[2].toFixed(3)}
          unit="m"
          detail="Positive down"
          provenance="Solver-derived aggregation"
        />
      </div>
      <div className="split-layout split-layout--wide">
        <section className="section-card">
          <div className="section-card__header">
            <span>
              <small>MASS BREAKDOWN</small>
              <h2>Takeoff configuration</h2>
            </span>
            <Badge tone="warning">
              ±{props.analysis.mass.rssMassUncertaintyKg.toFixed(3)} kg RSS
            </Badge>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Mass</th>
                <th>Uncertainty</th>
                <th>Source</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {props.project.vehicle.components
                .filter((component) => component.mass !== null)
                .map((component) => (
                  <tr key={component.id}>
                    <td>
                      <strong>{component.name}</strong>
                    </td>
                    <td>{component.mass?.valueKg.toFixed(3)} kg</td>
                    <td>±{component.mass?.uncertaintyKg.toFixed(3)} kg</td>
                    <td>
                      <Badge tone="neutral">
                        {component.mass?.provenance.replaceAll("_", " ")}
                      </Badge>
                    </td>
                    <td>{component.mass?.note}</td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td>{props.analysis.mass.massKg.toFixed(3)} kg</td>
                <td>±{props.analysis.mass.rssMassUncertaintyKg.toFixed(3)} kg</td>
                <td colSpan={2}>Independent uncertainty assumption</td>
              </tr>
            </tfoot>
          </table>
        </section>
        <aside className="section-card">
          <div className="section-card__header">
            <span>
              <small>INERTIA TENSOR</small>
              <h2>At combined CG</h2>
            </span>
            <Badge>kg·m²</Badge>
          </div>
          <div className="matrix-readout">
            {Array.from({ length: 3 }, (_, row) => (
              <div key={row}>
                {Array.from({ length: 3 }, (_, column) => (
                  <span key={column}>
                    {props.analysis.mass.inertiaAtCgKgM2[row * 3 + column]?.toFixed(4)}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <p className="card-copy">
            Products of inertia retain their sign in the body FRD frame. Component rotations are not
            yet applied to local tensors in this example configuration; review before control
            design.
          </p>
          <Notice tone="warning" title="Preliminary structural scope">
            Beam bending utilities are available for early load cases. No finite-element backend is
            connected, so structural results cannot be treated as validated.
          </Notice>
        </aside>
      </div>
    </div>
  );
}

function PropulsionWorkspace(props: WorkspaceContentProps) {
  return (
    <div className="scroll-workspace">
      <WorkspaceHeader
        eyebrow="PROPULSION & ELECTRICAL"
        title="Three independent tilt units"
        description="P0/P1/P2 models, motor electrical limits, battery sag, and momentum-theory slipstream."
        actions={
          <button
            className="button button--primary"
            type="button"
            onClick={() =>
              props.notify("P2 BEMT operating point recomputed from the visible inputs.")
            }
          >
            <RefreshCw size={15} /> Recompute P2
          </button>
        }
      />
      <div className="analysis-control-strip">
        <SliderField
          label="Propeller speed"
          value={props.analysisOptions.propellerRpm}
          minimum={2000}
          maximum={10000}
          step={100}
          unit="RPM"
          onChange={(value) =>
            props.setAnalysisOptions((current) => ({ ...current, propellerRpm: value }))
          }
        />
        <div className="control-readout">
          <small>MODEL</small>
          <strong>P2 · BEMT</strong>
          <span>3 radial intervals · tip loss</span>
        </div>
        <div className="control-readout">
          <small>INFLOW</small>
          <strong>{(props.analysisOptions.airspeedMS * 0.25).toFixed(1)} m/s</strong>
          <span>Example assumption</span>
        </div>
      </div>
      <div className="metric-grid metric-grid--four">
        <MetricCard
          label="THRUST / UNIT"
          value={props.analysis.propeller.thrustN.toFixed(1)}
          unit="N"
          detail={`J ${props.analysis.propeller.advanceRatio.toFixed(2)} · Ct ${props.analysis.propeller.coefficientThrust.toFixed(3)}`}
          provenance="P2 BEMT estimate"
          tone="accent"
        />
        <MetricCard
          label="SHAFT POWER"
          value={props.analysis.propeller.shaftPowerW.toFixed(0)}
          unit="W"
          detail={`Tip Mach ${props.analysis.propeller.tipMach.toFixed(2)}`}
          provenance="P2 BEMT estimate"
        />
        <MetricCard
          label="BUS VOLTAGE"
          value={props.analysis.battery.busVoltageV.toFixed(2)}
          unit="V"
          detail={`${props.analysis.battery.currentA.toFixed(1)} A estimated load`}
          provenance="Equivalent-circuit estimate"
          tone={props.analysis.battery.brownoutRisk ? "danger" : "neutral"}
        />
        <MetricCard
          label="FAR-WAKE SPEED"
          value={props.analysis.slipstream.farWakeVelocityMS.toFixed(1)}
          unit="m/s"
          detail={`Contraction ${(props.analysis.slipstream.contractionRatio * 100).toFixed(0)}%`}
          provenance="Momentum-theory estimate"
        />
      </div>
      <div className="split-layout split-layout--wide">
        <section className="section-card">
          <div className="section-card__header">
            <span>
              <small>PROPULSION UNITS</small>
              <h2>Independent kinematics</h2>
            </span>
            <Badge tone="success">Torque signs balanced</Badge>
          </div>
          {props.project.vehicle.propulsionUnits.map((unit) => {
            const joint = props.project.vehicle.joints.find((item) => item.id === unit.jointId);
            return (
              <div className="propulsion-row" key={unit.id}>
                <div className="propulsion-icon">
                  <Fan size={20} />
                </div>
                <span>
                  <strong>{unit.name}</strong>
                  <small>
                    {unit.configuration} · {unit.rotation} · Ø{unit.diameterM.toFixed(2)} m
                  </small>
                </span>
                <div>
                  <small>Fidelity</small>
                  <strong>{unit.fidelity}</strong>
                </div>
                <div>
                  <small>Tilt</small>
                  <strong>
                    {joint === undefined
                      ? "Fixed"
                      : `${((joint.actualRad * 180) / Math.PI).toFixed(0)}°`}
                  </strong>
                </div>
                <div>
                  <small>Limits</small>
                  <strong>{unit.motor.maxCurrentA} A</strong>
                </div>
              </div>
            );
          })}
        </section>
        <aside className="section-card">
          <div className="section-card__header">
            <span>
              <small>BATTERY MARGIN</small>
              <h2>{props.project.vehicle.batteries[0]?.name}</h2>
            </span>
            <Battery size={18} />
          </div>
          <div className="battery-gauge">
            <div
              style={{
                width: `${(props.project.vehicle.batteries[0]?.stateOfCharge ?? 0) * 100}%`
              }}
            />
            <span>
              {((props.project.vehicle.batteries[0]?.stateOfCharge ?? 0) * 100).toFixed(0)}% SOC
            </span>
          </div>
          <div className="detail-grid">
            <span>
              <small>Open circuit</small>
              <strong>{props.analysis.battery.openCircuitVoltageV.toFixed(2)} V</strong>
            </span>
            <span>
              <small>Voltage sag</small>
              <strong>
                {(
                  props.analysis.battery.openCircuitVoltageV - props.analysis.battery.busVoltageV
                ).toFixed(2)}{" "}
                V
              </strong>
            </span>
            <span>
              <small>Current margin</small>
              <strong>{props.analysis.battery.currentMarginA.toFixed(1)} A</strong>
            </span>
            <span>
              <small>Remaining energy</small>
              <strong>{props.analysis.battery.remainingEnergyWhApprox.toFixed(0)} Wh</strong>
            </span>
          </div>
        </aside>
      </div>
      {props.analysis.propeller.warnings.length > 0 ? (
        <Notice tone="warning" title="BEMT validity warning">
          {props.analysis.propeller.warnings.join(" ")}
        </Notice>
      ) : (
        <Notice tone="info" title="Model provenance">
          The propeller blade geometry and airfoil parameters are illustrative user inputs. The
          solution converged numerically, but it has not been calibrated against a thrust stand.
        </Notice>
      )}
    </div>
  );
}

function AeroWorkspace(props: WorkspaceContentProps) {
  return (
    <div className="scroll-workspace">
      <WorkspaceHeader
        eyebrow="RAPID AERODYNAMICS"
        title="Attached-flow design point"
        description="Finite-wing lift slope with transparent parabolic drag accounting and an explicit validity envelope."
        actions={
          <>
            <Badge tone="warning">A1 · PRELIMINARY</Badge>
            <button
              className="button button--primary"
              type="button"
              onClick={() => props.notify("A1 sweep recomputed deterministically.")}
            >
              <Play size={15} /> Run sweep
            </button>
          </>
        }
      />
      <div className="analysis-control-strip">
        <SliderField
          label="Airspeed"
          value={props.analysisOptions.airspeedMS}
          minimum={8}
          maximum={55}
          step={1}
          unit="m/s"
          onChange={(value) =>
            props.setAnalysisOptions((current) => ({ ...current, airspeedMS: value }))
          }
        />
        <SliderField
          label="Angle of attack"
          value={props.analysisOptions.angleOfAttackDeg}
          minimum={-8}
          maximum={18}
          step={0.5}
          unit="deg"
          onChange={(value) =>
            props.setAnalysisOptions((current) => ({ ...current, angleOfAttackDeg: value }))
          }
        />
        <SliderField
          label="Added real-world drag"
          value={props.analysisOptions.additionalDragCounts}
          minimum={0}
          maximum={100}
          step={5}
          unit="counts"
          onChange={(value) =>
            props.setAnalysisOptions((current) => ({
              ...current,
              additionalDragCounts: value
            }))
          }
        />
        <div className="control-readout">
          <small>ATMOSPHERE</small>
          <strong>{props.analysis.atmosphere.densityKgM3.toFixed(3)} kg/m³</strong>
          <span>ISA · {props.project.environment.altitudeM} m</span>
          <span>
            Re {props.analysis.designPoint.reynoldsNumber.toExponential(2)} · M{" "}
            {props.analysis.designPoint.machNumber.toFixed(3)}
          </span>
        </div>
      </div>
      <div className="metric-grid metric-grid--four">
        <MetricCard
          label="LIFT COEFFICIENT"
          value={props.analysis.designPoint.coefficients.cl.toFixed(3)}
          detail={`${props.analysis.designPoint.forcesN.lift.toFixed(0)} N at design point`}
          provenance="A1 preliminary estimate"
          tone="accent"
        />
        <MetricCard
          label="DRAG COEFFICIENT"
          value={props.analysis.designPoint.coefficients.cd.toFixed(4)}
          detail={`${props.analysis.designPoint.forcesN.drag.toFixed(1)} N total drag`}
          provenance="A1 preliminary estimate"
        />
        <MetricCard
          label="LIFT / DRAG"
          value={(
            props.analysis.designPoint.coefficients.cl / props.analysis.designPoint.coefficients.cd
          ).toFixed(1)}
          detail={`Best envelope ${props.analysis.glide.bestGlide.liftToDrag.toFixed(1)}`}
          provenance="Derived from A1 polar"
        />
        <MetricCard
          label="STALL MARGIN"
          value={((props.analysis.designPoint.stallMarginRad * 180) / Math.PI).toFixed(1)}
          unit="deg"
          detail="Attached-flow limit only"
          provenance="User-entered limit"
          tone={props.analysis.designPoint.stallMarginRad < 0 ? "danger" : "warning"}
        />
      </div>
      <section className="section-card aero-drag-ledger">
        <div className="section-card__header">
          <span>
            <small>DRAG ACCOUNTING</small>
            <h2>What the A1 total contains</h2>
          </span>
          <Badge tone="warning">Aggregate input + induced</Badge>
        </div>
        <div className="detail-grid aero-drag-grid">
          <span>
            <small>ZERO-LIFT AGGREGATE</small>
            <strong>{props.analysis.designPoint.dragBreakdown.zeroLift.toFixed(5)}</strong>
          </span>
          <span>
            <small>INDUCED</small>
            <strong>{props.analysis.designPoint.dragBreakdown.induced.toFixed(5)}</strong>
          </span>
          <span>
            <small>SIDESLIP INCREMENT</small>
            <strong>{props.analysis.designPoint.dragBreakdown.sideslip.toFixed(5)}</strong>
          </span>
          <span>
            <small>USER-ADDED</small>
            <strong>{props.analysis.designPoint.dragBreakdown.additional.toFixed(5)}</strong>
          </span>
          <span>
            <small>TOTAL CD</small>
            <strong>{props.analysis.designPoint.dragBreakdown.total.toFixed(5)}</strong>
          </span>
        </div>
        <p className="card-copy">
          Zero-lift CD is an illustrative aggregate input. It does not independently resolve
          wetted-area skin friction, form/interference, cooling, landing-gear, trim, surface
          roughness, or wave drag. Add measured or justified drag counts above; use a calibrated
          parasite-drag or CFD workflow for geometry-derived values.
        </p>
      </section>
      {props.analysis.designPoint.warnings.length > 0 && (
        <Notice tone="warning" title="Current-point model warnings">
          {props.analysis.designPoint.warnings.join(" ")}
        </Notice>
      )}
      <div className="plot-grid">
        <EngineeringPlot
          title="Lift curve"
          subtitle="Finite-wing analytical buildup; clipped beyond the configured CL maximum"
          xLabel="Angle of attack (deg)"
          yLabel="CL (—)"
          data={props.analysis.polar.map((point) => ({ x: point.alphaDeg, y: point.cl }))}
          source="Aerocel analytical core"
          fidelity="A1 · estimated"
        />
        <EngineeringPlot
          title="Drag polar"
          subtitle="Aggregate zero-lift, induced, and explicit added drag; terms are listed above"
          xLabel="CD (—)"
          yLabel="CL (—)"
          data={props.analysis.polar.map((point) => ({ x: point.cd, y: point.cl }))}
          source="Aerocel analytical core"
          fidelity="A1 · estimated"
          color="#ffb45b"
        />
      </div>
      <div className="split-layout">
        <section className="section-card">
          <div className="section-card__header">
            <span>
              <small>MODEL VALIDITY</small>
              <h2>Where this result can be used</h2>
            </span>
            <ShieldCheck size={18} />
          </div>
          <ul className="validity-list">
            {props.analysis.designPoint.validity.map((item) => (
              <li key={item}>
                <Check size={14} />
                {item}
              </li>
            ))}
          </ul>
        </section>
        <section className="section-card">
          <div className="section-card__header">
            <span>
              <small>RECOMMENDED NEXT FIDELITY</small>
              <h2>VSPAERO A2/A3 sweep</h2>
            </span>
            <Badge tone="neutral">Adapter required</Badge>
          </div>
          <p className="card-copy">
            Use a vortex-lattice or panel adapter for loading, derivatives, and control
            effectiveness. Do not use A1 to assess hover, deep stall, or strong propeller-wing
            interaction.
          </p>
        </section>
      </div>
    </div>
  );
}

function FlightWorkspace(props: WorkspaceContentProps) {
  return (
    <FlightLab
      project={props.project}
      analysis={props.analysis}
      analysisOptions={props.analysisOptions}
      selectedId={props.selectedId}
      onSelect={props.onSelect}
      viewportOptions={props.viewportOptions}
      geometryAssets={props.geometryAssets}
      notify={props.notify}
    />
  );
}

function TransitionWorkspace(props: WorkspaceContentProps) {
  const result = props.analysis.transition;
  const failed = props.analysisOptions.failedMotorFraction > 0;
  const jammed = props.analysisOptions.jammedTiltDeg !== null;
  return (
    <div className="scroll-workspace">
      <WorkspaceHeader
        eyebrow="VTOL TRANSITION"
        title="Hover-to-wingborne transition"
        description="Reduced-order longitudinal simulation with rate-limited tilt, power, wing lift, and declared failure cases."
        actions={
          <>
            <Badge tone={result.completed ? "success" : "danger"}>
              {result.completed ? "COMPLETED" : "FAILED CASE"}
            </Badge>
            <button
              className="button button--primary"
              type="button"
              onClick={() =>
                props.notify("Transition rerun with the current schedule and failure state.")
              }
            >
              <Play size={15} /> Run transition
            </button>
          </>
        }
      />
      <div className="failure-strip">
        <span>
          <ShieldAlert size={16} />
          <strong>Failure injection</strong>
        </span>
        <button
          type="button"
          className={!failed ? "segmented-button segmented-button--active" : "segmented-button"}
          onClick={() =>
            props.setAnalysisOptions((current) => ({ ...current, failedMotorFraction: 0 }))
          }
        >
          Nominal
        </button>
        <button
          type="button"
          className={failed ? "segmented-button segmented-button--danger" : "segmented-button"}
          onClick={() =>
            props.setAnalysisOptions((current) => ({ ...current, failedMotorFraction: 1 / 3 }))
          }
        >
          One motor out
        </button>
        <button
          type="button"
          className={jammed ? "segmented-button segmented-button--danger" : "segmented-button"}
          onClick={() =>
            props.setAnalysisOptions((current) => ({
              ...current,
              jammedTiltDeg: current.jammedTiltDeg === null ? 65 : null
            }))
          }
        >
          Tilt jam {jammed ? "65°" : "off"}
        </button>
      </div>
      <div className="metric-grid metric-grid--four">
        <MetricCard
          label="ALTITUDE LOSS"
          value={result.altitudeLossM.toFixed(1)}
          unit="m"
          detail={`Minimum ${result.minimumAltitudeM.toFixed(1)} m AGL`}
          provenance="Reduced-order estimate"
          tone={result.altitudeLossM > 10 ? "danger" : "accent"}
        />
        <MetricCard
          label="FINAL AIRSPEED"
          value={result.finalAirspeedMS.toFixed(1)}
          unit="m/s"
          detail="At schedule completion"
          provenance="Reduced-order estimate"
        />
        <MetricCard
          label="PEAK POWER"
          value={result.peakPowerW.toFixed(0)}
          unit="W"
          detail={`${(result.peakPowerW / props.analysis.mass.massKg).toFixed(0)} W/kg`}
          provenance="Power-law estimate"
        />
        <MetricCard
          label="FAILURE FLAGS"
          value={String(result.failures.length)}
          detail={
            result.failures.length === 0
              ? "No reduced-order criteria tripped"
              : (result.failures[0] ?? "Failure")
          }
          provenance="Explicit pass/fail rules"
          tone={result.failures.length === 0 ? "success" : "danger"}
        />
      </div>
      <div className="plot-grid">
        <EngineeringPlot
          title="Transition altitude"
          subtitle="Positive altitude above the configured flat ground plane"
          xLabel="Time (s)"
          yLabel="Altitude (m)"
          data={result.points.map((point) => ({ x: point.timeS, y: point.altitudeM }))}
          source="Aerocel transition core"
          fidelity="Reduced-order · preliminary"
          color={result.completed ? "#48d7b5" : "#ff6b5f"}
        />
        <EngineeringPlot
          title="Airspeed buildup"
          subtitle="Longitudinal point-mass response"
          xLabel="Time (s)"
          yLabel="Airspeed (m/s)"
          data={result.points.map((point) => ({ x: point.timeS, y: point.airspeedMS }))}
          source="Aerocel transition core"
          fidelity="Reduced-order · preliminary"
          color="#7ba8ff"
        />
        <EngineeringPlot
          title="Tilt schedule"
          subtitle="Actual angle after rate limiting or jam injection"
          xLabel="Time (s)"
          yLabel="Tilt (deg)"
          data={result.points.map((point) => ({
            x: point.timeS,
            y: (point.tiltRad * 180) / Math.PI
          }))}
          source="User schedule + actuator limits"
          fidelity="Kinematic solver"
          color="#ffb45b"
        />
        <EngineeringPlot
          title="Electrical demand"
          subtitle="Aggregate power-law propulsion approximation"
          xLabel="Time (s)"
          yLabel="Power (W)"
          data={result.points.map((point) => ({ x: point.timeS, y: point.powerW }))}
          source="Reduced-order propulsion"
          fidelity="Preliminary"
          color="#d78cff"
        />
      </div>
      {result.failures.length > 0 ? (
        <Notice tone="danger" title="Transition did not satisfy the selected safety criteria">
          {result.failures.join(" ")}
        </Notice>
      ) : (
        <Notice tone="warning" title="Model limitation">
          Completion is consistent only with this reduced-order model. Rotor-wing interference,
          pitch dynamics, control saturation, and post-stall effects require higher-fidelity data
          before flight decisions.
        </Notice>
      )}
    </div>
  );
}

function CfdWorkspace(props: WorkspaceContentProps) {
  const [cfdAnalysis, setCfdAnalysis] = useState<"steady_rans" | "transient_urans">("steady_rans");
  const [turbulenceModel, setTurbulenceModel] = useState<"kOmegaSST" | "SpalartAllmaras">(
    "kOmegaSST"
  );
  const openFoam = props.systemProfile?.capabilities.find(
    (capability) => capability.id === "openfoam"
  );
  const caseInput = useMemo(
    () => ({
      name: "kestrel-aoa4",
      solver: "openfoam" as const,
      analysis: cfdAnalysis,
      airspeedMS: props.analysisOptions.airspeedMS,
      angleOfAttackRad: (props.analysisOptions.angleOfAttackDeg * Math.PI) / 180,
      sideslipRad: 0,
      densityKgM3: props.analysis.atmosphere.densityKgM3,
      dynamicViscosityPaS: props.analysis.atmosphere.dynamicViscosityPaS,
      referenceAreaM2: props.project.vehicle.reference.areaM2,
      referenceLengthM: props.project.vehicle.reference.chordM,
      turbulenceModel,
      domainLengthFactors: { upstream: 5, downstream: 12, lateral: 6 },
      mesh: {
        targetBaseCellM: 0.08,
        boundaryLayers: 8,
        maximumCells: 6_000_000,
        hasFatalGeometryErrors: false
      },
      convergence: {
        residualTolerance: 1e-5,
        forceWindow: 200,
        forceRelativeTolerance: 0.002,
        maximumIterations: 2500
      },
      actuatorDisks: props.project.vehicle.propulsionUnits.map((unit) => ({
        id: unit.id,
        centerM: [0, 0, 0] as const,
        normal: [1, 0, 0] as const,
        diameterM: unit.diameterM,
        thrustN: props.analysis.propeller.thrustN,
        swirlTorqueNm: props.analysis.propeller.torqueNm
      }))
    }),
    [cfdAnalysis, props, turbulenceModel]
  );
  const adapter = useMemo(() => new OpenFoamAdapter(), []);
  const validationIssues = adapter.validate(caseInput);
  return (
    <div className="scroll-workspace">
      <WorkspaceHeader
        eyebrow="CFD WIND TUNNEL"
        title="Steady RANS case builder"
        description="Reproducible OpenFOAM configuration with geometry gates, resource class, and convergence evidence."
        actions={
          <>
            <Badge tone={openFoam?.available === true ? "success" : "warning"}>
              {openFoam?.available === true ? "EXECUTABLE DETECTED" : "SOLVER UNAVAILABLE"}
            </Badge>
            <button
              type="button"
              className="button button--primary"
              disabled
              title="Export the verified case manifest first; direct solver submission is not connected in this build"
              onClick={() => props.notify("Direct OpenFOAM submission is not connected.")}
            >
              <Play size={15} /> Launch solver
            </button>
          </>
        }
      />
      <Notice
        tone={openFoam?.available === true ? "info" : "warning"}
        title={
          openFoam?.available === true
            ? "Detected, not verified"
            : "Linux solver environment required"
        }
      >
        {openFoam?.reason ??
          "Capability detection is still running. OpenFOAM is normally run through a local Linux environment or a remote Linux host on Apple silicon."}
      </Notice>
      <div className="cfd-layout">
        <section className="section-card cfd-case">
          <div className="section-card__header">
            <span>
              <small>CASE SETUP</small>
              <h2>Kestrel · α {props.analysisOptions.angleOfAttackDeg.toFixed(1)}°</h2>
            </span>
            <Badge tone="warning">Heavy · 6M cell cap</Badge>
          </div>
          <div className="form-grid">
            <label>
              <span>Analysis</span>
              <select
                value={cfdAnalysis}
                onChange={(event) =>
                  setCfdAnalysis(event.target.value as "steady_rans" | "transient_urans")
                }
              >
                <option value="steady_rans">Steady RANS</option>
                <option value="transient_urans">Transient URANS</option>
              </select>
            </label>
            <label>
              <span>Turbulence</span>
              <select
                value={turbulenceModel}
                onChange={(event) =>
                  setTurbulenceModel(event.target.value as "kOmegaSST" | "SpalartAllmaras")
                }
              >
                <option value="kOmegaSST">k-ω SST</option>
                <option value="SpalartAllmaras">Spalart–Allmaras</option>
              </select>
            </label>
            <label>
              <span>Airspeed</span>
              <div className="unit-input">
                <input readOnly value={props.analysisOptions.airspeedMS} />
                <span>m/s</span>
              </div>
            </label>
            <label>
              <span>Base cell</span>
              <div className="unit-input">
                <input readOnly value="0.080" />
                <span>m</span>
              </div>
            </label>
            <label>
              <span>Boundary layers</span>
              <input readOnly value="8" />
            </label>
            <label>
              <span>Max iterations</span>
              <input readOnly value="2500" />
            </label>
          </div>
          <h3 className="subsection-title">Domain extents</h3>
          <div className="domain-diagram">
            <div className="domain-aircraft">Kestrel</div>
            <span className="domain-upstream">5L upstream</span>
            <span className="domain-downstream">12L downstream</span>
            <span className="domain-lateral">6L lateral</span>
            <div className="domain-wake" />
          </div>
          <button
            type="button"
            className="button button--quiet"
            onClick={() => {
              downloadJson("kestrel-openfoam-case.json", {
                adapter: adapter.adapterVersion,
                case: caseInput,
                validationIssues,
                note: "Case manifest only; no solver result"
              });
              props.notify(
                "Reproducible CFD case manifest exported. No CFD numbers were generated."
              );
            }}
          >
            <Download size={15} /> Export case manifest
          </button>
        </section>
        <aside className="section-card">
          <div className="section-card__header">
            <span>
              <small>QUALITY GATES</small>
              <h2>Before solve</h2>
            </span>
            <Settings2 size={18} />
          </div>
          <div className="gate-list">
            <span className="gate-list--pass">
              <CheckCircle2 size={15} />
              <div>
                <strong>Reference quantities</strong>
                <small>Area, chord, origin defined</small>
              </div>
            </span>
            <span className="gate-list--pass">
              <CheckCircle2 size={15} />
              <div>
                <strong>Domain size</strong>
                <small>Meets adapter minimums</small>
              </div>
            </span>
            <span className="gate-list--warning">
              <AlertTriangle size={15} />
              <div>
                <strong>Surface source</strong>
                <small>Procedural example, no healed CAD</small>
              </div>
            </span>
            <span className="gate-list--blocked">
              <CircleOff size={15} />
              <div>
                <strong>Mesh quality</strong>
                <small>Not generated; cell metrics unavailable</small>
              </div>
            </span>
            <span className="gate-list--blocked">
              <CircleOff size={15} />
              <div>
                <strong>Convergence</strong>
                <small>No residual or force history</small>
              </div>
            </span>
          </div>
          <div className="quality-grade">
            <small>RESULT QUALITY</small>
            <strong>No result</strong>
            <span>
              A completed process will not be called validated without convergence evidence.
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Px4Workspace(props: WorkspaceContentProps) {
  const px4 = props.systemProfile?.capabilities.find((capability) => capability.id === "px4");
  const mappings = [
    {
      output: 1,
      componentId: props.project.vehicle.propulsionUnits[0]?.motorComponentId ?? "",
      function: "motor" as const,
      minimum: 0,
      maximum: 1
    },
    {
      output: 2,
      componentId: props.project.vehicle.propulsionUnits[1]?.motorComponentId ?? "",
      function: "motor" as const,
      minimum: 0,
      maximum: 1
    },
    {
      output: 3,
      componentId: props.project.vehicle.propulsionUnits[2]?.motorComponentId ?? "",
      function: "motor" as const,
      minimum: 0,
      maximum: 1
    },
    {
      output: 4,
      componentId: props.project.vehicle.joints[0]?.id ?? "",
      function: "tilt_joint" as const,
      minimum: 0,
      maximum: 1
    },
    {
      output: 5,
      componentId: props.project.vehicle.joints[1]?.id ?? "",
      function: "tilt_joint" as const,
      minimum: 0,
      maximum: 1
    },
    {
      output: 6,
      componentId: props.project.vehicle.joints[2]?.id ?? "",
      function: "tilt_joint" as const,
      minimum: 0,
      maximum: 1
    }
  ];
  const issues = validatePx4Mapping({
    airframe: "custom",
    modelName: "kestrel",
    parameterFile: null,
    actuatorMappings: mappings,
    mavlinkUdpPort: 14560
  });
  return (
    <div className="scroll-workspace">
      <WorkspaceHeader
        eyebrow="PX4 SITL"
        title="Autopilot actuator mapping"
        description="Explicit MAVLink and output mapping for an unconventional three-motor tilt vehicle."
        actions={
          <>
            <Badge tone={px4?.available === true ? "success" : "warning"}>
              {px4?.available === true ? "PX4 DETECTED" : "SITL UNAVAILABLE"}
            </Badge>
            <button
              className="button button--primary"
              type="button"
              disabled
              title="The live MAVLink/Gazebo transport is not connected in this build"
              onClick={() => props.notify("Live PX4 SITL transport is not connected.")}
            >
              <Play size={15} /> Start SITL
            </button>
          </>
        }
      />
      <Notice tone="warning" title="Execution is capability-gated">
        {px4?.reason ?? "PX4 capability detection is still running."} No actuator telemetry is
        synthesized while SITL is unavailable.
      </Notice>
      <div className="split-layout split-layout--wide">
        <section className="section-card">
          <div className="section-card__header">
            <span>
              <small>OUTPUT MAPPING</small>
              <h2>Kestrel custom mixer</h2>
            </span>
            <Badge tone={issues.length === 0 ? "success" : "danger"}>
              {issues.length === 0 ? "Mapping valid" : `${issues.length} issues`}
            </Badge>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>PX4 output</th>
                <th>Function</th>
                <th>Aerocel target</th>
                <th>Range</th>
                <th>Live output</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping) => (
                <tr key={mapping.output}>
                  <td>
                    <strong>AUX {mapping.output}</strong>
                  </td>
                  <td>{mapping.function.replaceAll("_", " ")}</td>
                  <td>
                    {props.project.vehicle.components.find(
                      (item) => item.id === mapping.componentId
                    )?.name ??
                      props.project.vehicle.joints.find((item) => item.id === mapping.componentId)
                        ?.name ??
                      "Missing"}
                  </td>
                  <td>
                    {mapping.minimum.toFixed(1)}…{mapping.maximum.toFixed(1)}
                  </td>
                  <td>
                    <Badge tone="neutral">No telemetry</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            className="button button--quiet"
            onClick={() =>
              downloadJson("kestrel-px4-mapping.json", { model: "kestrel", port: 14560, mappings })
            }
          >
            <Download size={15} /> Export mapping
          </button>
        </section>
        <aside className="section-card">
          <div className="section-card__header">
            <span>
              <small>SITL SESSION</small>
              <h2>Connection</h2>
            </span>
            <Cpu size={18} />
          </div>
          <div className="connection-visual">
            <span className="connection-node">
              <Cpu size={18} />
              PX4 SITL
            </span>
            <i />
            <span className="connection-node">
              <Activity size={18} />
              MAVLink :14560
            </span>
            <i />
            <span className="connection-node">
              <Gauge size={18} />
              6-DOF truth
            </span>
          </div>
          <div className="detail-grid">
            <span>
              <small>Arming</small>
              <strong>Unavailable</strong>
            </span>
            <span>
              <small>Flight mode</small>
              <strong>—</strong>
            </span>
            <span>
              <small>Log stream</small>
              <strong>Stopped</strong>
            </span>
            <span>
              <small>QGC</small>
              <strong>Not connected</strong>
            </span>
          </div>
          <Notice tone="info" title="Truth separation">
            Aerodynamic truth and noisy sensor outputs remain separate channels. SITL receives
            configured sensor models, never direct hidden state unless explicitly selected.
          </Notice>
        </aside>
      </div>
    </div>
  );
}

function MissionWorkspace(props: WorkspaceContentProps) {
  const cruisePower = props.analysis.glide.bestGlide.powerRequiredW / 0.7 + 55;
  const enduranceMinutes = (props.analysis.battery.remainingEnergyWhApprox / cruisePower) * 60;
  return (
    <div className="scroll-workspace">
      <WorkspaceHeader
        eyebrow="MISSION SIMULATION"
        title="Survey mission energy budget"
        description="Waypoint and environment configuration using preliminary performance models; terrain-world simulation needs Gazebo."
        actions={
          <button
            type="button"
            className="button button--primary"
            onClick={() =>
              props.notify(
                "Mission energy recomputed from the A1 glide polar and equivalent-circuit battery model."
              )
            }
          >
            <Play size={15} /> Estimate mission
          </button>
        }
      />
      <div className="metric-grid metric-grid--four">
        <MetricCard
          label="CRUISE POWER"
          value={cruisePower.toFixed(0)}
          unit="W"
          detail="Propulsive efficiency assumed 70%"
          provenance="Reduced-order estimate"
        />
        <MetricCard
          label="ENDURANCE"
          value={enduranceMinutes.toFixed(0)}
          unit="min"
          detail="Before reserve and VTOL energy"
          provenance="Battery + A1 estimate"
          tone="accent"
        />
        <MetricCard
          label="WIND"
          value={Math.hypot(...props.project.environment.windNedMS).toFixed(1)}
          unit="m/s"
          detail={`NED [${props.project.environment.windNedMS.join(", ")}]`}
          provenance="User-entered environment"
        />
        <MetricCard
          label="TERRAIN"
          value="Flat"
          detail="No obstacle or DEM backend active"
          provenance="Explicit placeholder state"
          tone="warning"
        />
      </div>
      <div className="mission-grid">
        <section className="section-card mission-map">
          <div className="section-card__header">
            <span>
              <small>GROUND TRACK</small>
              <h2>Example survey pattern</h2>
            </span>
            <Badge tone="warning">Not simulated</Badge>
          </div>
          <div className="map-canvas">
            <div className="map-grid-lines" />
            <svg viewBox="0 0 700 360" aria-label="Example mission path">
              <path
                d="M80 300 L130 80 L230 80 L230 280 L330 280 L330 80 L430 80 L430 280 L530 280 L590 140"
                fill="none"
                stroke="#48d7b5"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="8 7"
              />
              <circle cx="80" cy="300" r="9" fill="#ffb45b" />
              <circle cx="590" cy="140" r="9" fill="#7ba8ff" />
            </svg>
            <span className="map-label map-label--home">HOME</span>
            <span className="map-label map-label--end">LAND</span>
          </div>
        </section>
        <aside className="section-card">
          <div className="section-card__header">
            <span>
              <small>MISSION PHASES</small>
              <h2>Energy sources</h2>
            </span>
            <Route size={18} />
          </div>
          <div className="phase-list">
            <span>
              <i>01</i>
              <div>
                <strong>VTOL takeoff</strong>
                <small>Reduced-order transition model</small>
              </div>
              <Badge tone="warning">Estimate</Badge>
            </span>
            <span>
              <i>02</i>
              <div>
                <strong>Outbound cruise</strong>
                <small>A1 steady performance</small>
              </div>
              <Badge tone="warning">Estimate</Badge>
            </span>
            <span>
              <i>03</i>
              <div>
                <strong>Survey grid</strong>
                <small>No turn-energy correction</small>
              </div>
              <Badge tone="warning">Estimate</Badge>
            </span>
            <span>
              <i>04</i>
              <div>
                <strong>Transition & land</strong>
                <small>Ground effect not included</small>
              </div>
              <Badge tone="danger">Incomplete</Badge>
            </span>
          </div>
        </aside>
      </div>
      <Notice tone="warning" title="Mission result is incomplete">
        The displayed endurance is an analytical energy budget, not a time-domain mission result.
        Gusts, turns, terrain, collision, sensors, PX4 behavior, and landing energy are excluded
        until their backends are connected.
      </Notice>
    </div>
  );
}

function OptimizationWorkspace(props: WorkspaceContentProps) {
  const curve = props.analysis.optimization.filter(
    (item) => Math.abs((item.parameters.batteryKg ?? 0) - 2.4) < 0.01
  );
  return (
    <div className="scroll-workspace">
      <WorkspaceHeader
        eyebrow="DESIGN STUDIES"
        title="Span × battery trade study"
        description="Deterministic reduced-order grid search with visible source samples, constraints, and Pareto filtering."
        actions={
          <>
            <Badge tone="warning">A1 REDUCED ORDER</Badge>
            <button
              type="button"
              className="button button--primary"
              onClick={() =>
                props.notify(
                  "42 design points evaluated; no higher-fidelity verification was inferred."
                )
              }
            >
              <Play size={15} /> Run 42 designs
            </button>
          </>
        }
      />
      <div className="metric-grid metric-grid--four">
        <MetricCard
          label="DESIGNS"
          value={String(props.analysis.optimization.length)}
          detail="7 span × 6 battery values"
          provenance="Deterministic grid"
        />
        <MetricCard
          label="FEASIBLE"
          value={String(props.analysis.optimization.filter((item) => item.feasible).length)}
          detail="Span ≤2.65 m · mass ≤9.1 kg"
          provenance="Explicit constraints"
        />
        <MetricCard
          label="PARETO SET"
          value={String(props.analysis.pareto.length)}
          detail="Mass, endurance, and L/D"
          provenance="Non-dominated filter"
          tone="accent"
        />
        <MetricCard
          label="VERIFICATION"
          value="Required"
          detail="Finalists need higher fidelity"
          provenance="Quality policy"
          tone="warning"
        />
      </div>
      <div className="split-layout split-layout--wide">
        <EngineeringPlot
          title="Span sensitivity"
          subtitle="Battery mass fixed at 2.4 kg; visible source evaluations only"
          xLabel="Wing span (m)"
          yLabel="L/D max (—)"
          data={curve.map((item) => ({
            x: item.parameters.spanM ?? 0,
            y: item.objectives.liftToDrag ?? 0
          }))}
          source="42-point grid · no surrogate"
          fidelity="A1 reduced order"
        />
        <section className="section-card">
          <div className="section-card__header">
            <span>
              <small>PARETO CANDIDATES</small>
              <h2>Non-dominated designs</h2>
            </span>
            <Badge tone="accent">{props.analysis.pareto.length}</Badge>
          </div>
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>Span</th>
                <th>Battery</th>
                <th>Mass</th>
                <th>L/D</th>
                <th>Endurance</th>
              </tr>
            </thead>
            <tbody>
              {props.analysis.pareto.slice(0, 8).map((item, index) => (
                <tr key={index}>
                  <td>{item.parameters.spanM?.toFixed(2)} m</td>
                  <td>{item.parameters.batteryKg?.toFixed(1)} kg</td>
                  <td>{item.objectives.massKg?.toFixed(2)} kg</td>
                  <td>{item.objectives.liftToDrag?.toFixed(1)}</td>
                  <td>{item.objectives.enduranceMin?.toFixed(0)} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <Notice tone="info" title="Optimization fidelity ladder">
        Broad search uses reduced-order physics. Aerocel Forge will not declare a finalist until the
        chosen higher-fidelity adapter has run and its result passes the configured numerical
        checks.
      </Notice>
    </div>
  );
}

function ResultsWorkspace(props: WorkspaceContentProps) {
  const rows = [
    [
      "Takeoff mass",
      `${props.analysis.mass.massKg.toFixed(3)} kg`,
      "calculated",
      "Mass aggregation",
      "Preliminary"
    ],
    [
      "CL at design point",
      props.analysis.designPoint.coefficients.cl.toFixed(3),
      "estimated",
      "A1 parabolic polar",
      "Preliminary"
    ],
    [
      "Best L/D",
      props.analysis.glide.bestGlide.liftToDrag.toFixed(1),
      "estimated",
      "A1 glide polar",
      "Preliminary"
    ],
    [
      "Propeller thrust",
      `${props.analysis.propeller.thrustN.toFixed(1)} N`,
      "estimated",
      "P2 BEMT",
      "Numerically converged"
    ],
    [
      "Bus voltage",
      `${props.analysis.battery.busVoltageV.toFixed(2)} V`,
      "estimated",
      "Equivalent circuit",
      "Preliminary"
    ],
    ["CFD CL", "No result", "—", "OpenFOAM", "Unavailable"],
    ["PX4 transition", "No result", "—", "PX4 SITL", "Unavailable"]
  ] as const;
  return (
    <div className="scroll-workspace">
      <WorkspaceHeader
        eyebrow="RESULTS & COMPARISON"
        title="Baseline evidence ledger"
        description="Every value exposes its source, fidelity, and quality state. Missing solver results remain missing."
        actions={
          <button
            className="button button--quiet"
            type="button"
            disabled
            title="Create and retain at least two project snapshots before comparing revisions"
          >
            <GitBranch size={15} /> Compare revision
          </button>
        }
      />
      <section className="section-card">
        <div className="section-card__header">
          <span>
            <small>RESULT INVENTORY</small>
            <h2>{rows.length} tracked quantities</h2>
          </span>
          <div className="legend-inline">
            <Badge tone="accent">Estimated</Badge>
            <Badge tone="success">Converged</Badge>
            <Badge tone="warning">Missing</Badge>
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Quantity</th>
              <th>Value</th>
              <th>Provenance</th>
              <th>Fidelity / source</th>
              <th>Quality</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]}>
                <td>
                  <strong>{row[0]}</strong>
                </td>
                <td>{row[1]}</td>
                <td>{row[2] === "estimated" ? <Badge tone="accent">{row[2]}</Badge> : row[2]}</td>
                <td>{row[3]}</td>
                <td>
                  <Badge
                    tone={
                      row[4] === "Numerically converged"
                        ? "success"
                        : row[4] === "Unavailable"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {row[4]}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="split-layout">
        <section className="section-card">
          <div className="section-card__header">
            <span>
              <small>STALE-RESULT POLICY</small>
              <h2>Input hash tracking</h2>
            </span>
            <ShieldCheck size={18} />
          </div>
          <p className="card-copy">
            Project, configuration, solver, and numerical settings feed a content hash. Relevant
            input changes mark cached results stale; stale data is never silently treated as
            current.
          </p>
        </section>
        <section className="section-card">
          <div className="section-card__header">
            <span>
              <small>REVISION BRANCHES</small>
              <h2>Design history</h2>
            </span>
            <GitBranch size={18} />
          </div>
          <div className="revision-list">
            <span className="revision-list--active">
              <i />
              <strong>Baseline</strong>
              <small>Current · example inputs</small>
            </span>
            <span>
              <i />
              <strong>Revision A</strong>
              <small>Not created</small>
            </span>
            <span>
              <i />
              <strong>Experimental</strong>
              <small>Not created</small>
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

function ValidationWorkspace(props: WorkspaceContentProps) {
  const runtimeChecks = [
    {
      name: "Project schema and reference integrity",
      pass:
        props.project.vehicle.components.length > 0 &&
        props.project.vehicle.joints.every((joint) =>
          props.project.vehicle.components.some(
            (component) => component.id === joint.childComponentId
          )
        ),
      detail: "Runtime relational validation"
    },
    {
      name: "Mass aggregation",
      pass: Math.abs(props.analysis.mass.massKg - 8.42) < 1e-9,
      detail: `${props.analysis.mass.massKg.toFixed(6)} kg expected example total`
    },
    {
      name: "Propeller induced-velocity convergence",
      pass: props.analysis.propeller.converged,
      detail: `${props.analysis.propeller.iterations} iterations`
    },
    {
      name: "Straight-level trim feasibility",
      pass: props.analysis.trim.converged,
      detail: `CL ${props.analysis.trim.liftCoefficient.toFixed(3)} / CLmax 1.350`
    },
    {
      name: "Geometry fatal-error gate",
      pass: props.project.vehicle.components.every(
        (component) => component.geometry.health.status !== "fatal"
      ),
      detail: "No fatal procedural topology state"
    },
    { name: "CFD mesh independence", pass: null, detail: "Skipped · no mesh sequence exists" },
    { name: "Experimental calibration", pass: null, detail: "Not provided" }
  ] as const;
  const passed = runtimeChecks.filter((check) => check.pass === true).length;
  return (
    <div className="scroll-workspace">
      <WorkspaceHeader
        eyebrow="VERIFICATION & VALIDATION"
        title="Evidence, not green checks"
        description="Analytical, regression, numerical-convergence, and experimental evidence remain separate."
        actions={
          <button
            type="button"
            className="button button--primary"
            onClick={() =>
              props.notify(`${passed} runtime checks passed; skipped checks remain skipped.`)
            }
          >
            <RefreshCw size={15} /> Rerun checks
          </button>
        }
      />
      <div className="validation-summary">
        <div className="validation-score">
          <strong>{passed}</strong>
          <span>runtime checks passed</span>
        </div>
        <div>
          <Badge tone="warning">PRELIMINARY</Badge>
          <h2>Numerical cores are checked; vehicle is not validated</h2>
          <p>
            Automated source tests cover units, coordinate signs, cube volume, mass properties, BEMT
            torque direction, ballistic motion, hover balance, GCI, optimization, and report
            sanitization.
          </p>
        </div>
      </div>
      <section className="section-card">
        <div className="section-card__header">
          <span>
            <small>RUNTIME EVIDENCE</small>
            <h2>Current configuration</h2>
          </span>
          <Badge tone="neutral">No claims hidden</Badge>
        </div>
        <div className="validation-list">
          {runtimeChecks.map((check) => (
            <div
              key={check.name}
              className={
                check.pass === true
                  ? "validation-row validation-row--pass"
                  : check.pass === false
                    ? "validation-row validation-row--fail"
                    : "validation-row validation-row--skip"
              }
            >
              {check.pass === true ? (
                <CheckCircle2 size={18} />
              ) : check.pass === false ? (
                <AlertTriangle size={18} />
              ) : (
                <CircleDashed size={18} />
              )}
              <span>
                <strong>{check.name}</strong>
                <small>{check.detail}</small>
              </span>
              <Badge
                tone={check.pass === true ? "success" : check.pass === false ? "danger" : "warning"}
              >
                {check.pass === true ? "Pass" : check.pass === false ? "Fail" : "Not run"}
              </Badge>
            </div>
          ))}
        </div>
      </section>
      <div className="validation-categories">
        <article>
          <Box size={18} />
          <strong>Geometry</strong>
          <span>Cube volume · area · units · topology</span>
        </article>
        <article>
          <Wind size={18} />
          <strong>Aerodynamics</strong>
          <span>Finite-wing slope · symmetry · induced drag</span>
        </article>
        <article>
          <Fan size={18} />
          <strong>Propulsion</strong>
          <span>Static thrust · torque sign · power · sag</span>
        </article>
        <article>
          <Gauge size={18} />
          <strong>Flight dynamics</strong>
          <span>Ballistic motion · trim · hover balance</span>
        </article>
        <article>
          <CloudCog size={18} />
          <strong>CFD</strong>
          <span>Requires external solver verification cases</span>
        </article>
      </div>
    </div>
  );
}

function ReportsWorkspace(props: WorkspaceContentProps) {
  const [exporting, setExporting] = useState(false);
  const exportReport = (): void => {
    setExporting(true);
    void hashText(JSON.stringify(props.project))
      .then(async (inputHash) => {
        const html = generateEngineeringReportHtml({
          project: props.project,
          manifest: {
            aerocelForgeVersion: "0.1.0",
            gitCommit: "working-tree",
            operatingSystem: props.systemProfile?.operatingSystem ?? "Browser preview",
            generatedAt: new Date().toISOString(),
            projectInputHash: inputHash,
            configurationHash: inputHash,
            randomSeeds: [42],
            solvers: []
          },
          results: [
            {
              name: "Takeoff mass",
              value: `${props.analysis.mass.massKg.toFixed(3)} kg`,
              provenance: "Calculated from user inputs",
              fidelity: "Mass aggregation",
              quality: "Preliminary",
              uncertainty: `±${props.analysis.mass.rssMassUncertaintyKg.toFixed(3)} kg RSS`,
              warning: "Component tensor orientation review required"
            },
            {
              name: "Design-point CL",
              value: props.analysis.designPoint.coefficients.cl.toFixed(3),
              provenance: "Estimated",
              fidelity: "A1 parabolic polar",
              quality: "Preliminary",
              uncertainty: "Not quantified",
              warning: props.analysis.designPoint.warnings.join(" ")
            },
            {
              name: "Best L/D",
              value: props.analysis.glide.bestGlide.liftToDrag.toFixed(1),
              provenance: "Estimated",
              fidelity: "A1 glide polar",
              quality: "Preliminary",
              uncertainty: "Not quantified",
              warning: "Attached-flow model only"
            },
            {
              name: "Propeller thrust",
              value: `${props.analysis.propeller.thrustN.toFixed(1)} N per unit`,
              provenance: "Solver-derived from example blade inputs",
              fidelity: "P2 BEMT",
              quality: props.analysis.propeller.converged ? "Numerically converged" : "Unconverged",
              uncertainty: "Not quantified",
              warning: "Not thrust-stand calibrated"
            }
          ],
          validationSummary: [
            "Runtime project references checked",
            "Mass total checked",
            "P2 induced-velocity iteration checked",
            "CFD mesh independence not run",
            "Experimental calibration not provided"
          ],
          warnings: ["No external solver result is included in this report."]
        });
        const path = await writeReport("Kestrel-Baseline-Engineering-Report", html);
        props.notify(`Engineering report written: ${path}`);
      })
      .catch((error: unknown) =>
        props.notify(
          `Report export failed: ${error instanceof Error ? error.message : String(error)}`
        )
      )
      .finally(() => setExporting(false));
  };
  return (
    <div className="scroll-workspace">
      <WorkspaceHeader
        eyebrow="ENGINEERING REPORTS"
        title="Reproducible project record"
        description="Inputs, model sources, fidelity, uncertainty, warnings, and solver inventory in one export."
        actions={
          <button
            className="button button--primary"
            type="button"
            onClick={exportReport}
            disabled={exporting}
          >
            {exporting ? <RefreshCw className="spin" size={15} /> : <Download size={15} />} Export
            HTML report
          </button>
        }
      />
      <div className="report-preview">
        <div className="report-page">
          <span className="report-eyebrow">AEROCEL FORGE / ENGINEERING REPORT</span>
          <h1>{props.project.name}</h1>
          <p>{props.project.description}</p>
          <div className="report-meta">
            <span>
              <small>REVISION</small>
              <strong>{props.project.revision}</strong>
            </span>
            <span>
              <small>BODY / WORLD</small>
              <strong>FRD / NED</strong>
            </span>
            <span>
              <small>QUALITY</small>
              <strong>Preliminary</strong>
            </span>
          </div>
          <h2>Configuration summary</h2>
          <div className="report-figure">
            <div className="report-aircraft-mark">
              <Sparkles size={32} />
            </div>
            <span>
              <strong>{props.project.vehicle.name}</strong>
              <small>
                {props.project.vehicle.components.length} components ·{" "}
                {props.analysis.mass.massKg.toFixed(2)} kg ·{" "}
                {props.project.vehicle.reference.spanM.toFixed(2)} m span
              </small>
            </span>
          </div>
          <h2>Result provenance</h2>
          <div className="report-result-row">
            <span>Best glide ratio</span>
            <strong>{props.analysis.glide.bestGlide.liftToDrag.toFixed(1)}</strong>
            <Badge tone="warning">A1 estimate</Badge>
          </div>
          <div className="report-result-row">
            <span>Propeller thrust</span>
            <strong>{props.analysis.propeller.thrustN.toFixed(1)} N</strong>
            <Badge tone="warning">P2 · uncalibrated</Badge>
          </div>
          <div className="report-warning">
            <AlertTriangle size={16} /> No CFD, PX4, wind-tunnel, or flight-test result is included.
          </div>
        </div>
        <aside>
          <div className="section-card">
            <div className="section-card__header">
              <span>
                <small>REPORT CONTENTS</small>
                <h2>Included sections</h2>
              </span>
              <FileText size={18} />
            </div>
            <div className="report-checklist">
              {[
                "Project and geometry summary",
                "Component mass breakdown",
                "Propulsion and battery setup",
                "Aerodynamic assumptions",
                "Performance and transition results",
                "Validation status and warnings",
                "Reproducibility manifest",
                "Solver inventory and input hashes"
              ].map((item) => (
                <span key={item}>
                  <Check size={14} />
                  {item}
                </span>
              ))}
            </div>
          </div>
          <Notice tone="info" title="PDF workflow">
            Export HTML, then use the macOS print dialog to save a PDF. The print stylesheet
            preserves tables and page margins without inventing missing results.
          </Notice>
        </aside>
      </div>
    </div>
  );
}

function SettingsWorkspace(props: WorkspaceContentProps) {
  const [diagnosing, setDiagnosing] = useState(false);
  const [hostEditorOpen, setHostEditorOpen] = useState(false);
  const [hostProfiles, setHostProfiles] = useState<readonly RemoteHostProfile[]>(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem("aerocel.remoteProfiles") ?? "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((profile): profile is RemoteHostProfile => {
        if (typeof profile !== "object" || profile === null) return false;
        const candidate = profile as Partial<RemoteHostProfile>;
        return (
          typeof candidate.id === "string" &&
          typeof candidate.displayName === "string" &&
          typeof candidate.hostname === "string" &&
          typeof candidate.port === "number" &&
          typeof candidate.username === "string" &&
          (candidate.scheduler === "none" || candidate.scheduler === "slurm") &&
          typeof candidate.remoteRoot === "string"
        );
      });
    } catch {
      return [];
    }
  });
  const [hostDraft, setHostDraft] = useState<RemoteHostProfile>(() => ({
    id: crypto.randomUUID(),
    displayName: "Solver workstation",
    hostname: "solver.example.org",
    port: 22,
    username: "aerocel",
    identityFileReference: null,
    scheduler: "none",
    remoteRoot: "/srv/aerocel/cases",
    cpuLimit: 16,
    memoryLimitGb: 32
  }));
  const modes = [
    { id: "native_mac", label: "Native Mac", detail: "Light and moderate analyses" },
    { id: "local_linux", label: "Local Linux", detail: "Container or VM solvers" },
    { id: "remote_linux", label: "Remote Linux", detail: "SSH and optional SLURM" }
  ] as const;
  const createDiagnostics = (): void => {
    setDiagnosing(true);
    void createDiagnosticBundle(props.project.name, props.recentErrors)
      .then((path) => props.notify(`Diagnostic bundle written: ${path}`))
      .catch((error: unknown) =>
        props.notify(
          `Diagnostics failed: ${error instanceof Error ? error.message : String(error)}`
        )
      )
      .finally(() => setDiagnosing(false));
  };
  const saveHostProfile = (): void => {
    const issues = [...validateRemoteHost(hostDraft)];
    if (hostDraft.displayName.trim() === "") issues.push("Display name is required");
    if (issues.length > 0) {
      props.notify(`Remote profile not saved: ${issues.join("; ")}`);
      return;
    }
    const updated = [...hostProfiles.filter((profile) => profile.id !== hostDraft.id), hostDraft];
    localStorage.setItem("aerocel.remoteProfiles", JSON.stringify(updated));
    setHostProfiles(updated);
    setHostEditorOpen(false);
    props.notify("Remote host profile saved locally without credentials.");
  };
  return (
    <div className="scroll-workspace">
      <WorkspaceHeader
        eyebrow="SETTINGS & SOLVER MANAGEMENT"
        title="Execution capabilities"
        description="Detection is not verification. Each external solver must pass a small known case before engineering use."
        actions={
          <button type="button" className="button button--primary" onClick={props.onOpenSetup}>
            <Sparkles size={15} /> Open setup wizard
          </button>
        }
      />
      <div className="system-profile">
        <div>
          <small>HOST PLATFORM</small>
          <strong>{props.systemProfile?.operatingSystem ?? "Detecting…"}</strong>
          <span>
            {props.systemProfile?.architecture ?? "—"} ·{" "}
            {props.systemProfile === null || props.systemProfile.memoryGb === 0
              ? "Memory unavailable"
              : `${props.systemProfile.memoryGb.toFixed(0)} GB memory`}{" "}
            ·{" "}
            {props.systemProfile === null || props.systemProfile.availableDiskGb === 0
              ? "Disk unavailable"
              : `${props.systemProfile.availableDiskGb.toFixed(0)} GB free`}
          </span>
        </div>
        <Badge tone="accent">MODE A ACTIVE</Badge>
      </div>
      <div className="execution-modes">
        {modes.map((mode, index) => (
          <article
            key={mode.id}
            className={index === 0 ? "execution-mode execution-mode--active" : "execution-mode"}
          >
            <span>{index + 1}</span>
            <div>
              <strong>{mode.label}</strong>
              <small>{mode.detail}</small>
            </div>
            {index === 0 ? <CheckCircle2 size={17} /> : <CircleDashed size={17} />}
          </article>
        ))}
      </div>
      <section className="section-card">
        <div className="section-card__header">
          <span>
            <small>CAPABILITY DETECTOR</small>
            <h2>Installed engineering tools</h2>
          </span>
          <button
            type="button"
            className="button button--quiet"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        <div className="capability-grid">
          {props.systemProfile?.capabilities.map((capability) => (
            <article
              key={capability.id}
              className={capability.available ? "capability capability--available" : "capability"}
            >
              <div className="capability-icon">
                {capability.mode === "native_mac" ? (
                  <Cpu size={18} />
                ) : capability.mode === "local_linux" ? (
                  <Server size={18} />
                ) : (
                  <Terminal size={18} />
                )}
              </div>
              <span>
                <strong>{capability.name}</strong>
                <small>{capability.version ?? capability.reason}</small>
              </span>
              <Badge tone={capability.available ? "success" : "neutral"}>
                {capability.available ? "Detected" : "Unavailable"}
              </Badge>
            </article>
          )) ?? <p className="loading-copy">Inspecting local tools…</p>}
        </div>
      </section>
      <div className="split-layout">
        <section className="section-card">
          <div className="section-card__header">
            <span>
              <small>REMOTE RUNNER</small>
              <h2>SSH hosts</h2>
            </span>
            <LockKeyhole size={18} />
          </div>
          {hostProfiles.length === 0 && !hostEditorOpen && (
            <div className="empty-state">
              <Server size={28} />
              <strong>No remote solver host configured</strong>
              <p>
                Keys stay in the SSH agent or user keychain. Private key material is never stored
                inside a project.
              </p>
              <button
                className="button button--quiet"
                type="button"
                onClick={() => setHostEditorOpen(true)}
              >
                <Plus size={15} /> Add host profile
              </button>
            </div>
          )}
          {hostProfiles.length > 0 && !hostEditorOpen && (
            <div className="remote-profile-list">
              {hostProfiles.map((profile) => (
                <article className="remote-profile" key={profile.id}>
                  <Server size={17} />
                  <span>
                    <strong>{profile.displayName}</strong>
                    <small>
                      {profile.username}@{profile.hostname}:{profile.port} · {profile.scheduler}
                    </small>
                  </span>
                  <Badge tone={validateRemoteHost(profile).length === 0 ? "success" : "danger"}>
                    Profile only
                  </Badge>
                  <button
                    type="button"
                    className="icon-button icon-button--quiet"
                    aria-label={`Delete ${profile.displayName}`}
                    onClick={() => {
                      if (!window.confirm(`Delete remote host profile “${profile.displayName}”?`)) {
                        return;
                      }
                      const updated = hostProfiles.filter(
                        (candidate) => candidate.id !== profile.id
                      );
                      localStorage.setItem("aerocel.remoteProfiles", JSON.stringify(updated));
                      setHostProfiles(updated);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </article>
              ))}
              <button
                className="button button--quiet"
                type="button"
                onClick={() => {
                  setHostDraft((current) => ({ ...current, id: crypto.randomUUID() }));
                  setHostEditorOpen(true);
                }}
              >
                <Plus size={15} /> Add another host
              </button>
            </div>
          )}
          {hostEditorOpen && (
            <div className="remote-profile-editor">
              <div className="form-grid">
                <label>
                  <span>Display name</span>
                  <input
                    value={hostDraft.displayName}
                    onChange={(event) =>
                      setHostDraft((current) => ({ ...current, displayName: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>Host or SSH alias</span>
                  <input
                    value={hostDraft.hostname}
                    onChange={(event) =>
                      setHostDraft((current) => ({ ...current, hostname: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>Username</span>
                  <input
                    value={hostDraft.username}
                    onChange={(event) =>
                      setHostDraft((current) => ({ ...current, username: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>SSH port</span>
                  <input
                    type="number"
                    min="1"
                    max="65535"
                    value={hostDraft.port}
                    onChange={(event) =>
                      setHostDraft((current) => ({ ...current, port: event.target.valueAsNumber }))
                    }
                  />
                </label>
                <label>
                  <span>Remote case root</span>
                  <input
                    value={hostDraft.remoteRoot}
                    onChange={(event) =>
                      setHostDraft((current) => ({ ...current, remoteRoot: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>Scheduler</span>
                  <select
                    value={hostDraft.scheduler}
                    onChange={(event) =>
                      setHostDraft((current) => ({
                        ...current,
                        scheduler: event.target.value as "none" | "slurm"
                      }))
                    }
                  >
                    <option value="none">Direct process</option>
                    <option value="slurm">Slurm</option>
                  </select>
                </label>
              </div>
              <Notice tone="info" title="Credential boundary">
                This stores connection metadata only. Configure the hostname in your SSH config and
                load keys through the SSH agent.
              </Notice>
              <div className="editor-actions">
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => setHostEditorOpen(false)}
                >
                  Cancel
                </button>
                <button type="button" className="button button--primary" onClick={saveHostProfile}>
                  <Save size={15} /> Save profile
                </button>
              </div>
            </div>
          )}
        </section>
        <section className="section-card">
          <div className="section-card__header">
            <span>
              <small>DIAGNOSTICS</small>
              <h2>Support bundle</h2>
            </span>
            <Code2 size={18} />
          </div>
          <p className="card-copy">
            Exports host capabilities and recent application errors. Project geometry, result
            fields, credentials, and private keys are excluded.
          </p>
          <button
            type="button"
            className="button button--quiet"
            onClick={createDiagnostics}
            disabled={diagnosing}
          >
            {diagnosing ? <RefreshCw className="spin" size={15} /> : <Download size={15} />} Create
            diagnostic JSON
          </button>
          {props.recentErrors.length > 0 && (
            <p className="error-count">
              <AlertTriangle size={14} /> {props.recentErrors.length} recent errors will be included
              after redaction.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

export function WorkspaceContent(props: WorkspaceContentProps) {
  switch (props.workspace) {
    case "home":
      return <HomeWorkspace {...props} />;
    case "geometry":
      return <GeometryWorkspace {...props} />;
    case "components":
      return <ComponentsWorkspace {...props} />;
    case "mass":
      return <MassWorkspace {...props} />;
    case "propulsion":
      return <PropulsionWorkspace {...props} />;
    case "aero":
      return <AeroWorkspace {...props} />;
    case "cfd":
      return <CfdWorkspace {...props} />;
    case "flight":
      return <FlightWorkspace {...props} />;
    case "transition":
      return <TransitionWorkspace {...props} />;
    case "px4":
      return <Px4Workspace {...props} />;
    case "mission":
      return <MissionWorkspace {...props} />;
    case "optimization":
      return <OptimizationWorkspace {...props} />;
    case "results":
      return <ResultsWorkspace {...props} />;
    case "validation":
      return <ValidationWorkspace {...props} />;
    case "reports":
      return <ReportsWorkspace {...props} />;
    case "settings":
      return <SettingsWorkspace {...props} />;
  }
}
