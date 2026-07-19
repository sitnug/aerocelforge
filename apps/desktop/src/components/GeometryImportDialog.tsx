import {
  ComponentTypeSchema,
  type AerocelProject,
  type VehicleComponent
} from "@aerocel/simulation-schema";
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  FileUp,
  Info,
  LoaderCircle,
  Server,
  ShieldCheck,
  UploadCloud,
  X
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type SetStateAction
} from "react";
import {
  acceptForGeometryFormat,
  detectGeometryFormat,
  formatDefinition,
  GEOMETRY_FORMATS,
  inspectGeometryFile,
  MAX_LOCAL_FILE_BYTES,
  type GeometryImportFormat,
  type GeometryUnit,
  type ImportedGeometryInspection
} from "../lib/importers";
import { archiveGeometrySource } from "../lib/native";

interface GeometryImportDialogProps {
  readonly open: boolean;
  readonly project: AerocelProject;
  readonly setProject: Dispatch<SetStateAction<AerocelProject>>;
  readonly onClose: () => void;
  readonly onSelect: (id: string) => void;
  readonly onOpenSetup: () => void;
  readonly onGeometryAsset: (
    sourceSha256: string,
    mesh: NonNullable<ImportedGeometryInspection["mesh"]>
  ) => void;
  readonly notify: (message: string) => void;
}

const UNIT_LABELS: Readonly<Record<GeometryUnit, string>> = {
  mm: "Millimetres (mm)",
  cm: "Centimetres (cm)",
  m: "Metres (m)",
  in: "Inches (in)",
  ft: "Feet (ft)"
};

function baseName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/u, "")
    .replaceAll(/[_-]+/gu, " ")
    .trim();
}

function titleCase(value: string): string {
  return value
    .split("_")
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function colorForType(type: VehicleComponent["type"]): string {
  if (["wing", "horizontal_stabilizer", "vertical_stabilizer", "canard"].includes(type)) {
    return "#8ca8a0";
  }
  if (["motor", "propeller", "rotor", "nacelle", "tilt_mechanism"].includes(type)) {
    return "#d1a35f";
  }
  if (["battery", "sensor", "payload", "flight_controller"].includes(type)) {
    return "#728cff";
  }
  return "#7f9d94";
}

export function GeometryImportDialog({
  open,
  project,
  setProject,
  onClose,
  onSelect,
  onOpenSetup,
  onGeometryAsset,
  notify
}: GeometryImportDialogProps) {
  const [format, setFormat] = useState<GeometryImportFormat>("auto");
  const [units, setUnits] = useState<GeometryUnit>("m");
  const [componentType, setComponentType] = useState<VehicleComponent["type"]>("fuselage");
  const [componentName, setComponentName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [cfdIncluded, setCfdIncluded] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportedGeometryInspection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [scaleConfirmed, setScaleConfirmed] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inspectionRevision = useRef(0);

  useEffect(() => {
    if (!open || selectedFile === null) return;
    const revision = inspectionRevision.current + 1;
    inspectionRevision.current = revision;
    setProcessing(true);
    setError(null);
    setResult(null);
    setScaleConfirmed(false);
    void inspectGeometryFile(selectedFile, { requestedFormat: format, originalUnits: units })
      .then((inspection) => {
        if (inspectionRevision.current === revision) setResult(inspection);
      })
      .catch((reason: unknown) => {
        if (inspectionRevision.current === revision) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (inspectionRevision.current === revision) setProcessing(false);
      });
  }, [format, open, selectedFile, units]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !processing && !committing) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [committing, onClose, open, processing]);

  if (!open) return null;

  const chooseFile = (file: File): void => {
    setSelectedFile(file);
    setComponentName(baseName(file.name) || "Imported component");
    const detected = detectGeometryFormat(file.name);
    if (format === "auto" && detected?.id === "gltf") setUnits("m");
  };

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragActive(false);
    const files = [...event.dataTransfer.files];
    if (files.length !== 1) {
      setError("Drop exactly one source file. Import separate components one at a time.");
      return;
    }
    const file = files[0];
    if (file !== undefined) chooseFile(file);
  };

  const canCommit =
    result?.status === "inspected" &&
    result.inspection !== null &&
    result.mesh !== null &&
    scaleConfirmed &&
    componentName.trim() !== "" &&
    !committing;

  const commitImport = async (): Promise<void> => {
    if (
      !canCommit ||
      result?.inspection === null ||
      result?.mesh === null ||
      selectedFile === null
    ) {
      return;
    }
    setCommitting(true);
    setError(null);
    let archivedSource: string;
    try {
      archivedSource = await archiveGeometrySource(selectedFile, result.sourceSha256);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setCommitting(false);
      return;
    }
    const id = crypto.randomUUID();
    const inspection = result.inspection;
    const component: VehicleComponent = {
      id,
      name: componentName.trim(),
      type: componentType,
      parentId: parentId === "" ? null : parentId,
      visible: true,
      cfdIncluded,
      transform: {
        translationM: [0, 0, 0],
        rotationRad: [0, 0, 0],
        scale: [1, 1, 1]
      },
      geometry: {
        kind: "mesh",
        source: archivedSource,
        sourceSha256: result.sourceSha256,
        originalUnits: units,
        boundingBoxM: [...inspection.boundingBoxM],
        health: {
          watertight: inspection.watertight,
          openEdgeCount: inspection.openEdgeCount,
          nonManifoldEdgeCount: inspection.nonManifoldEdgeCount,
          invertedNormalCount: inspection.normalsLikelyInverted ? 1 : 0,
          selfIntersectionCount: null,
          status: inspection.status,
          notes: [
            ...inspection.notes,
            "Self-intersection and minimum-thickness checks require the isolated geometry service."
          ]
        },
        repairs: []
      },
      mass: null,
      visual: { color: colorForType(componentType), opacity: 1 },
      properties: {
        importFormat: result.formatId,
        importSizeBytes: result.sizeBytes,
        importedAt: new Date().toISOString(),
        connectedBodyCount: inspection.connectedBodyCount,
        minimumTriangleQuality: inspection.minimumTriangleQuality,
        thinAxisRatio: inspection.thinAxisRatio,
        coordinateConvention: "Source axes interpreted as component-local body FRD",
        sourceFileName: result.fileName,
        sourceArchive: archivedSource
      }
    };
    onGeometryAsset(result.sourceSha256, result.mesh);
    setProject((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      vehicle: {
        ...current.vehicle,
        components: [...current.vehicle.components, component]
      },
      warnings:
        inspection.status === "pass"
          ? current.warnings
          : [
              ...current.warnings,
              `${component.name}: imported geometry status is ${inspection.status}`
            ]
    }));
    onSelect(id);
    notify(`${component.name} added to the assembly with source hash and geometry health.`);
    setSelectedFile(null);
    setResult(null);
    setComponentName("");
    setScaleConfirmed(false);
    setCommitting(false);
    onClose();
  };

  const selectedDefinition = format === "auto" ? null : formatDefinition(format);

  return (
    <div
      className="modal-backdrop import-backdrop"
      role="presentation"
      onMouseDown={() => {
        if (!processing && !committing) onClose();
      }}
    >
      <section
        className="import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="geometry-import-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="import-dialog__header">
          <span>
            <small>GEOMETRY PIPELINE</small>
            <h2 id="geometry-import-title">Import model or component</h2>
            <p>Select the source type, confirm units, inspect topology, then commit it.</p>
          </span>
          <button
            type="button"
            className="icon-button icon-button--quiet"
            aria-label="Close import"
            disabled={processing || committing}
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>

        <div className="import-dialog__body">
          <aside className="import-setup">
            <div className="import-step-label">
              <span>01</span>
              <strong>Source definition</strong>
            </div>
            <label className="import-field">
              <span>File / model type</span>
              <select
                value={format}
                onChange={(event) => setFormat(event.target.value as GeometryImportFormat)}
              >
                <option value="auto">Auto-detect from extension</option>
                {GEOMETRY_FORMATS.map((definition) => (
                  <option value={definition.id} key={definition.id}>
                    {definition.label}
                  </option>
                ))}
              </select>
              <small>
                {selectedDefinition?.capability ??
                  "A matching registered extension is required; contents are still validated."}
              </small>
            </label>
            <label className="import-field">
              <span>Source coordinate units</span>
              <select
                value={units}
                onChange={(event) => setUnits(event.target.value as GeometryUnit)}
              >
                {Object.entries(UNIT_LABELS).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
              <small>STL and OBJ do not contain trustworthy unit metadata.</small>
            </label>

            <div className="import-step-label import-step-label--spaced">
              <span>02</span>
              <strong>Assembly assignment</strong>
            </div>
            <label className="import-field">
              <span>Semantic component type</span>
              <select
                value={componentType}
                onChange={(event) =>
                  setComponentType(event.target.value as VehicleComponent["type"])
                }
              >
                {ComponentTypeSchema.options.map((type) => (
                  <option value={type} key={type}>
                    {titleCase(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="import-field">
              <span>Component name</span>
              <input
                value={componentName}
                maxLength={80}
                placeholder="e.g. Left wing"
                onChange={(event) => setComponentName(event.target.value)}
              />
            </label>
            <label className="import-field">
              <span>Parent component</span>
              <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
                <option value="">Vehicle root</option>
                {project.vehicle.components.map((component) => (
                  <option value={component.id} key={component.id}>
                    {component.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={cfdIncluded}
                onChange={(event) => setCfdIncluded(event.target.checked)}
              />
              <span>
                Include as a CFD surface
                <small>Geometry health gates still apply before meshing.</small>
              </span>
            </label>
          </aside>

          <main className="import-stage">
            <div
              className={`import-dropzone ${dragActive ? "import-dropzone--active" : ""} ${selectedFile !== null ? "import-dropzone--selected" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (event.currentTarget === event.target) setDragActive(false);
              }}
              onDrop={onDrop}
            >
              <input
                ref={inputRef}
                type="file"
                hidden
                accept={acceptForGeometryFormat(format)}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file !== undefined) chooseFile(file);
                  event.target.value = "";
                }}
              />
              {processing ? (
                <LoaderCircle className="spin" size={32} />
              ) : selectedFile === null ? (
                <UploadCloud size={34} />
              ) : (
                <FileUp size={34} />
              )}
              <strong>
                {processing
                  ? "Inspecting source…"
                  : (selectedFile?.name ?? "Drop one geometry file here")}
              </strong>
              <span>
                {selectedFile === null
                  ? `or choose a local file · ${MAX_LOCAL_FILE_BYTES / 1024 / 1024} MB / 1M triangle limits`
                  : `${(selectedFile.size / 1024).toFixed(1)} KB · change the file if needed`}
              </span>
              <button
                type="button"
                className="button button--primary"
                disabled={processing}
                onClick={() => inputRef.current?.click()}
              >
                <FileUp size={15} /> {selectedFile === null ? "Choose file" : "Choose another"}
              </button>
            </div>

            {error !== null && (
              <div className="import-status import-status--error" role="alert">
                <AlertTriangle size={18} />
                <span>
                  <strong>Import blocked</strong>
                  {error}
                </span>
              </div>
            )}

            {result?.status === "adapter_required" && (
              <div className="import-status import-status--adapter">
                <Server size={18} />
                <span>
                  <strong>External adapter required</strong>
                  {result.explanation}
                </span>
                <button type="button" className="button button--quiet" onClick={onOpenSetup}>
                  Configure
                </button>
              </div>
            )}

            {result?.status === "section_only" && (
              <div className="import-status import-status--adapter">
                <Info size={18} />
                <span>
                  <strong>Section data inspected</strong>
                  {result.explanation}
                </span>
              </div>
            )}

            {result?.status === "unsupported" && (
              <div className="import-status import-status--error">
                <AlertTriangle size={18} />
                <span>
                  <strong>Unsupported source</strong>
                  {result.explanation}
                </span>
              </div>
            )}

            {result?.status === "inspected" && result.inspection !== null && (
              <section className="import-inspection">
                <header>
                  <span>
                    <CheckCircle2 size={17} />
                    <strong>Local inspection complete</strong>
                  </span>
                  <span
                    className={`badge badge--${result.inspection.status === "pass" ? "success" : "warning"}`}
                  >
                    {result.inspection.status.toUpperCase()}
                  </span>
                </header>
                <div className="import-inspection__metrics">
                  <span>
                    <small>Bounding box · metres</small>
                    <strong>
                      {result.inspection.boundingBoxM
                        .map((value) => value.toPrecision(4))
                        .join(" × ")}
                    </strong>
                  </span>
                  <span>
                    <small>Mesh size</small>
                    <strong>
                      {result.inspection.vertexCount.toLocaleString()} vertices ·{" "}
                      {result.inspection.triangleCount.toLocaleString()} triangles
                    </strong>
                  </span>
                  <span>
                    <small>Topology</small>
                    <strong>
                      {result.inspection.watertight
                        ? "Watertight"
                        : `${result.inspection.openEdgeCount} open edges`}
                    </strong>
                  </span>
                  <span>
                    <small>Bodies / minimum quality</small>
                    <strong>
                      {result.inspection.connectedBodyCount} ·{" "}
                      {result.inspection.minimumTriangleQuality.toPrecision(3)}
                    </strong>
                  </span>
                  <span>
                    <small>Source identity</small>
                    <strong>{result.sourceSha256.slice(0, 12)}… SHA-256</strong>
                  </span>
                </div>
                {result.warnings.map((warning) => (
                  <p key={warning}>
                    <Info size={13} /> {warning}
                  </p>
                ))}
                <label className="scale-confirmation">
                  <input
                    type="checkbox"
                    checked={scaleConfirmed}
                    onChange={(event) => setScaleConfirmed(event.target.checked)}
                  />
                  <span>
                    <strong>I confirm these dimensions and source axes.</strong>
                    <small>
                      Imported axes become component-local body FRD. Alignment can be edited after
                      import.
                    </small>
                  </span>
                </label>
              </section>
            )}
          </main>
        </div>

        <footer className="import-dialog__footer">
          <span>
            <ShieldCheck size={14} /> Original file content is never executed. SHA-256 identifies
            this import.
          </span>
          <div>
            <button
              type="button"
              className="button button--quiet"
              disabled={committing}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button button--primary"
              disabled={!canCommit}
              onClick={() => void commitImport()}
            >
              {committing ? <LoaderCircle className="spin" size={15} /> : <Box size={15} />}
              {committing ? "Archiving source…" : "Add to assembly"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
