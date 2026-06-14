#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Building SecureStore.POS..."
dotnet build SecureStore.POS.csproj

scan() {
  local pattern="$1"
  local message="$2"
  if rg -n --glob '!bin/**' --glob '!obj/**' --glob '!PRELAUNCH_FIX_REPORT.md' --glob '!prelaunch-verify.sh' "$pattern" .; then
    echo "FAILED: $message"
    exit 1
  fi
}

echo "Running static launch-risk checks..."
scan 'admin123|manager123|cashier123|password123|123456' "weak default credential pattern found"
scan 'Password must be at least 6|minimum 6|at least 6 characters' "legacy weak password policy text found"
scan 'Reason TEXT NULL|Reason NVARCHAR\(500\) NULL' "inventory reason is nullable in schema"
scan 'File\.Copy\(backupFilePath, _dbPath, true\)' "restore still overwrites the live database directly"
scan 'Try again in 30 minutes' "lockout message is hardcoded instead of config-driven"

echo "Pre-launch verification passed."
