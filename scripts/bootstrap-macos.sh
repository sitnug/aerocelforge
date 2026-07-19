#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

missing=0
for tool in node npm cargo rustc python3 xcrun; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "missing required tool: $tool"
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  echo "Install the missing tools through an approved package manager, then rerun."
  exit 1
fi

echo "Node: $(node --version)"
echo "npm: $(npm --version)"
echo "Rust: $(rustc --version)"
echo "Python: $(python3 --version)"
echo "Apple SDK: $(xcrun --show-sdk-path)"

if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
fi

.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -e 'services/scientific-orchestrator[dev]'

echo "Bootstrap complete. Run 'npm run desktop' for the native app."
