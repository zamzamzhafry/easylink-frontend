#!/usr/bin/env bash
# port-release.sh — release a port lease you hold.
# Usage: port-release.sh <port>
# Exit 0 always (idempotent).
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
REG="$DIR/port-registry.jsonl"
LOCK="$DIR/port-registry.lock"
PORT="${1:?missing port}"

[ -f "$REG" ] || exit 0

exec 9>"$LOCK"
flock 9

TMP="$(mktemp)"
while IFS= read -r line; do
  [ -z "$line" ] && continue
  if echo "$line" | grep -E "\"port\":$PORT[^0-9]" >/dev/null 2>&1; then
    continue  # drop this one
  fi
  printf '%s\n' "$line" >> "$TMP"
done < "$REG"
mv "$TMP" "$REG"

echo "released port $PORT" >&2
exit 0
