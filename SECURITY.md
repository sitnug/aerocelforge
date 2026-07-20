# Security policy and threat model

The main risks are untrusted project files, path traversal, solver command
injection, secret leakage in diagnostics, hostile geometry sizes, and exposing a
local orchestration endpoint to a network.

Implemented controls include runtime schema validation, managed atomic writes,
path containment checks, adapter-owned argument arrays without shell expansion, a
restrictive webview CSP, capability gates, cancellation, and diagnostics redaction.

Do not open projects from unknown sources on a machine with sensitive solver
credentials. Keep the orchestrator on loopback, use SSH tunnels, and keep private
keys in the operating system/agent. Review remote case files before running
third-party solvers because solver configuration formats may have their own code
loading or include mechanisms.

This repository has no public vulnerability mailbox configured. For an
organization deployment, establish a private reporting channel and response SLA
before distributing the application.
