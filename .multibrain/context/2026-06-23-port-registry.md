# Port Registry (shared, cross-agent)

Goal: stop agents/tasks colliding on dev-server ports. Single source of truth = `.multibrain/port-registry.jsonl`. One JSON line per active lease.

## Lease line shape

```json
{"port":3100,"pid":2847887,"agent":"claude-sync-ai-knowledge","task":"dashboard-perf-optimize+e2e","project":"easylink-frontend","started":"2026-06-23T00:00:00Z","expires":"2026-06-23T02:00:00Z"}
```

- `port` — claimed TCP port
- `pid` — process owning it (so stale leases get reaped)
- `agent` — which agent/session claimed it
- `task` — short label of why
- `project` — repo dir name
- `started` / `expires` — ISO; auto-expire so a crashed agent's lease doesn't block forever

## Rules (all agents — Claude/Codex/OpenCode)

1. BEFORE starting a dev server / listener: run `bash .multibrain/scripts/port-claim.sh <port> <agent> <task>` (or `port-pick.sh` to auto-pick). It returns exit 0 + claims; exit non-zero + prints the conflicting lease if taken.
2. AFTER stopping your server: run `bash .multibrain/scripts/port-release.sh <port>` (or just exit — the pid-reaper drops it on next claim sweep).
3. NEVER hardcode a port assumption. Re-claim each session.
4. Preferred easylink-frontend dev ports: 3100–3199. If all taken, walk 3200+.
5. Lease file is append-only log; `port-claim.sh` prunes dead-pid + expired leases atomically (flock) before deciding.

## Concurrency primitive

`port-claim.sh` uses `flock` on `.multibrain/port-registry.lock` so two agents claiming the same port at the same instant can't both win. One gets exit 0, the other exit 1 + the winner's lease.

## Current active leases

See `.multibrain/port-registry.jsonl` (live file — read it, not this doc).
