#!/usr/bin/env bash
# port-claim.sh — atomically claim a port for this agent/task.
# Usage: port-claim.sh <port> <agent> <task> [project]
# Exit 0 = claimed (yours). Exit 1 = taken (conflict printed to stderr).
# Reaps dead-pid + expired leases before deciding.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
REG="$DIR/port-registry.jsonl"
LOCK="$DIR/port-registry.lock"
TTL_HOURS="${PORT_LEASE_TTL_HOURS:-4}"
NOW_EPOCH="$(date +%s)"

PORT="${1:?missing port}"
AGENT="${2:?missing agent id}"
TASK="${3:?missing task label}"
PROJECT="${4:-$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")}"

mkdir -p "$DIR"
touch "$REG" "$LOCK"

# Atomic block: prune + check + append under exclusive flock.
exec 9>"$LOCK"
flock 9

# --- prune dead + expired leases, write survivors to tmp ---
TMP="$(mktemp)"
while IFS= read -r line; do
  [ -z "$line" ] && continue
  # extract pid + expires via node (jq may be absent). portable enough.
  PRUNE_OUT="$(node -e '
    const line = process.argv[1];
    try {
      const o = JSON.parse(line);
      const pid = Number(o.pid);
      const exp = Date.parse(o.expires||"") / 1000;
      const now = Number(process.argv[2]);
      // alive if: process exists AND not expired
      let alive = true;
      try { process.kill(pid, 0); } catch { alive = false; }
      if (alive && (!exp || exp > now)) { process.stdout.write("keep"); }
      else { process.stdout.write("drop"); }
    } catch { process.stdout.write("drop"); }
  ' "$line" "$NOW_EPOCH" 2>/dev/null || echo drop)"
  if [ "$PRUNE_OUT" = "keep" ]; then
    printf '%s\n' "$line" >> "$TMP"
  fi
done < "$REG"
mv "$TMP" "$REG"

# --- conflict check ---
if grep -E "\"port\":$PORT[^0-9]" "$REG" >/dev/null 2>&1; then
  echo "PORT $PORT already leased:" >&2
  grep -E "\"port\":$PORT[^0-9]" "$REG" >&2
  exit 1
fi

# --- also check nobody is ACTUALLY listening on it (lease file could be stale vs reality) ---
# unless PORT_CLAIM_PID is set to that listener's pid (we're registering an already-running server).
CLAIM_PID="${PORT_CLAIM_PID:-$$}"
if [ -z "${PORT_CLAIM_PID:-}" ] && command -v ss >/dev/null 2>&1; then
  if ss -tln 2>/dev/null | awk '{print $4}' | grep -E ":$PORT$" >/dev/null; then
    echo "PORT $PORT is actively listening (unregistered holder). Pick another, or set PORT_CLAIM_PID=<its pid> to register it." >&2
    exit 1
  fi
fi

# --- claim (build via node so JSON is valid + escaping is safe) ---
STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
EXPIRES="$(date -u -d "+${TTL_HOURS} hours" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+${TTL_HOURS}H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")"
node -e '
  const fs=require("fs");
  const o={port:Number(process.argv[1]),pid:Number(process.argv[2]),agent:process.argv[3],task:process.argv[4],project:process.argv[5],started:process.argv[6],expires:process.argv[7]};
  fs.appendFileSync(process.argv[8], JSON.stringify(o)+"\n");
' "$PORT" "$CLAIM_PID" "$AGENT" "$TASK" "$PROJECT" "$STARTED" "$EXPIRES" "$REG"

echo "claimed port $PORT for $AGENT ($TASK) pid=$CLAIM_PID" >&2
exit 0
