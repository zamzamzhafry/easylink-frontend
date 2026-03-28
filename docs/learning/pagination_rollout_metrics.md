# Pagination Rollout Metrics (Phase 3)

## Scope

This document tracks baseline vs post-rollout behavior for the pagination and queue hardening work.

## Endpoints covered

- `GET /api/users`
- `GET /api/scanlog`
- `GET /api/attendance/raw`
- `GET /api/machine`
- `GET /api/scanlog/sync`

## Baseline vs after (behavioral)

| Endpoint              | Baseline behavior                                                         | After rollout behavior                                                                                                        |
| --------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/api/users`          | Full list fetch risk on larger datasets; pagination contract not reusable | Shared pagination contract (`items,total,page,limit,pages`) + legacy alias (`users`), scoped joins for current page pins      |
| `/api/scanlog`        | Server paging existed but custom shape only                               | Shared pagination contract + legacy alias (`records`)                                                                         |
| `/api/attendance/raw` | Limit-only array response, no page/total/pages                            | Full server pagination with count + offset, supports `group_id`, `pin`, `employee_id`, returns shared contract + `rows` alias |
| `/api/machine`        | List branch fixed latest 30 only, no page metadata                        | Configurable `page/limit` with total/pages metadata via shared contract + `rows` alias                                        |
| `/api/scanlog/sync`   | Fixed latest 30 batches only, no page metadata                            | Configurable `page/limit` with count + offset, shared contract + `rows` alias                                                 |

## Frontend rollout summary

- Shared hook: `hooks/use-paginated-resource.js`
- Shared status panel: `components/ui/inline-status-panel.jsx`
- Migrated pages:
  - `app/users/page.jsx`
  - `app/scanlog/page.jsx`
  - `app/attendance/page.jsx` (raw tab)
  - `app/machine/page.jsx` (recent machine jobs)

## Known limitation to track

- Machine action queue (`/api/machine`) still uses in-memory scheduler state for active/pending jobs.
  - Impact: queued/running machine jobs do not survive server process restarts.
  - Current mitigation: queue status is still visible during process lifetime and API now supports paging.
  - Follow-up recommendation: persist machine queue state in DB (similar durability model to scanlog-safe batches).

## UAT measurement checklist (fill during pre-UAT retest)

1. Compare payload size and response time using browser devtools network tab for:
   - first page (`page=1`),
   - deeper page (`page=5` or max available),
   - filtered page (`search`/`pin`/`group_id`).
2. Confirm no endpoint returns full dataset by default.
3. Confirm visible recoverable error state exists on each migrated page.
4. Record p50/p95 response times with production-like sample data.

## Suggested commands for timing capture

> Requires authenticated cookie in environment as `AUTH_COOKIE`.

```bash
node -e "const c=process.env.AUTH_COOKIE; const u='http://localhost:3000/api/users?page=1&limit=20'; (async()=>{const t=Date.now(); const r=await fetch(u,{headers:{cookie:c}}); const b=await r.text(); console.log({status:r.status, ms:Date.now()-t, bytes:b.length});})();"
```

```bash
node -e "const c=process.env.AUTH_COOKIE; const u='http://localhost:3000/api/attendance/raw?from=2026-03-01&to=2026-03-07&page=1&limit=100'; (async()=>{const t=Date.now(); const r=await fetch(u,{headers:{cookie:c}}); const b=await r.text(); console.log({status:r.status, ms:Date.now()-t, bytes:b.length});})();"
```

```bash
node -e "const c=process.env.AUTH_COOKIE; const u='http://localhost:3000/api/machine?page=1&limit=30'; (async()=>{const t=Date.now(); const r=await fetch(u,{headers:{cookie:c}}); const b=await r.text(); console.log({status:r.status, ms:Date.now()-t, bytes:b.length});})();"
```
