#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$ROOT_DIR/SecureStore.POS/SecureStore.POS.csproj"
PUBLISH_DIR="$ROOT_DIR/SecureStore.POS/bin/Debug/net8.0/linux-x64/publish"
APP="$PUBLISH_DIR/SecureStore.POS"

echo "Publishing SecureStore POS for Linux..."
dotnet publish "$PROJECT" -c Debug -r linux-x64 --self-contained true

if [[ ! -x "$APP" ]]; then
  echo "Published app was not found at: $APP" >&2
  exit 1
fi

if command -v readelf >/dev/null 2>&1; then
  if readelf -l "$APP" 2>/dev/null | grep -q "/snap/core20/current/lib64/ld-linux-x86-64.so.2"; then
    echo "Fixing snap .NET loader path..."
    perl -0pi -e 's#/snap/core20/current/lib64/ld-linux-x86-64\.so\.2#/lib64/ld-linux-x86-64.so.2\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0#' "$APP"
    perl -0pi -e 's#lib64/ld-linux-x86-64\.so\.2\0#/lib64/ld-linux-x86-64.so.2\0#' "$APP"
  fi

  if readelf -d "$APP" 2>/dev/null | grep -q "/snap/core20/current/lib/x86_64-linux-gnu"; then
    echo "Fixing snap .NET runtime library path..."
    perl -0pi -e 's#/snap/core20/current/lib/x86_64-linux-gnu#/usr/lib/x86_64-linux-gnu\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0#' "$APP"
  fi
fi

echo "Starting SecureStore POS..."
cd "$PUBLISH_DIR"
./SecureStore.POS
