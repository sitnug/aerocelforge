# Developer guide

## Local loop

Install with `./scripts/bootstrap-macos.sh`, then run `npm run dev` for rapid UI
work or `npm run desktop` for native-command integration. All TypeScript packages
are strict ESM workspaces. Package tests sit beside the implementation as
`*.test.ts`.

The app currently computes the Kestrel integrated analysis in
`apps/desktop/src/lib/analysis.ts`. Keep kernels in `packages/`; the UI should
orchestrate and explain them, not duplicate equations.

## Adding a physics model

1. Define an input interface with explicit SI unit suffixes.
2. Document reference frame, assumptions, validity range, and failure behavior.
3. Return convergence and warnings; never hide a clamp or extrapolation.
4. Put model fidelity and provenance into a result envelope.
5. Add dimensional, analytic, regression, and invalid-input tests.
6. Add a physical validation item to `VALIDATION.md`.

## Adding an external adapter

Follow [SOLVER_ADAPTERS.md](SOLVER_ADAPTERS.md). In particular, the executable and
argument list are owned by trusted code, the case path is contained, raw output
is retained, cancellation is real, and no percentage is invented from iteration
count. A capability means “found,” not “validated.”

## Schema changes

Increment the schema version only with a migration and fixtures for both old and
new data. Parsing must reject unknown or malformed state at the boundary. Do not
silently reinterpret units, axes, component identities, or provenance.

## Native commands

Tauri commands live in `apps/desktop/src-tauri/src/lib.rs`. Keep them narrow and
typed. Filesystem operations must resolve to an application-managed location and
write through a temporary file plus rename. Never expose a generic shell command.
