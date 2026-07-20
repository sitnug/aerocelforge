import type { AerocelProject, VehicleComponent } from "@aerocel/simulation-schema";
import type { TriangleMesh } from "@aerocel/geometry-core";
import {
  Box,
  ChartNoAxesCombined,
  ChevronRight,
  CircleDotDashed,
  CloudCog,
  Command,
  Cpu,
  Fan,
  FilePlus2,
  FileUp,
  FileText,
  FolderOpen,
  Gauge,
  GitCompareArrows,
  Home,
  Layers3,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PlaneTakeoff,
  Save,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Wind,
  X,
  type LucideIcon
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import { runRapidAnalysis, defaultAnalysisOptions, type AnalysisOptions } from "./lib/analysis";
import { inspectGeometryFile } from "./lib/importers";
import {
  deleteProject,
  getSystemProfile,
  isNativeDesktop,
  listProjects,
  loadGeometrySource,
  loadProject,
  saveProject,
  type ProjectSummary,
  type SystemProfile
} from "./lib/native";
import { createBlankProject, isLegacyExampleProject, uniqueProjectFileName } from "./lib/projects";
import { WorkspaceContent } from "./components/WorkspaceContent";
import { InfoTip } from "./components/InfoTip";
import {
  DeletePartDialog,
  PartContextMenu,
  type PartContextMenuState
} from "./components/PartActionOverlays";
import type { ViewportOptions } from "./components/AircraftViewport";
import {
  applyComponentDeletion,
  planComponentDeletion,
  type ComponentDeletionPlan
} from "./lib/componentOperations";
import { readAdvancedPreference, readThemePreference, type AppTheme } from "./lib/preferences";
import "./styles.css";
import { ProjectManagerDialog } from "./components/ProjectManagerDialog";
import {
  copyComponentTree,
  pasteComponentTree,
  type ComponentClipboard
} from "./lib/componentClipboard";

export type WorkspaceId =
  | "home"
  | "geometry"
  | "components"
  | "mass"
  | "propulsion"
  | "aero"
  | "cfd"
  | "flight"
  | "transition"
  | "px4"
  | "mission"
  | "optimization"
  | "results"
  | "validation"
  | "reports"
  | "settings";

interface WorkspaceDefinition {
  readonly id: WorkspaceId;
  readonly label: string;
  readonly shortLabel: string;
  readonly icon: LucideIcon;
  readonly group: "build" | "analyze" | "verify";
  readonly advanced?: boolean;
}

const workspaces: readonly WorkspaceDefinition[] = [
  { id: "home", label: "Project home", shortLabel: "Home", icon: Home, group: "build" },
  { id: "geometry", label: "3D model", shortLabel: "3D model", icon: Box, group: "build" },
  {
    id: "components",
    label: "Parts and movement",
    shortLabel: "Parts",
    icon: Layers3,
    group: "build"
  },
  { id: "mass", label: "Weight and balance", shortLabel: "Weight", icon: Scale, group: "build" },
  {
    id: "propulsion",
    label: "Motors and battery",
    shortLabel: "Power",
    icon: Fan,
    group: "analyze"
  },
  {
    id: "aero",
    label: "Quick flight estimate",
    shortLabel: "Airflow",
    icon: Wind,
    group: "analyze"
  },
  {
    id: "cfd",
    label: "Advanced wind test (CFD)",
    shortLabel: "Wind test",
    icon: CloudCog,
    group: "analyze",
    advanced: true
  },
  {
    id: "flight",
    label: "Flight simulator",
    shortLabel: "Fly",
    icon: Gauge,
    group: "analyze"
  },
  {
    id: "transition",
    label: "Hover to cruise",
    shortLabel: "Transition",
    icon: PlaneTakeoff,
    group: "analyze"
  },
  {
    id: "px4",
    label: "PX4 autopilot simulator",
    shortLabel: "Autopilot",
    icon: Cpu,
    group: "analyze",
    advanced: true
  },
  {
    id: "mission",
    label: "Route planner",
    shortLabel: "Route",
    icon: MapIcon,
    group: "analyze"
  },
  {
    id: "optimization",
    label: "Design choices",
    shortLabel: "Choices",
    icon: ChartNoAxesCombined,
    group: "verify",
    advanced: true
  },
  {
    id: "results",
    label: "Compare results",
    shortLabel: "Results",
    icon: GitCompareArrows,
    group: "verify"
  },
  {
    id: "validation",
    label: "Engineering checks",
    shortLabel: "Checks",
    icon: ShieldCheck,
    group: "verify",
    advanced: true
  },
  { id: "reports", label: "Reports", shortLabel: "Reports", icon: FileText, group: "verify" },
  {
    id: "settings",
    label: "Settings and tools",
    shortLabel: "Settings",
    icon: Settings,
    group: "verify"
  }
];

const defaultViewportOptions: ViewportOptions = {
  orthographic: false,
  showGrid: true,
  showAxes: true,
  showCg: true,
  showThrust: true,
  showSlipstream: true,
  exploded: false
};

type SaveState =
  | { readonly status: "idle"; readonly detail: string }
  | { readonly status: "saving"; readonly detail: string }
  | { readonly status: "saved"; readonly detail: string }
  | { readonly status: "error"; readonly detail: string };

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function ActivityRail({
  active,
  onChange,
  items
}: {
  readonly active: WorkspaceId;
  readonly onChange: (workspace: WorkspaceId) => void;
  readonly items: readonly WorkspaceDefinition[];
}) {
  return (
    <nav className="activity-rail" aria-label="Engineering workspaces">
      <div className="activity-logo" aria-label="Aerocel Forge">
        <span className="activity-logo__wing" />
        <span className="activity-logo__core" />
      </div>
      <div className="activity-scroll">
        {items.map((workspace, index) => {
          const Icon = workspace.icon;
          const showDivider = index > 0 && items[index - 1]?.group !== workspace.group;
          return (
            <div
              key={workspace.id}
              className={showDivider ? "activity-group activity-group--divided" : "activity-group"}
            >
              <button
                type="button"
                className={`activity-button ${active === workspace.id ? "activity-button--active" : ""}`}
                onClick={() => onChange(workspace.id)}
                aria-label={workspace.label}
                aria-current={active === workspace.id ? "page" : undefined}
                title={workspace.label}
              >
                <Icon size={18} strokeWidth={1.7} />
                <span>{workspace.shortLabel}</span>
              </button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function ComponentNavigator({
  project,
  selectedId,
  onSelect,
  onPartContextMenu,
  onToggle
}: {
  readonly project: AerocelProject;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onPartContextMenu: (id: string, clientX: number, clientY: number) => void;
  readonly onToggle: () => void;
}) {
  const groups = [
    {
      label: "Airframe",
      types: [
        "fuselage",
        "wing",
        "horizontal_stabilizer",
        "vertical_stabilizer",
        "canard",
        "boom",
        "pylon",
        "nacelle",
        "fairing",
        "control_surface",
        "flap",
        "aileron",
        "elevator",
        "rudder",
        "elevon",
        "flaperon",
        "spoiler",
        "air_brake",
        "landing_gear",
        "wheel"
      ]
    },
    {
      label: "Propulsion",
      types: ["motor", "propeller", "rotor", "duct", "tilt_mechanism", "servo", "esc"]
    },
    {
      label: "Systems",
      types: [
        "battery",
        "fuel_tank",
        "flight_controller",
        "camera",
        "lidar",
        "gps",
        "payload",
        "ballast",
        "parachute",
        "generic_mass",
        "collision_only",
        "visual_only",
        "cfd_excluded"
      ]
    }
  ] satisfies readonly {
    readonly label: string;
    readonly types: readonly VehicleComponent["type"][];
  }[];
  return (
    <aside className="navigator-panel">
      <div className="navigator-project">
        <div className="project-kicker">
          <CircleDotDashed size={13} /> ACTIVE PROJECT
        </div>
        <strong>{project.vehicle.name}</strong>
        <span>
          {project.revision} · schema {project.schemaVersion}
        </span>
      </div>
      <div className="navigator-heading">
        <span>Assembly</span>
        <button
          className="icon-button icon-button--quiet"
          type="button"
          aria-label="Collapse navigator"
          title="Collapse navigator"
          onClick={onToggle}
        >
          <PanelLeftClose size={14} />
        </button>
      </div>
      <div className="component-tree">
        {groups.map((group) => {
          const components = project.vehicle.components.filter((component) =>
            (group.types as readonly VehicleComponent["type"][]).includes(component.type)
          );
          return (
            <section key={group.label} className="component-group">
              <h3>
                {group.label}
                <span>{components.length}</span>
              </h3>
              {components.map((component) => (
                <button
                  type="button"
                  key={component.id}
                  className={`component-row ${selectedId === component.id ? "component-row--active" : ""}`}
                  onClick={() => onSelect(component.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onSelect(component.id);
                    onPartContextMenu(component.id, event.clientX, event.clientY);
                  }}
                >
                  <span
                    className="component-swatch"
                    style={{ background: component.visual.color }}
                  />
                  <span className="component-row__copy">
                    <strong>{component.name}</strong>
                    <small>{component.type.replaceAll("_", " ")}</small>
                  </span>
                  <span
                    className={`health-dot health-dot--${component.geometry.health.status}`}
                    title={`Geometry status: ${component.geometry.health.status}`}
                  />
                </button>
              ))}
            </section>
          );
        })}
      </div>
      <div className="navigator-footnote">
        <ShieldCheck size={14} />
        <span>
          User-entered inputs
          <br />
          <small>Review before real-world use</small>
        </span>
      </div>
    </aside>
  );
}

function CommandPalette({
  open,
  onClose,
  onNavigate,
  items
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onNavigate: (workspace: WorkspaceId) => void;
  readonly items: readonly WorkspaceDefinition[];
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);
  if (!open) return null;
  const matches = items.filter((workspace) =>
    workspace.label.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-search">
          <Search size={17} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a screen…"
            aria-label="Search commands"
          />
          <kbd>esc</kbd>
        </div>
        <div className="command-results">
          <small>SCREENS</small>
          {matches.map((workspace) => {
            const Icon = workspace.icon;
            return (
              <button
                key={workspace.id}
                type="button"
                onClick={() => {
                  onNavigate(workspace.id);
                  onClose();
                }}
              >
                <Icon size={16} />
                <span>
                  <strong>{workspace.label}</strong>
                  <small>Open {workspace.shortLabel.toLowerCase()} workspace</small>
                </span>
                <ChevronRight size={14} />
              </button>
            );
          })}
          {matches.length === 0 && <p className="empty-command">No command matches “{query}”.</p>}
        </div>
      </section>
    </div>
  );
}

function FileMenu({
  hasActiveProject,
  onNewProject,
  onOpenProjects,
  onSave,
  onImportModel
}: {
  readonly hasActiveProject: boolean;
  readonly onNewProject: () => void;
  readonly onOpenProjects: () => void;
  readonly onSave: () => void;
  readonly onImportModel: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
    const closeOnPointerDown = (event: PointerEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="titlebar-file" ref={containerRef}>
      <button
        type="button"
        className={`titlebar-file__trigger ${open ? "titlebar-file__trigger--open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        File
      </button>
      {open && (
        <div className="file-menu" role="menu" aria-label="File actions">
          <button
            ref={firstItemRef}
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNewProject();
            }}
          >
            <FilePlus2 size={15} />
            <span>
              <strong>New empty file…</strong>
              <small>Create a file with no sample aircraft</small>
            </span>
            <kbd>⌘N</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpenProjects();
            }}
          >
            <FolderOpen size={15} />
            <span>
              <strong>Open aircraft file…</strong>
              <small>View your saved Aerocel files</small>
            </span>
            <kbd>⌘O</kbd>
          </button>
          <div className="file-menu__divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            disabled={!hasActiveProject}
            onClick={() => {
              setOpen(false);
              onSave();
            }}
          >
            <Save size={15} />
            <span>
              <strong>Save now</strong>
              <small>Autosave is also always on</small>
            </span>
            <kbd>⌘S</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!hasActiveProject}
            onClick={() => {
              setOpen(false);
              onImportModel();
            }}
          >
            <FileUp size={15} />
            <span>
              <strong>Import model…</strong>
              <small>Choose or drop a model file</small>
            </span>
            <kbd>⌘I</kbd>
          </button>
        </div>
      )}
    </div>
  );
}

function SetupWizard({
  open,
  profile,
  onClose,
  onOpenSettings
}: {
  readonly open: boolean;
  readonly profile: SystemProfile | null;
  readonly onClose: () => void;
  readonly onOpenSettings: () => void;
}) {
  if (!open) return null;
  const available = profile?.capabilities.filter((capability) => capability.available).length ?? 0;
  const total = profile?.capabilities.length ?? 0;
  return (
    <div className="modal-backdrop setup-backdrop" role="presentation">
      <section
        className="setup-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
      >
        <header>
          <div className="setup-mark">
            <Sparkles size={20} />
          </div>
          <span>
            <small>WELCOME TO AEROCEL FORGE</small>
            <h2 id="setup-title">Get Aerocel Forge ready</h2>
          </span>
          <button
            type="button"
            className="icon-button icon-button--quiet"
            onClick={onClose}
            aria-label="Close setup"
          >
            <X size={18} />
          </button>
        </header>
        <div className="setup-content">
          <div className="setup-hero">
            <div className="setup-machine">
              <span>COMPUTER</span>
              <strong>{profile?.architecture ?? "Detecting…"}</strong>
              <small>{profile?.operatingSystem ?? "Checking this computer"}</small>
            </div>
            <div className="setup-machine">
              <span>MEMORY</span>
              <strong>
                {profile === null || profile.memoryGb === 0
                  ? "—"
                  : `${profile.memoryGb.toFixed(0)} GB`}
              </strong>
              <small>Used for 3D models and calculations</small>
            </div>
            <div className="setup-machine">
              <span>EXTRA TOOLS</span>
              <strong>{profile === null ? "…" : `${available}/${total}`}</strong>
              <small>Optional tools found on this computer</small>
            </div>
          </div>
          <ol className="setup-steps">
            <li className="setup-step setup-step--done">
              <span>1</span>
              <div>
                <strong>App basics</strong>
                <small>The 3D view and local project saving are ready</small>
              </div>
              <ShieldCheck size={17} />
            </li>
            <li
              className={
                profile?.capabilities.some((item) => item.id === "python" && item.available) ===
                true
                  ? "setup-step setup-step--done"
                  : "setup-step setup-step--warning"
              }
            >
              <span>2</span>
              <div>
                <strong>Calculation tools</strong>
                <small>
                  {profile?.capabilities.find((item) => item.id === "python")?.reason ??
                    "Checking the optional calculation helper"}
                </small>
              </div>
              <span className="setup-status">
                {profile?.capabilities.some((item) => item.id === "python" && item.available) ===
                true
                  ? "FOUND"
                  : "REVIEW"}
              </span>
            </li>
            <li className="setup-step">
              <span>3</span>
              <div>
                <strong>Advanced simulators</strong>
                <small>Optional setup for detailed wind and autopilot simulators</small>
              </div>
              <span className="setup-status">OPTIONAL</span>
            </li>
            <li className="setup-step">
              <span>4</span>
              <div>
                <strong>Another computer</strong>
                <small>Optional: run large calculations on a workstation or server</small>
              </div>
              <span className="setup-status">OPTIONAL</span>
            </li>
          </ol>
          <div className="setup-notice">
            <ShieldCheck size={17} />
            <span>
              <strong>Aerocel Forge will not download extra programs by itself.</strong> Advanced
              tools must pass a small test before they are shown as ready.
            </span>
            <InfoTip label="Why this matters" align="right">
              A found program is not always a working program. Aerocel Forge checks advanced tools
              before trusting their results.
            </InfoTip>
          </div>
        </div>
        <footer>
          <button
            type="button"
            className="button button--quiet"
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
          >
            Open advanced setup
          </button>
          <button type="button" className="button button--primary" onClick={onClose}>
            Continue to your files <ChevronRight size={16} />
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function App() {
  const [project, setProjectState] = useState<AerocelProject>(() =>
    createBlankProject("Untitled aircraft")
  );
  const [geometryAssets, setGeometryAssets] = useState<ReadonlyMap<string, TriangleMesh>>(
    () => new Map()
  );
  const [activeProjectFileName, setActiveProjectFileName] = useState<string | null>(null);
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([]);
  const [projectLibraryLoading, setProjectLibraryLoading] = useState(true);
  const [projectManagerOpen, setProjectManagerOpen] = useState(true);
  const [projectReady, setProjectReady] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>("geometry");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analysisOptions, setAnalysisOptions] = useState<AnalysisOptions>(defaultAnalysisOptions);
  const [viewportOptions, setViewportOptions] = useState<ViewportOptions>(defaultViewportOptions);
  const [systemProfile, setSystemProfile] = useState<SystemProfile | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({
    status: "idle",
    detail: "No file open"
  });
  const [commandOpen, setCommandOpen] = useState(false);
  const [geometryImportOpen, setGeometryImportOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(
    () => localStorage.getItem("aerocel.setup.dismissed") !== "true"
  );
  const [navigatorOpen, setNavigatorOpen] = useState(true);
  const [recentErrors, setRecentErrors] = useState<readonly string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [appFullscreen, setAppFullscreen] = useState(false);
  const [theme, setTheme] = useState<AppTheme>(readThemePreference);
  const [advancedMode, setAdvancedMode] = useState(readAdvancedPreference);
  const [partContextMenu, setPartContextMenu] = useState<PartContextMenuState | null>(null);
  const [deleteRequestId, setDeleteRequestId] = useState<string | null>(null);
  const projectRef = useRef(project);
  const undoStack = useRef<AerocelProject[]>([]);
  const redoStack = useRef<AerocelProject[]>([]);
  const lastHistoryChangeMs = useRef(0);
  const partClipboard = useRef<ComponentClipboard | null>(null);

  const setProject = useCallback<Dispatch<SetStateAction<AerocelProject>>>((update) => {
    const current = projectRef.current;
    const next = typeof update === "function" ? update(current) : update;
    if (next === current) return;
    const now = performance.now();
    if (now - lastHistoryChangeMs.current > 350) {
      undoStack.current.push(current);
      if (undoStack.current.length > 100) undoStack.current.shift();
    }
    lastHistoryChangeMs.current = now;
    redoStack.current = [];
    projectRef.current = next;
    setProjectState(next);
  }, []);

  const clearProjectHistory = useCallback((): void => {
    undoStack.current = [];
    redoStack.current = [];
    lastHistoryChangeMs.current = 0;
    partClipboard.current = null;
  }, []);

  const undoProject = useCallback((): void => {
    const previous = undoStack.current.pop();
    if (previous === undefined) {
      setToast("Nothing to undo yet.");
      return;
    }
    redoStack.current.push(projectRef.current);
    lastHistoryChangeMs.current = 0;
    projectRef.current = previous;
    setProjectState(previous);
    setToast("Undid the last aircraft change.");
  }, []);

  const redoProject = useCallback((): void => {
    const next = redoStack.current.pop();
    if (next === undefined) {
      setToast("Nothing to redo yet.");
      return;
    }
    undoStack.current.push(projectRef.current);
    lastHistoryChangeMs.current = 0;
    projectRef.current = next;
    setProjectState(next);
    setToast("Redid the aircraft change.");
  }, []);

  const visibleWorkspaces = useMemo(
    () => workspaces.filter((workspace) => advancedMode || workspace.advanced !== true),
    [advancedMode]
  );

  const activeDefinition =
    workspaces.find((workspace) => workspace.id === activeWorkspace) ??
    ({
      id: "home",
      label: "Project overview",
      shortLabel: "Home",
      icon: Home,
      group: "build"
    } satisfies WorkspaceDefinition);
  const selectedComponent: VehicleComponent | null =
    project.vehicle.components.find((component) => component.id === selectedId) ?? null;
  const deletionCheck = useMemo<{
    readonly plan: ComponentDeletionPlan | null;
    readonly blocker: string | null;
  }>(() => {
    if (deleteRequestId === null) return { plan: null, blocker: null };
    try {
      return { plan: planComponentDeletion(project, deleteRequestId), blocker: null };
    } catch (error: unknown) {
      return {
        plan: null,
        blocker: error instanceof Error ? error.message : "This part cannot be deleted."
      };
    }
  }, [deleteRequestId, project]);
  const analysisState = useMemo<{
    readonly analysis: ReturnType<typeof runRapidAnalysis> | null;
    readonly reason: string | null;
  }>(() => {
    if (project.vehicle.components.length === 0) {
      return { analysis: null, reason: "Import your aircraft model first." };
    }
    if (!project.vehicle.components.some((component) => (component.mass?.valueKg ?? 0) > 0)) {
      return { analysis: null, reason: "Add the real weight to at least one part." };
    }
    try {
      return {
        analysis: runRapidAnalysis(project, analysisOptions, geometryAssets),
        reason: null
      };
    } catch (error: unknown) {
      return {
        analysis: null,
        reason: error instanceof Error ? error.message : "The aircraft is not ready to calculate."
      };
    }
  }, [project, analysisOptions, geometryAssets]);
  const analysis = analysisState.analysis;

  useEffect(() => {
    localStorage.setItem("aerocel.theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("aerocel.advanced", String(advancedMode));
    const activeIsAdvanced = workspaces.some(
      (workspace) => workspace.id === activeWorkspace && workspace.advanced === true
    );
    if (!advancedMode && activeIsAdvanced) setActiveWorkspace("home");
  }, [activeWorkspace, advancedMode]);

  useEffect(() => {
    let cancelled = false;
    void listProjects()
      .then((savedProjects) => {
        if (!cancelled) setProjects(savedProjects.filter((item) => !isLegacyExampleProject(item)));
      })
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        if (!cancelled) setRecentErrors((current) => [...current, `Project list: ${detail}`]);
      })
      .finally(() => {
        if (!cancelled) setProjectLibraryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void getSystemProfile()
      .then(setSystemProfile)
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        setRecentErrors((current) => [...current, `Capability detection: ${detail}`]);
      });
  }, []);

  useEffect(() => {
    if (!isNativeDesktop()) {
      const syncBrowserFullscreen = (): void => {
        setAppFullscreen(document.fullscreenElement !== null);
      };
      document.addEventListener("fullscreenchange", syncBrowserFullscreen);
      syncBrowserFullscreen();
      return () => document.removeEventListener("fullscreenchange", syncBrowserFullscreen);
    }

    let disposed = false;
    let removeResizeListener: (() => void) | undefined;
    void import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        const appWindow = getCurrentWindow();
        const syncNativeFullscreen = async (): Promise<void> => {
          const fullscreen = await appWindow.isFullscreen();
          if (!disposed) setAppFullscreen(fullscreen);
        };
        await syncNativeFullscreen();
        const removeListener = await appWindow.onResized(() => {
          void syncNativeFullscreen();
        });
        if (disposed) removeListener();
        else removeResizeListener = removeListener;
      })
      .catch((error: unknown) => {
        if (disposed) return;
        const detail = error instanceof Error ? error.message : String(error);
        setRecentErrors((current) => [...current, `Fullscreen state: ${detail}`]);
      });
    return () => {
      disposed = true;
      removeResizeListener?.();
    };
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const shortcut = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const editingText = isTextEntryTarget(event.target);
      const aircraftShortcutAvailable =
        projectReady &&
        !projectManagerOpen &&
        !setupOpen &&
        !geometryImportOpen &&
        !commandOpen &&
        deleteRequestId === null;
      if (shortcut && key === "z" && !editingText && aircraftShortcutAvailable) {
        event.preventDefault();
        if (event.shiftKey) redoProject();
        else undoProject();
        return;
      }
      if (
        shortcut &&
        key === "c" &&
        !editingText &&
        aircraftShortcutAvailable &&
        selectedId !== null
      ) {
        const copied = copyComponentTree(project, selectedId);
        if (copied !== null) {
          event.preventDefault();
          partClipboard.current = copied;
          setToast(
            copied.components.length === 1
              ? "Part copied. Press Command-V to paste it."
              : `${copied.components.length} connected parts copied. Press Command-V to paste them.`
          );
        }
        return;
      }
      if (
        shortcut &&
        key === "v" &&
        !editingText &&
        aircraftShortcutAvailable &&
        partClipboard.current !== null
      ) {
        event.preventDefault();
        const pasted = pasteComponentTree(project, partClipboard.current);
        setProject(pasted.project);
        setSelectedId(pasted.selectedId);
        setActiveWorkspace("geometry");
        setToast(
          pasted.componentCount === 1
            ? "Part pasted and selected."
            : `${pasted.componentCount} connected parts pasted and selected.`
        );
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setProjectManagerOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        setProjectManagerOpen(true);
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "s" &&
        activeProjectFileName !== null
      ) {
        event.preventDefault();
        const updated = { ...project, updatedAt: new Date().toISOString() };
        setSaveState({ status: "saving", detail: "Saving…" });
        void saveProject(activeProjectFileName, updated)
          .then(() => setSaveState({ status: "saved", detail: "Saved now" }))
          .catch((error: unknown) => {
            const detail = error instanceof Error ? error.message : String(error);
            setSaveState({ status: "error", detail });
          });
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
        event.preventDefault();
        if (activeProjectFileName === null) {
          setProjectManagerOpen(true);
        } else {
          setActiveWorkspace("geometry");
          setGeometryImportOpen(true);
        }
      }
      if (event.key === "Escape") setCommandOpen(false);
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isTextEntryTarget(event.target) &&
        selectedId !== null &&
        !geometryImportOpen &&
        !setupOpen &&
        !projectManagerOpen &&
        !commandOpen &&
        deleteRequestId === null
      ) {
        event.preventDefault();
        setPartContextMenu(null);
        setDeleteRequestId(selectedId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    activeProjectFileName,
    commandOpen,
    deleteRequestId,
    geometryImportOpen,
    project,
    projectManagerOpen,
    projectReady,
    redoProject,
    selectedId,
    setProject,
    setupOpen,
    undoProject
  ]);

  useEffect(() => {
    if (!projectReady || activeProjectFileName === null) return;
    setSaveState({ status: "saving", detail: "Saving…" });
    const timer = window.setTimeout(() => {
      const updated = { ...project, updatedAt: new Date().toISOString() };
      void saveProject(activeProjectFileName, updated)
        .then(() =>
          setSaveState({
            status: "saved",
            detail: isNativeDesktop() ? "Saved locally" : "Saved in browser preview"
          })
        )
        .catch((error: unknown) => {
          const detail = error instanceof Error ? error.message : String(error);
          setSaveState({ status: "error", detail });
          setRecentErrors((current) => [...current, `Autosave: ${detail}`]);
        });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [activeProjectFileName, project, projectReady]);

  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const closeSetup = (): void => {
    localStorage.setItem("aerocel.setup.dismissed", "true");
    setSetupOpen(false);
  };

  const refreshProjectLibrary = async (): Promise<void> => {
    setProjects((await listProjects()).filter((item) => !isLegacyExampleProject(item)));
  };

  const saveCurrentNow = async (): Promise<void> => {
    if (!projectReady || activeProjectFileName === null) return;
    const updated = { ...project, updatedAt: new Date().toISOString() };
    setSaveState({ status: "saving", detail: "Saving…" });
    await saveProject(activeProjectFileName, updated);
    setSaveState({ status: "saved", detail: "Saved now" });
  };

  const loadProjectGeometry = async (
    restored: AerocelProject
  ): Promise<ReadonlyMap<string, TriangleMesh>> => {
    const restoredAssets = new Map<string, TriangleMesh>();
    for (const component of restored.vehicle.components) {
      const sha = component.geometry.sourceSha256;
      const sourceName = component.properties.sourceFileName;
      if (sha === null || typeof sourceName !== "string") continue;
      try {
        const file = await loadGeometrySource(sourceName, sha);
        if (file === null) continue;
        const inspection = await inspectGeometryFile(file, {
          requestedFormat: "auto",
          originalUnits: component.geometry.originalUnits
        });
        if (inspection.mesh !== null) restoredAssets.set(sha, inspection.mesh);
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        setRecentErrors((current) => [...current, `Geometry restore ${component.name}: ${detail}`]);
      }
    }
    return restoredAssets;
  };

  const createProjectFile = async (name: string): Promise<void> => {
    await saveCurrentNow();
    const blank = createBlankProject(name);
    const allSavedProjects = await listProjects();
    const fileName = uniqueProjectFileName(
      name,
      allSavedProjects.map((item) => item.fileName)
    );
    await saveProject(fileName, blank);
    setProjectReady(false);
    clearProjectHistory();
    projectRef.current = blank;
    setProjectState(blank);
    setGeometryAssets(new Map());
    setSelectedId(null);
    setActiveProjectFileName(fileName);
    setActiveWorkspace("geometry");
    setSaveState({ status: "saved", detail: "New empty file saved" });
    setProjectReady(true);
    await refreshProjectLibrary();
    setProjectManagerOpen(false);
    setGeometryImportOpen(true);
  };

  const openProjectFile = async (fileName: string): Promise<void> => {
    if (fileName === activeProjectFileName) {
      setProjectManagerOpen(false);
      return;
    }
    await saveCurrentNow();
    const restored = await loadProject(fileName);
    const restoredAssets = await loadProjectGeometry(restored);
    setProjectReady(false);
    clearProjectHistory();
    projectRef.current = restored;
    setProjectState(restored);
    setGeometryAssets(restoredAssets);
    setSelectedId(restored.vehicle.components[0]?.id ?? null);
    setActiveProjectFileName(fileName);
    setActiveWorkspace(restored.vehicle.components.length === 0 ? "geometry" : "home");
    setSaveState({ status: "saved", detail: "Saved file opened" });
    setProjectReady(true);
    setProjectManagerOpen(false);
  };

  const deleteProjectFile = async (fileName: string): Promise<void> => {
    if (fileName === activeProjectFileName) {
      throw new Error("Open another file before deleting the file you are using.");
    }
    await deleteProject(fileName);
    await refreshProjectLibrary();
  };

  const setTiltAngle = (jointId: string, angleRad: number): void => {
    setProject((current) => ({
      ...current,
      vehicle: {
        ...current.vehicle,
        joints: current.vehicle.joints.map((joint) =>
          joint.id === jointId ? { ...joint, commandedRad: angleRad, actualRad: angleRad } : joint
        )
      }
    }));
  };

  const toggleAppFullscreen = async (): Promise<void> => {
    try {
      if (isNativeDesktop()) {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        const nextFullscreen = !(await appWindow.isFullscreen());
        await appWindow.setFullscreen(nextFullscreen);
        setAppFullscreen(nextFullscreen);
        return;
      }
      if (document.fullscreenElement === null) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      setToast(`Could not change fullscreen mode: ${detail}`);
    }
  };

  const changeAdvancedMode = (enabled: boolean): void => {
    setAdvancedMode(enabled);
    setToast(
      enabled
        ? "Advanced tools are now visible. Technical names and settings are shown."
        : "Simple mode is on. Your project and advanced settings were not deleted."
    );
  };

  const openPartContextMenu = (id: string, clientX: number, clientY: number): void => {
    const component = project.vehicle.components.find((item) => item.id === id);
    if (component === undefined) return;
    setSelectedId(id);
    setPartContextMenu({ id, name: component.name, clientX, clientY });
  };

  const editPart = (id: string): void => {
    const component = project.vehicle.components.find((item) => item.id === id);
    if (component === undefined) return;
    setSelectedId(id);
    setActiveWorkspace("geometry");
    setPartContextMenu(null);
    setToast(`${component.name} is ready to edit in the panel on the right.`);
  };

  const requestPartDelete = (id: string): void => {
    setSelectedId(id);
    setPartContextMenu(null);
    setDeleteRequestId(id);
  };

  const confirmPartDelete = (): void => {
    const plan = deletionCheck.plan;
    if (plan === null) return;
    const updated = applyComponentDeletion(project, plan);
    const remainingGeometryHashes = new Set(
      updated.vehicle.components
        .map((component) => component.geometry.sourceSha256)
        .filter((sha): sha is string => sha !== null)
    );
    setProject(updated);
    setGeometryAssets(
      (current) => new Map([...current].filter(([sha]) => remainingGeometryHashes.has(sha)))
    );
    setSelectedId(updated.vehicle.components[0]?.id ?? null);
    setDeleteRequestId(null);
    setToast(
      `${plan.rootName} was deleted${plan.componentIds.length > 1 ? ` with ${plan.componentIds.length - 1} attached part${plan.componentIds.length === 2 ? "" : "s"}` : ""}.`
    );
  };

  return (
    <div
      className="app-shell"
      data-theme={theme}
      data-experience={advancedMode ? "advanced" : "simple"}
    >
      <header className="titlebar" data-tauri-drag-region>
        <div className="titlebar-product" data-tauri-drag-region>
          <strong>Aerocel Forge</strong>
        </div>
        <FileMenu
          hasActiveProject={activeProjectFileName !== null}
          onNewProject={() => setProjectManagerOpen(true)}
          onOpenProjects={() => setProjectManagerOpen(true)}
          onSave={() => {
            void saveCurrentNow().catch((error: unknown) => {
              const detail = error instanceof Error ? error.message : String(error);
              setSaveState({ status: "error", detail });
              setToast(`Could not save: ${detail}`);
            });
          }}
          onImportModel={() => {
            setActiveWorkspace("geometry");
            setGeometryImportOpen(true);
          }}
        />
        <div className="titlebar-path" data-tauri-drag-region>
          <span>{project.name}</span>
          <ChevronRight size={13} />
          <strong>{activeDefinition.label}</strong>
        </div>
        <div className="titlebar-actions">
          <button
            className="mode-chip"
            type="button"
            onClick={() => setActiveWorkspace("settings")}
          >
            <span className="mode-chip__dot" />
            {isNativeDesktop() ? "Desktop app" : "Web preview"}
          </button>
          <button
            className="preference-chip"
            type="button"
            aria-label={`Switch to ${theme === "bright" ? "cockpit" : "bright"} theme`}
            title={`Theme: ${theme === "bright" ? "Bright" : "Cockpit"}`}
            onClick={() => setTheme((current) => (current === "bright" ? "cockpit" : "bright"))}
          >
            {theme === "bright" ? <Sun size={14} /> : <Gauge size={14} />}
            <span>{theme === "bright" ? "Bright" : "Cockpit"}</span>
          </button>
          <button
            className={`preference-chip ${advancedMode ? "preference-chip--active" : ""}`}
            type="button"
            aria-pressed={advancedMode}
            title="Show or hide specialist tools"
            onClick={() => changeAdvancedMode(!advancedMode)}
          >
            <SlidersHorizontal size={14} />
            <span>{advancedMode ? "Advanced" : "Simple"}</span>
          </button>
          <div className={`save-state save-state--${saveState.status}`} title={saveState.detail}>
            <Save size={13} />
            <span>
              {saveState.status === "saving"
                ? "Saving"
                : saveState.status === "error"
                  ? "Save failed"
                  : activeProjectFileName === null
                    ? "No file"
                    : "Autosaved"}
            </span>
          </div>
          <button
            className="titlebar-icon-button"
            type="button"
            aria-label={
              appFullscreen ? "Exit application fullscreen" : "Enter application fullscreen"
            }
            aria-pressed={appFullscreen}
            title={appFullscreen ? "Exit full screen" : "Full screen"}
            onClick={() => void toggleAppFullscreen()}
          >
            {appFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button className="command-trigger" type="button" onClick={() => setCommandOpen(true)}>
            <Command size={14} />
            <span>Find</span>
            <kbd>⌘K</kbd>
          </button>
        </div>
      </header>
      <div
        className={`workspace-shell ${navigatorOpen ? "" : "workspace-shell--navigator-hidden"}`}
      >
        <ActivityRail
          active={activeWorkspace}
          onChange={setActiveWorkspace}
          items={visibleWorkspaces}
        />
        {navigatorOpen && (
          <ComponentNavigator
            project={project}
            selectedId={selectedId}
            onToggle={() => setNavigatorOpen(false)}
            onPartContextMenu={openPartContextMenu}
            onSelect={(id) => {
              setSelectedId(id);
              setActiveWorkspace("geometry");
            }}
          />
        )}
        <main className="workspace-main">
          <WorkspaceContent
            workspace={activeWorkspace}
            project={project}
            setProject={setProject}
            selectedComponent={selectedComponent}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onPartContextMenu={openPartContextMenu}
            onRequestPartDelete={requestPartDelete}
            analysis={analysis}
            analysisUnavailableReason={analysisState.reason}
            analysisOptions={analysisOptions}
            setAnalysisOptions={setAnalysisOptions}
            viewportOptions={viewportOptions}
            setViewportOptions={setViewportOptions}
            systemProfile={systemProfile}
            recentErrors={recentErrors}
            setTiltAngle={setTiltAngle}
            onOpenSetup={() => setSetupOpen(true)}
            onNavigate={setActiveWorkspace}
            geometryImportOpen={geometryImportOpen}
            onRequestGeometryImport={() => setGeometryImportOpen(true)}
            onCloseGeometryImport={() => setGeometryImportOpen(false)}
            geometryAssets={geometryAssets}
            onGeometryAsset={(sourceSha256, mesh) =>
              setGeometryAssets((current) => {
                const updated = new Map(current);
                updated.set(sourceSha256, mesh);
                return updated;
              })
            }
            notify={setToast}
            theme={theme}
            setTheme={setTheme}
            advancedMode={advancedMode}
            setAdvancedMode={changeAdvancedMode}
          />
        </main>
      </div>
      <footer className="statusbar">
        <button
          type="button"
          onClick={() => setNavigatorOpen((current) => !current)}
          title="Toggle assembly navigator"
        >
          <PanelLeftClose size={13} />
          <span>
            {project.vehicle.components.length} component
            {project.vehicle.components.length === 1 ? "" : "s"}
          </span>
        </button>
        <span className="status-divider" />
        {advancedMode ? (
          <>
            <span>
              <strong>BODY</strong> FRD
            </span>
            <span>
              <strong>WORLD</strong> NED
            </span>
            <span>
              <strong>UNITS</strong> SI internal
            </span>
          </>
        ) : (
          <span>
            <strong>MEASUREMENTS</strong> metres · kilograms · seconds
          </span>
        )}
        <span className="status-spacer" />
        <span className="status-honesty">
          <ShieldCheck size={13} /> Early estimate · not an aircraft safety approval
        </span>
        <span className="status-divider" />
        <span>
          {analysis === null ? "Aircraft setup needed" : `${analysis.mass.massKg.toFixed(2)} kg`}
        </span>
      </footer>
      <PartContextMenu
        menu={partContextMenu}
        onClose={() => setPartContextMenu(null)}
        onEdit={editPart}
        onDelete={requestPartDelete}
      />
      <DeletePartDialog
        open={deleteRequestId !== null}
        plan={deletionCheck.plan}
        blocker={deletionCheck.blocker}
        onClose={() => setDeleteRequestId(null)}
        onConfirm={confirmPartDelete}
      />
      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        onNavigate={setActiveWorkspace}
        items={visibleWorkspaces}
      />
      <SetupWizard
        open={setupOpen}
        profile={systemProfile}
        onClose={closeSetup}
        onOpenSettings={() => setActiveWorkspace("settings")}
      />
      <ProjectManagerDialog
        open={projectManagerOpen}
        projects={projects}
        activeFileName={activeProjectFileName}
        loading={projectLibraryLoading}
        canClose={activeProjectFileName !== null}
        onClose={() => setProjectManagerOpen(false)}
        onCreate={createProjectFile}
        onOpen={openProjectFile}
        onDelete={deleteProjectFile}
      />
      {toast !== null && (
        <div className="toast" role="status">
          <ShieldCheck size={16} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
