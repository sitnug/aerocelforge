import type { AerocelProject, VehicleComponent } from "@aerocel/simulation-schema";
import {
  Box,
  ChartNoAxesCombined,
  ChevronRight,
  CircleDotDashed,
  CloudCog,
  Command,
  Cpu,
  Fan,
  FileText,
  Gauge,
  GitCompareArrows,
  Home,
  Layers3,
  Map,
  PanelLeftClose,
  PlaneTakeoff,
  Save,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Wind,
  X,
  type LucideIcon
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { runRapidAnalysis, defaultAnalysisOptions, type AnalysisOptions } from "./lib/analysis";
import { kestrelProject } from "./lib/kestrel";
import { getSystemProfile, isNativeDesktop, saveProject, type SystemProfile } from "./lib/native";
import { WorkspaceContent } from "./components/WorkspaceContent";
import type { ViewportOptions } from "./components/AircraftViewport";
import "./styles.css";

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
}

const workspaces: readonly WorkspaceDefinition[] = [
  { id: "home", label: "Project overview", shortLabel: "Home", icon: Home, group: "build" },
  { id: "geometry", label: "Geometry", shortLabel: "Geometry", icon: Box, group: "build" },
  {
    id: "components",
    label: "Components & joints",
    shortLabel: "Components",
    icon: Layers3,
    group: "build"
  },
  { id: "mass", label: "Materials & mass", shortLabel: "Mass", icon: Scale, group: "build" },
  { id: "propulsion", label: "Propulsion", shortLabel: "Propulsion", icon: Fan, group: "analyze" },
  {
    id: "aero",
    label: "Rapid aerodynamics",
    shortLabel: "Rapid aero",
    icon: Wind,
    group: "analyze"
  },
  { id: "cfd", label: "CFD wind tunnel", shortLabel: "CFD", icon: CloudCog, group: "analyze" },
  { id: "flight", label: "Flight dynamics", shortLabel: "Flight", icon: Gauge, group: "analyze" },
  {
    id: "transition",
    label: "VTOL transition",
    shortLabel: "Transition",
    icon: PlaneTakeoff,
    group: "analyze"
  },
  { id: "px4", label: "PX4 simulation", shortLabel: "PX4", icon: Cpu, group: "analyze" },
  {
    id: "mission",
    label: "Mission simulation",
    shortLabel: "Mission",
    icon: Map,
    group: "analyze"
  },
  {
    id: "optimization",
    label: "Optimization",
    shortLabel: "Optimize",
    icon: ChartNoAxesCombined,
    group: "verify"
  },
  {
    id: "results",
    label: "Results comparison",
    shortLabel: "Compare",
    icon: GitCompareArrows,
    group: "verify"
  },
  {
    id: "validation",
    label: "Validation",
    shortLabel: "Validation",
    icon: ShieldCheck,
    group: "verify"
  },
  { id: "reports", label: "Reports", shortLabel: "Reports", icon: FileText, group: "verify" },
  {
    id: "settings",
    label: "Settings & solvers",
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

function ActivityRail({
  active,
  onChange
}: {
  readonly active: WorkspaceId;
  readonly onChange: (workspace: WorkspaceId) => void;
}) {
  return (
    <nav className="activity-rail" aria-label="Engineering workspaces">
      <div className="activity-logo" aria-label="Aerocel Forge">
        <span className="activity-logo__wing" />
        <span className="activity-logo__core" />
      </div>
      <div className="activity-scroll">
        {workspaces.map((workspace, index) => {
          const Icon = workspace.icon;
          const showDivider = index > 0 && workspaces[index - 1]?.group !== workspace.group;
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
  onSelect
}: {
  readonly project: AerocelProject;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}) {
  const groups = [
    {
      label: "Airframe",
      types: ["fuselage", "wing", "horizontal_stabilizer", "vertical_stabilizer"]
    },
    { label: "Propulsion", types: ["motor", "propeller", "rotor", "tilt_mechanism"] },
    { label: "Systems", types: ["battery", "payload", "sensor", "flight_controller"] }
  ] as const;
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
        >
          <PanelLeftClose size={14} />
        </button>
      </div>
      <div className="component-tree">
        {groups.map((group) => {
          const components = project.vehicle.components.filter((component) =>
            group.types.includes(component.type as never)
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
          Example inputs
          <br />
          <small>Not experimentally validated</small>
        </span>
      </div>
    </aside>
  );
}

function CommandPalette({
  open,
  onClose,
  onNavigate
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onNavigate: (workspace: WorkspaceId) => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);
  if (!open) return null;
  const matches = workspaces.filter((workspace) =>
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
            placeholder="Go to a workspace…"
            aria-label="Search commands"
          />
          <kbd>esc</kbd>
        </div>
        <div className="command-results">
          <small>WORKSPACES</small>
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
            <small>FIRST-RUN SETUP</small>
            <h2 id="setup-title">Prepare this Mac for engineering work</h2>
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
              <span>HOST</span>
              <strong>{profile?.architecture ?? "Detecting…"}</strong>
              <small>{profile?.operatingSystem ?? "Reading local capabilities"}</small>
            </div>
            <div className="setup-machine">
              <span>MEMORY</span>
              <strong>
                {profile === null || profile.memoryGb === 0
                  ? "—"
                  : `${profile.memoryGb.toFixed(0)} GB`}
              </strong>
              <small>Light and moderate jobs are scheduled locally</small>
            </div>
            <div className="setup-machine">
              <span>CAPABILITIES</span>
              <strong>{profile === null ? "…" : `${available}/${total}`}</strong>
              <small>Detected, not yet solver-verified</small>
            </div>
          </div>
          <ol className="setup-steps">
            <li className="setup-step setup-step--done">
              <span>1</span>
              <div>
                <strong>Native workspace</strong>
                <small>Tauri host, WebGL renderer, managed project storage</small>
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
                <strong>Scientific runtime</strong>
                <small>
                  {profile?.capabilities.find((item) => item.id === "python")?.reason ??
                    "Checking Python"}
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
                <strong>Linux solver environment</strong>
                <small>Docker, Colima, Lima, or OrbStack for OpenFOAM, PX4, and Gazebo</small>
              </div>
              <span className="setup-status">OPTIONAL</span>
            </li>
            <li className="setup-step">
              <span>4</span>
              <div>
                <strong>Remote solver host</strong>
                <small>
                  SSH capability is detected now; credentials remain in your keychain or SSH agent
                </small>
              </div>
              <span className="setup-status">OPTIONAL</span>
            </li>
          </ol>
          <div className="setup-notice">
            <ShieldCheck size={17} />
            <span>
              <strong>No unverified binaries are downloaded automatically.</strong> Solver
              verification cases must pass before a backend is marked ready.
            </span>
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
            Review solver setup
          </button>
          <button type="button" className="button button--primary" onClick={onClose}>
            Explore Kestrel example <ChevronRight size={16} />
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function App() {
  const [project, setProject] = useState<AerocelProject>(kestrelProject);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>("geometry");
  const [selectedId, setSelectedId] = useState<string | null>(
    project.vehicle.components[1]?.id ?? null
  );
  const [analysisOptions, setAnalysisOptions] = useState<AnalysisOptions>(defaultAnalysisOptions);
  const [viewportOptions, setViewportOptions] = useState<ViewportOptions>(defaultViewportOptions);
  const [systemProfile, setSystemProfile] = useState<SystemProfile | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({
    status: "idle",
    detail: "Example loaded"
  });
  const [commandOpen, setCommandOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(
    () => localStorage.getItem("aerocel.setup.dismissed") !== "true"
  );
  const [navigatorOpen, setNavigatorOpen] = useState(true);
  const [recentErrors, setRecentErrors] = useState<readonly string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

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
  const analysis = useMemo(
    () => runRapidAnalysis(project, analysisOptions),
    [project, analysisOptions]
  );

  useEffect(() => {
    void getSystemProfile()
      .then(setSystemProfile)
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        setRecentErrors((current) => [...current, `Capability detection: ${detail}`]);
      });
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }
      if (event.key === "Escape") setCommandOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    setSaveState({ status: "saving", detail: "Saving…" });
    const timer = window.setTimeout(() => {
      const updated = { ...project, updatedAt: new Date().toISOString() };
      void saveProject("Kestrel Baseline", updated)
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
  }, [project]);

  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const closeSetup = (): void => {
    localStorage.setItem("aerocel.setup.dismissed", "true");
    setSetupOpen(false);
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

  return (
    <div className="app-shell">
      <header className="titlebar" data-tauri-drag-region>
        <div className="titlebar-product" data-tauri-drag-region>
          <strong>Aerocel Forge</strong>
          <span>0.1.0 engineering preview</span>
        </div>
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
            <span className="mode-chip__dot" /> MODE A · NATIVE MAC
          </button>
          <div className={`save-state save-state--${saveState.status}`} title={saveState.detail}>
            <Save size={13} />
            <span>
              {saveState.status === "saving"
                ? "Saving"
                : saveState.status === "error"
                  ? "Save failed"
                  : "Autosaved"}
            </span>
          </div>
          <button className="command-trigger" type="button" onClick={() => setCommandOpen(true)}>
            <Command size={14} />
            <span>Command</span>
            <kbd>⌘K</kbd>
          </button>
        </div>
      </header>
      <div
        className={`workspace-shell ${navigatorOpen ? "" : "workspace-shell--navigator-hidden"}`}
      >
        <ActivityRail active={activeWorkspace} onChange={setActiveWorkspace} />
        {navigatorOpen && (
          <ComponentNavigator
            project={project}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              if (activeWorkspace === "home") setActiveWorkspace("geometry");
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
            analysis={analysis}
            analysisOptions={analysisOptions}
            setAnalysisOptions={setAnalysisOptions}
            viewportOptions={viewportOptions}
            setViewportOptions={setViewportOptions}
            systemProfile={systemProfile}
            recentErrors={recentErrors}
            setTiltAngle={setTiltAngle}
            onOpenSetup={() => setSetupOpen(true)}
            notify={setToast}
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
          <span>{project.vehicle.components.length} components</span>
        </button>
        <span className="status-divider" />
        <span>
          <strong>BODY</strong> FRD
        </span>
        <span>
          <strong>WORLD</strong> NED
        </span>
        <span>
          <strong>UNITS</strong> SI internal
        </span>
        <span className="status-spacer" />
        <span className="status-honesty">
          <ShieldCheck size={13} /> Preliminary example · not airworthiness certification
        </span>
        <span className="status-divider" />
        <span>{analysis.mass.massKg.toFixed(2)} kg</span>
      </footer>
      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        onNavigate={setActiveWorkspace}
      />
      <SetupWizard
        open={setupOpen}
        profile={systemProfile}
        onClose={closeSetup}
        onOpenSettings={() => setActiveWorkspace("settings")}
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
