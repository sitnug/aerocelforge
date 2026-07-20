import { invoke } from "@tauri-apps/api/core";
import type { AerocelProject } from "@aerocel/simulation-schema";
import { parseProject } from "@aerocel/simulation-schema";

export interface ToolCapability {
  readonly id: string;
  readonly name: string;
  readonly available: boolean;
  readonly version: string | null;
  readonly executablePath: string | null;
  readonly mode: "native_mac" | "local_linux" | "remote_linux";
  readonly reason: string;
}

export interface SystemProfile {
  readonly operatingSystem: string;
  readonly architecture: string;
  readonly memoryGb: number;
  readonly availableDiskGb: number;
  readonly onBattery: boolean | null;
  readonly capabilities: readonly ToolCapability[];
}

export interface ProjectSummary {
  readonly fileName: string;
  readonly name: string;
  readonly revision: string;
  readonly updatedAt: string;
}

export const isNativeDesktop = (): boolean => window.__TAURI_INTERNALS__ !== undefined;

const browserCapabilities: readonly ToolCapability[] = [
  {
    id: "webgl",
    name: "WebGL renderer",
    available: true,
    version: null,
    executablePath: null,
    mode: "native_mac",
    reason: "Browser preview renderer is active"
  },
  ...["openvsp", "vspaero", "openfoam", "su2", "jsbsim", "px4", "gazebo"].map(
    (id): ToolCapability => ({
      id,
      name: id.toUpperCase(),
      available: false,
      version: null,
      executablePath: null,
      mode: id === "openfoam" || id === "px4" || id === "gazebo" ? "local_linux" : "native_mac",
      reason: "Native capability detection is available in the Tauri application"
    })
  )
];

export async function getSystemProfile(): Promise<SystemProfile> {
  if (isNativeDesktop()) return invoke<SystemProfile>("system_profile");
  return Promise.resolve({
    operatingSystem: navigator.userAgent,
    architecture: "browser-preview",
    memoryGb: typeof navigator.deviceMemory === "number" ? navigator.deviceMemory : 0,
    availableDiskGb: 0,
    onBattery: null,
    capabilities: browserCapabilities
  });
}

export async function saveProject(fileName: string, project: AerocelProject): Promise<string> {
  if (isNativeDesktop()) {
    return invoke<string>("save_project", { fileName, project });
  }
  const key = `aerocel.project.${fileName}`;
  localStorage.setItem(key, JSON.stringify(project));
  return `browser-storage://${key}`;
}

export async function loadProject(fileName: string): Promise<AerocelProject> {
  if (isNativeDesktop()) {
    return parseProject(await invoke<unknown>("load_project", { fileName }));
  }
  const value = localStorage.getItem(`aerocel.project.${fileName}`);
  if (value === null) throw new Error(`No browser project named ${fileName} exists`);
  return parseProject(JSON.parse(value) as unknown);
}

export async function listProjects(): Promise<readonly ProjectSummary[]> {
  if (isNativeDesktop()) return invoke<ProjectSummary[]>("list_projects");
  return Object.keys(localStorage)
    .filter((key) => key.startsWith("aerocel.project."))
    .flatMap((key) => {
      try {
        const project = parseProject(JSON.parse(localStorage.getItem(key) ?? "null") as unknown);
        return [
          {
            fileName: key.replace("aerocel.project.", ""),
            name: project.name,
            revision: project.revision,
            updatedAt: project.updatedAt
          }
        ];
      } catch {
        return [];
      }
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function deleteProject(fileName: string): Promise<void> {
  if (isNativeDesktop()) {
    await invoke("delete_project", { fileName });
    return;
  }
  localStorage.removeItem(`aerocel.project.${fileName}`);
}

function downloadText(fileName: string, content: string, mimeType: string): string {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
  return fileName;
}

export async function writeReport(fileName: string, html: string): Promise<string> {
  if (isNativeDesktop()) return invoke<string>("write_report", { fileName, html });
  return Promise.resolve(
    downloadText(`${fileName.replace(/\.html$/u, "")}.html`, html, "text/html")
  );
}

function openAssetDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("aerocel-forge-assets", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("geometry")) {
        request.result.createObjectStore("geometry");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open geometry archive"));
  });
}

export async function archiveGeometrySource(file: File, sourceSha256: string): Promise<string> {
  const buffer = await file.arrayBuffer();
  if (isNativeDesktop()) {
    return invoke<string>("archive_geometry_source", {
      fileName: file.name,
      sourceSha256,
      bytes: [...new Uint8Array(buffer)]
    });
  }
  const database = await openAssetDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("geometry", "readwrite");
    transaction.objectStore("geometry").put(
      {
        fileName: file.name,
        mimeType: file.type,
        sourceSha256,
        bytes: buffer
      },
      sourceSha256
    );
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Could not archive geometry source"));
  });
  database.close();
  return `browser-import://${sourceSha256}/${encodeURIComponent(file.name)}`;
}

export async function loadGeometrySource(
  fileName: string,
  sourceSha256: string
): Promise<File | null> {
  if (isNativeDesktop()) {
    const bytes = await invoke<number[]>("load_geometry_source", { fileName, sourceSha256 });
    return new File([new Uint8Array(bytes)], fileName);
  }
  const database = await openAssetDatabase();
  const record = await new Promise<
    | {
        readonly fileName: string;
        readonly mimeType: string;
        readonly sourceSha256: string;
        readonly bytes: ArrayBuffer;
      }
    | undefined
  >((resolve, reject) => {
    const transaction = database.transaction("geometry", "readonly");
    const request = transaction.objectStore("geometry").get(sourceSha256);
    request.onsuccess = () => resolve(request.result as typeof record);
    request.onerror = () => reject(request.error ?? new Error("Could not restore geometry source"));
  });
  database.close();
  if (record === undefined || record.sourceSha256 !== sourceSha256) return null;
  return new File([record.bytes], record.fileName, { type: record.mimeType });
}

export async function createDiagnosticBundle(
  projectName: string,
  recentErrors: readonly string[]
): Promise<string> {
  if (isNativeDesktop()) {
    return invoke<string>("create_diagnostic_bundle", {
      request: { appVersion: "1.0.0", projectName, recentErrors }
    });
  }
  const content = JSON.stringify(
    {
      appVersion: "1.0.0",
      projectName,
      generatedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      recentErrors: recentErrors.map((error) => error.replaceAll("PRIVATE KEY", "[REDACTED]")),
      notice: "Secrets, geometry, result fields, and SSH private keys are excluded."
    },
    null,
    2
  );
  return Promise.resolve(downloadText("aerocel-diagnostics.json", content, "application/json"));
}

export async function hashText(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

declare global {
  interface Navigator {
    readonly deviceMemory?: number;
  }
}
