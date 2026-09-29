#!/usr/bin/env bash
# Runs the SmartBudget Maestro e2e suite against the booted iOS Simulator.
#
# Usage: bash .maestro/run.sh [--scan] [--record <path.mp4>] [--device <udid>] [flow.yaml ...]
#   --scan            also run flows tagged `scan` (real Claude API call; adds a receipt)
#   --record <path>   record a simulator video of the run to <path>
#   --device <udid>   simulator to use (default: the booted one)
#   flow.yaml ...     run only these flows instead of the whole folder
#
# Credentials come from .maestro/.env.local (gitignored; see .env.example)
# and are passed to maestro as -e KEY=VALUE, never written to flow files.
# Expects Metro (8081) and the backend (3000) to be running already.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$DIR/.env.local"

include_scan=0
record_path=""
device=""
flows=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scan) include_scan=1; shift ;;
    --record) record_path="${2:?--record needs a path}"; shift 2 ;;
    --device) device="${2:?--device needs a UDID}"; shift 2 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) flows+=("$1"); shift ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.example to .env.local and fill in the test account." >&2
  exit 1
fi

# Maestro needs Java 17+; prefer the installed Corretto 17 when JAVA_HOME is unset.
if [[ -z "${JAVA_HOME:-}" ]]; then
  corretto=/Library/Java/JavaVirtualMachines/amazon-corretto-17.jdk/Contents/Home
  [[ -d "$corretto" ]] && export JAVA_HOME="$corretto"
fi
export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true

env_args=()
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ -z "$line" || "$line" == \#* ]] && continue
  env_args+=(-e "$line")
done < "$ENV_FILE"

if [[ -z "$device" ]]; then
  device="$(xcrun simctl list devices booted | grep -Eo '[0-9A-F-]{36}' | head -n1 || true)"
  [[ -z "$device" ]] && { echo "No booted iOS Simulator found." >&2; exit 1; }
fi

cmd=(maestro --device "$device" test "${env_args[@]}")
if [[ $include_scan -eq 0 ]]; then
  cmd+=(--exclude-tags scan)
fi
if [[ ${#flows[@]} -gt 0 ]]; then
  cmd+=("${flows[@]}")
else
  cmd+=("$DIR")
fi

rec_pid=""
stop_recording() {
  if [[ -n "$rec_pid" ]]; then
    kill -INT "$rec_pid" 2>/dev/null || true
    wait "$rec_pid" 2>/dev/null || true
    echo "Recording saved to $record_path"
  fi
}
trap stop_recording EXIT

if [[ -n "$record_path" ]]; then
  mkdir -p "$(dirname "$record_path")"
  xcrun simctl io "$device" recordVideo --codec=h264 --force "$record_path" >/dev/null 2>&1 &
  rec_pid=$!
  sleep 1
fi

"${cmd[@]}"
