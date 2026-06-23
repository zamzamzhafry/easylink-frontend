#!/usr/bin/env bash
# port-list.sh — print active (live) port leases as a table. Reaps dead/expired first.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
REG="$DIR/port-registry.jsonl"
LOCK="$DIR/port-registry.lock"
NOW_EPOCH="$(date +%s)"

[ -f "$REG" ] || { echo "(no leases)"; exit 0; }

exec 9>"$LOCK"
flock 9

# prune first (same logic as claim)
TMP="$(mktemp)"
while IFS= read -r line; do
  [ -z "$line" ] && continue
  PRUNE_OUT="$(node -e '
    try {
      const o = JSON.parse(process.argv[1]);
      const pid = Number(o.pid);
      const exp = Date.parse(o.expires||"") / 1000;
      let alive = true;
      try { process.kill(pid, 0); } catch { alive = false; }
      process.stdout.write(alive && (!exp || exp > Number(process.argv[2])) ? "keep" : "drop");
    } catch { process.stdout.write("drop"); }
  ' "$line" "$NOW_EPOCH" 2>/dev/null || echo drop)"
  [ "$PRUNE_OUT" = "keep" ] && printf '%s\n' "$line" >> "$TMP"
done < "$REG"
mv "$TMP" "$REG"

if [ ! -s "$REG" ]; then echo "(no active leases)"; exit 0; fi

printf '%-6s %-8s %-28s %-32s %s\n' PORT PID AGENT TASK EXPIRES
while IFS= read -r line; do
  node -e '
    const o=JSON.parse(process.argv[1]);
    console.log([o.port,o.pid,o.agent,o.task,o.expires].join("\t").replace(/\t/g," | "));
  ' "$line" | awk -F' \\| ' '{printf "%-6s %-8s %-28s %-32s %s\n",$1,$2,$3,$4,$5}'
done < "$REG"
