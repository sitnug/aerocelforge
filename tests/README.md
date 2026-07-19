# Cross-system test suites

Unit tests are colocated with TypeScript packages and the Python orchestrator.
These directories are reserved for external-solver integration, performance,
regression artifact, and physical validation suites. Such tests must identify
required executables/data and skip explicitly when unavailable; they must never
replace missing evidence with generated pass fixtures.
