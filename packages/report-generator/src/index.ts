import type { AerocelProject } from "@aerocel/simulation-schema";

export interface ReproducibilityManifest {
  readonly aerocelForgeVersion: string;
  readonly gitCommit: string;
  readonly operatingSystem: string;
  readonly generatedAt: string;
  readonly projectInputHash: string;
  readonly configurationHash: string;
  readonly randomSeeds: readonly number[];
  readonly solvers: readonly {
    readonly name: string;
    readonly version: string;
    readonly mode: string;
  }[];
}

export interface ReportResult {
  readonly name: string;
  readonly value: string;
  readonly provenance: string;
  readonly fidelity: string;
  readonly quality: string;
  readonly uncertainty: string;
  readonly warning: string;
}

export interface EngineeringReportInput {
  readonly project: AerocelProject;
  readonly manifest: ReproducibilityManifest;
  readonly results: readonly ReportResult[];
  readonly validationSummary: readonly string[];
  readonly warnings: readonly string[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function generateEngineeringReportHtml(input: EngineeringReportInput): string {
  const componentRows = input.project.vehicle.components
    .map(
      (component) =>
        `<tr><td>${escapeHtml(component.name)}</td><td>${escapeHtml(component.type)}</td><td>${
          component.mass === null ? "Not assigned" : `${component.mass.valueKg.toFixed(3)} kg`
        }</td><td>${escapeHtml(component.mass?.provenance ?? "not available")}</td></tr>`
    )
    .join("");
  const resultRows = input.results
    .map(
      (result) =>
        `<tr><td>${escapeHtml(result.name)}</td><td>${escapeHtml(result.value)}</td><td>${escapeHtml(
          result.provenance
        )}</td><td>${escapeHtml(result.fidelity)}</td><td>${escapeHtml(result.quality)}</td><td>${escapeHtml(
          result.uncertainty
        )}</td><td>${escapeHtml(result.warning)}</td></tr>`
    )
    .join("");
  const solverRows = input.manifest.solvers
    .map(
      (solver) =>
        `<tr><td>${escapeHtml(solver.name)}</td><td>${escapeHtml(solver.version)}</td><td>${escapeHtml(
          solver.mode
        )}</td></tr>`
    )
    .join("");
  const list = (items: readonly string[]): string =>
    items.length === 0
      ? "<p>None recorded.</p>"
      : `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.project.name)} — Aerocel Forge Engineering Report</title>
  <style>
    :root { color-scheme: light; --ink:#15201f; --muted:#566663; --line:#d9e0de; --accent:#146b5b; }
    * { box-sizing:border-box; } body { margin:0; font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); background:#eef2f0; }
    main { max-width:1040px; margin:32px auto; background:white; padding:52px 60px; box-shadow:0 12px 42px #1b322c1a; }
    h1 { margin:0; font-size:36px; letter-spacing:-.04em; } h2 { margin:38px 0 10px; border-bottom:1px solid var(--line); padding-bottom:8px; }
    .eyebrow { color:var(--accent); font-weight:700; letter-spacing:.12em; text-transform:uppercase; font-size:11px; }
    .meta { color:var(--muted); display:grid; grid-template-columns:repeat(3,1fr); gap:10px 24px; margin:24px 0; }
    table { width:100%; border-collapse:collapse; font-size:12px; } th,td { padding:8px 10px; border:1px solid var(--line); text-align:left; vertical-align:top; } th { background:#f4f7f6; }
    code { overflow-wrap:anywhere; } .notice { margin-top:36px; padding:14px 16px; border-left:3px solid #bd6b16; background:#fff7ed; }
    @media print { body { background:white; } main { margin:0; max-width:none; box-shadow:none; padding:18mm; } }
  </style>
</head>
<body><main>
  <p class="eyebrow">Aerocel Forge / Engineering report</p>
  <h1>${escapeHtml(input.project.name)}</h1>
  <p>${escapeHtml(input.project.description)}</p>
  <div class="meta">
    <span><strong>Revision</strong><br>${escapeHtml(input.project.revision)}</span>
    <span><strong>Schema</strong><br>${escapeHtml(input.project.schemaVersion)}</span>
    <span><strong>Generated</strong><br>${escapeHtml(input.manifest.generatedAt)}</span>
    <span><strong>Body / world</strong><br>FRD / NED</span>
    <span><strong>Internal units</strong><br>SI</span>
    <span><strong>Input hash</strong><br><code>${escapeHtml(input.manifest.projectInputHash)}</code></span>
  </div>
  <h2>Vehicle configuration</h2>
  <p>Reference area ${input.project.vehicle.reference.areaM2.toFixed(3)} m²; span ${input.project.vehicle.reference.spanM.toFixed(3)} m; mean chord ${input.project.vehicle.reference.chordM.toFixed(3)} m. Reference values are ${escapeHtml(input.project.vehicle.reference.provenance.replaceAll("_", " "))}.</p>
  <table><thead><tr><th>Component</th><th>Semantic type</th><th>Mass</th><th>Mass source</th></tr></thead><tbody>${componentRows}</tbody></table>
  <h2>Engineering results</h2>
  ${resultRows.length === 0 ? "<p>No analysis result was selected for this report. No values have been inferred.</p>" : `<table><thead><tr><th>Metric</th><th>Value</th><th>Source</th><th>Fidelity</th><th>Quality</th><th>Uncertainty</th><th>Warning</th></tr></thead><tbody>${resultRows}</tbody></table>`}
  <h2>Validation status</h2>${list(input.validationSummary)}
  <h2>Warnings and model limits</h2>${list([...input.project.warnings, ...input.warnings])}
  <h2>Reproducibility manifest</h2>
  <table><tbody>
    <tr><th>Aerocel Forge</th><td>${escapeHtml(input.manifest.aerocelForgeVersion)}</td></tr>
    <tr><th>Git commit</th><td><code>${escapeHtml(input.manifest.gitCommit)}</code></td></tr>
    <tr><th>Operating system</th><td>${escapeHtml(input.manifest.operatingSystem)}</td></tr>
    <tr><th>Configuration hash</th><td><code>${escapeHtml(input.manifest.configurationHash)}</code></td></tr>
    <tr><th>Random seeds</th><td>${input.manifest.randomSeeds.join(", ") || "None"}</td></tr>
  </tbody></table>
  <h2>Solver inventory</h2>
  ${solverRows.length === 0 ? "<p>No external solver contributed to this report.</p>" : `<table><thead><tr><th>Solver</th><th>Version</th><th>Execution mode</th></tr></thead><tbody>${solverRows}</tbody></table>`}
  <p class="notice"><strong>Engineering limitation.</strong> Simulation does not replace structural testing, ground testing, flight testing, legal compliance, or qualified engineering review. This report does not certify airworthiness.</p>
</main></body></html>`;
}
