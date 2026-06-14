#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$APP_DIR/logs"
LOG_FILE="$LOG_DIR/launcher.log"

mkdir -p "$LOG_DIR"
cd "$APP_DIR"

show_error() {
  local message="SecureStore POS could not start. Check the launcher log at: $LOG_FILE"

  if command -v zenity >/dev/null 2>&1; then
    zenity --error --title="SecureStore POS" --text="$message" >/dev/null 2>&1 || true
  elif command -v kdialog >/dev/null 2>&1; then
    kdialog --error "$message" --title "SecureStore POS" >/dev/null 2>&1 || true
  elif command -v notify-send >/dev/null 2>&1; then
    notify-send "SecureStore POS" "$message" >/dev/null 2>&1 || true
  fi
}

trap 'code=$?; if [ "$code" -ne 0 ]; then show_error; fi' EXIT

{
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting SecureStore POS from $APP_DIR"

unset ELECTRON_RUN_AS_NODE
export NODE_ENV=production

if [ ! -d node_modules ] || [ ! -x node_modules/.bin/electron ]; then
  echo "Installing Node dependencies..."
  npm install
fi

if [ ! -f out/main/main.js ] || [ ! -f out/renderer/index.html ]; then
  echo "Production build not found. Building Electron app..."
  npm run build
fi

echo "Launching Electron app..."
node_modules/.bin/electron .
} >>"$LOG_FILE" 2>&1
