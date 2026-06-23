#!/usr/bin/env bash
# port-pick.sh — auto-pick + claim the first free port in a range.
# Usage: port-pick.sh <agent> <task> [start_port] [end_port]
# Prints the claimed port to stdout. Exit 1 if none free.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT="${1:?missing agent id}"
TASK="${2:?missing task label}"
START="${3:-3100}"
END="${4:-3199}"

for PORT in $(seq "$START" "$END"); do
  if bash "$DIR/port-claim.sh" "$PORT" "$AGENT" "$TASK" 2>/dev/null; then
    echo "$PORT"
    exit 0
  fi
done
echo "no free port in $START..$END" >&2
exit 1
