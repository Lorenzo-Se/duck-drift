#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -z "${DYLD_FALLBACK_LIBRARY_PATH:-}" ]]; then
  if [[ -d /opt/homebrew/lib ]]; then
    export DYLD_FALLBACK_LIBRARY_PATH="/opt/homebrew/lib"
  elif [[ -d /usr/local/lib ]]; then
    export DYLD_FALLBACK_LIBRARY_PATH="/usr/local/lib"
  fi
fi

PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
if [[ ! -x "$PYTHON_BIN" ]]; then
  PYTHON_BIN="python3"
fi

exec "$PYTHON_BIN" "$SCRIPT_DIR/generate_track_pngs.py" "$@"
