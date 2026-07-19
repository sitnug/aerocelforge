# Contributing

Use small, coherent changes and preserve the boundaries in
[DECISIONS.md](DECISIONS.md). Physics changes need stated assumptions, valid input
domain, units/frames, provenance/fidelity, convergence behavior, a reference, and
tests. Do not replace a missing solver with representative-looking output.

Before review run:

```bash
npm run check
npm run python:check
npm run python:lint
npm run python:typecheck
npm run rust:check
npm run rust:clippy
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Use SI internally, FRD for body vectors, NED for dynamics, and deterministic seeds
for stochastic tests. New external execution must accept typed arguments, validate
paths, redact secrets, expose cancellation, and retain raw logs.
