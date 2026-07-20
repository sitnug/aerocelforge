# macOS setup

## Supported host

- macOS 13 or later; Apple Silicon is the primary tested target.
- Node.js 22+, npm 10+, Rust 1.77.2+, Python 3.9+.
- Xcode Command Line Tools (`xcode-select --install`).

Run the idempotent bootstrap from the repository root:

```bash
./scripts/bootstrap-macos.sh
```

It reports missing system tools, installs repository-local JavaScript and Python
dependencies, and runs no privileged command or unverified download. Install a
missing tool through your organization-approved package manager, then rerun it.

## Development

```bash
npm run desktop
```

Projects are written atomically below the application data directory by the
native host. The browser-only command (`npm run dev`) uses local browser storage
and downloaded report files, so it is useful for UI development but is not the
full native persistence path.

## Build a native app

```bash
npm run desktop:build
```

Unsigned local artifacts are placed under
`apps/desktop/src-tauri/target/release/bundle`. Gatekeeper behavior varies for
unsigned builds. Distribution requires an Apple Developer ID Application
certificate, hardened runtime configuration, notarization credentials, and a
release process outside this repository.

## Local Linux solvers

OpenFOAM and common robotics stacks are most predictable on Linux. On macOS use a
Colima, Lima, Docker, or remote Linux environment and keep generated cases in a
managed mount. Templates are under `infrastructure/`. Do not expose the
orchestrator beyond loopback without authentication and TLS.

## Troubleshooting

- `xcrun` or linker errors: install/update Xcode Command Line Tools.
- Rust compiler version errors: update stable Rust with `rustup update stable`.
- blank native window: confirm port 1420 is not occupied, then run `npm run dev`.
- solver unavailable: open Settings and inspect capabilities; install/configure
  the external tool rather than overriding the gate.
- project load failure: preserve the file and inspect its `schemaVersion`; never
  edit away validation errors without understanding the migration.
