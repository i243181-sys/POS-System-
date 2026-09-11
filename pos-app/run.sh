#!/usr/bin/env bash
set -euo pipefail
umask 077
APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/securestore-pos"
mkdir -p "$STATE_DIR"
LOG_FILE="$STATE_DIR/launcher.log"
cd "$APP_DIR"
if [[ ! -x node_modules/.bin/electron || ! -f out/main/main.js || ! -f out/renderer/index.html ]]; then
  echo "Install and build first: cd \"$APP_DIR\" && npm ci && npm run build" >&2
  exit 1
fi
unset ELECTRON_RUN_AS_NODE
unset ELECTRON_RENDERER_URL
export NODE_ENV=production
# Rotate the launcher output too; application logs rotate separately.
if [[ -f "$LOG_FILE" ]] && [[ $(stat -c %s "$LOG_FILE") -gt 5242880 ]]; then
  mv -f -- "$LOG_FILE" "$LOG_FILE.1"
fi
if node_modules/.bin/electron . "$@" >>"$LOG_FILE" 2>&1; then
  exit 0
else
  code=$?
  echo "SecureStore POS could not start. See $LOG_FILE" >&2
  if command -v zenity >/dev/null 2>&1; then
    zenity --error --title="SecureStore POS" --text="Startup failed. See $LOG_FILE" || true
  fi
  exit "$code"
fi
