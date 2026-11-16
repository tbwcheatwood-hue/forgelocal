#!/usr/bin/env bash
# Launch ForgeLocal (dev) from a desktop shortcut / applications menu.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export ELECTRON_DISABLE_SANDBOX="${ELECTRON_DISABLE_SANDBOX:-1}"

if [[ ! -d node_modules ]]; then
  echo "ForgeLocal: installing dependencies…"
  npm install
fi

exec npm run dev
