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
  requireSingleGeometryFile,
  type GeometryImportFormat,
  type GeometryUnit,
  type ImportedGeometryInspection
} from "../lib/importers";
import { archiveGeometrySource } from "../lib/native";
import { InfoTip } from "./InfoTip";

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
  readonly advancedMode: boolean;
}

const UNIT_LABELS: Readonly<Record<GeometryUnit, string>> = {
  mm: "Millimetres (mm)",
  cm: "Centimetres (cm)",
  m: "Metres (m)",
  in: "Inches (in)",
  ft: "Feet (ft)"
};

type ImportTarget = "part" | "whole_drone";

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
  notify,
  advancedMode
}: GeometryImportDialogProps) {
  const [format, setFormat] = useState<GeometryImportFormat>("auto");
  const [units, setUnits] = useState<GeometryUnit>("m");
  const [componentType, setComponentType] = useState<VehicleComponent["type"]>("fuselage");
  const [importTarget, setImportTarget] = useState<ImportTarget>("part");
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
    try {
      chooseFile(requireSingleGeometryFile([...event.dataTransfer.files]));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const canCommit =
    result?.status === "inspected" &&
    result.inspection !== null &&
    result.mesh !== null &&
    scaleConfirmed &&
    componentName.trim() !== "" &&
    !committing;
  const importedComponentType: VehicleComponent["type"] =
    importTarget === "whole_drone" ? "fuselage" : componentType;

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
      type: importedComponentType,
      parentId: importTarget === "whole_drone" || parentId === "" ? null : parentId,
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
      visual: { color: colorForType(importedComponentType), opacity: 1 },
      properties: {
        importFormat: result.formatId,
        importSizeBytes: result.sizeBytes,
        importedAt: new Date().toISOString(),
        connectedBodyCount: inspection.connectedBodyCount,
        minimumTriangleQuality: inspection.minimumTriangleQuality,
        thinAxisRatio: inspection.thinAxisRatio,
        coordinateConvention: "Source axes interpreted as component-local body FRD",
        sourceFileName: result.fileName,
        sourceArchive: archivedSource,
        importTarget,
        keptAsOneObject: true
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
    notify(
      importTarget === "whole_drone"
        ? `${component.name} was added as one whole drone model. All ${inspection.connectedBodyCount} connected shapes stay together.`
        : `${component.name} was added as one complete part and checked for common 3D model problems.`
    );
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
            <small>ADD A 3D MODEL</small>
            <h2 id="geometry-import-title">Import an aircraft or part</h2>
            <p>Choose the file type and size units, then drop a file or pick one.</p>
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
              <strong>Tell us about the file</strong>
            </div>
            <label className="import-field">
              <span className="inline-help-label">
                File type
                <InfoTip label="File type">
                  Keep “Choose automatically” unless the file has the wrong or missing ending.
                  Aerocel Forge still checks the file before using it.
                </InfoTip>
              </span>
              <select
                value={format}
                onChange={(event) => setFormat(event.target.value as GeometryImportFormat)}
              >
                <option value="auto">Choose automatically</option>
                {GEOMETRY_FORMATS.map((definition) => (
                  <option value={definition.id} key={definition.id}>
                    {definition.label}
                  </option>
                ))}
              </select>
              <small>
                {selectedDefinition?.capability ??
                  "The file ending is used as a first clue; the contents are checked too."}
              </small>
            </label>
            <label className="import-field">
              <span className="inline-help-label">
                Size units used by the file
                <InfoTip label="Size units" align="right">
                  Some 3D files store plain numbers without saying whether they mean millimetres,
                  metres, or inches. Choose the unit used when the model was made.
                </InfoTip>
              </span>
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
              <small>STL and OBJ files usually do not say which unit they use.</small>
            </label>

            <div className="import-step-label import-step-label--spaced">
              <span>02</span>
              <strong>Choose what the file represents</strong>
            </div>
            <fieldset className="import-target-picker">
              <legend className="inline-help-label">
                Import as
                <InfoTip label="Import as">
                  A part can be moved and attached to another part. A whole drone model keeps every
                  shape in the file together as one object.
                </InfoTip>
              </legend>
              <label className={importTarget === "part" ? "import-target--selected" : ""}>
                <input
                  type="radio"
                  name="import-target"
                  value="part"
                  checked={importTarget === "part"}
                  onChange={() => setImportTarget("part")}
                />
                <span>
                  <strong>One complete drone part</strong>
                  <small>For a wing, body, motor, landing gear, or other single part.</small>
                </span>
              </label>
              <label className={importTarget === "whole_drone" ? "import-target--selected" : ""}>
                <input
                  type="radio"
                  name="import-target"
                  value="whole_drone"
                  checked={importTarget === "whole_drone"}
                  onChange={() => setImportTarget("whole_drone")}
                />
                <span>
                  <strong>Whole drone model</strong>
                  <small>Every shape in the STL stays together as one selectable object.</small>
                </span>
              </label>
            </fieldset>
            {importTarget === "part" && (
              <label className="import-field">
                <span className="inline-help-label">
                  What kind of part is it?
                  <InfoTip label="Part kind">
                    This tells the app what the shape does. For example, a wing makes lift and a
                    battery adds weight and energy.
                  </InfoTip>
                </span>
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
            )}
            <label className="import-field">
              <span>{importTarget === "whole_drone" ? "Drone model name" : "Part name"}</span>
              <input
                value={componentName}
                maxLength={80}
                placeholder="e.g. Left wing"
                onChange={(event) => setComponentName(event.target.value)}
              />
            </label>
            {importTarget === "part" && (
              <label className="import-field">
                <span>Attach it to</span>
                <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
                  <option value="">The whole aircraft</option>
                  {project.vehicle.components.map((component) => (
                    <option value={component.id} key={component.id}>
                      {component.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {advancedMode && (
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={cfdIncluded}
                  onChange={(event) => setCfdIncluded(event.target.checked)}
                />
                <span>
                  Use in detailed wind tests (CFD)
                  <small>The model must pass 3D shape checks first.</small>
                </span>
              </label>
            )}
          </aside>

          <main className="import-stage">
            <div
              className={`import-dropzone ${dragActive ? "import-dropzone--active" : ""} ${selectedFile !== null ? "import-dropzone--selected" : ""}`}
              role="group"
              aria-label="3D model file drop zone"
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
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
                  : (selectedFile?.name ?? "Drop one 3D model file here")}
              </strong>
              <span>
                {selectedFile === null
                  ? `or choose a file · up to ${MAX_LOCAL_FILE_BYTES / 1024 / 1024} MB and 1 million triangles`
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
                  <strong>This file needs an extra converter</strong>
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
                  <strong>Shape outline checked</strong>
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
                    <strong>3D model check complete</strong>
                  </span>
                  <span
                    className={`badge badge--${result.inspection.status === "pass" ? "success" : "warning"}`}
                  >
                    {result.inspection.status.toUpperCase()}
                  </span>
                </header>
                <div className="import-inspection__metrics">
                  <span>
                    <small>Overall size · metres</small>
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
                    <small>Closed shape check</small>
                    <strong>
                      {result.inspection.watertight
                        ? "Closed with no holes"
                        : `${result.inspection.openEdgeCount} open model edges`}
                    </strong>
                  </span>
                  <span>
                    <small>Separate shapes / lowest triangle quality</small>
                    <strong>
                      {result.inspection.connectedBodyCount} ·{" "}
                      {result.inspection.minimumTriangleQuality.toPrecision(3)}
                    </strong>
                  </span>
                  <span>
                    <small>File fingerprint</small>
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
                    <strong>I checked the size and direction of this model.</strong>
                    <small>
                      You can move and turn the{" "}
                      {importTarget === "whole_drone" ? "whole model" : "part"} after importing it.
                    </small>
                  </span>
                </label>
              </section>
            )}
          </main>
        </div>

        <footer className="import-dialog__footer">
          <span>
            <ShieldCheck size={14} /> The model file is read as data, never run as a program. A
            fingerprint records exactly which file was used.
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
              {committing
                ? "Saving model…"
                : importTarget === "whole_drone"
                  ? "Add whole drone model"
                  : "Add complete part"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
