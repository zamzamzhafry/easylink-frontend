# Plan: Queue Foundation + SDK Pull Safety + Docs/SQL Consolidation

## 1) Intent & Outcome

Implement a queue-first foundation so machine pulls are controlled and observable from a shared right-side panel, prevent duplicate pulls while a machine is still busy, support long paging sessions with explicit abort, and standardize confirmation prompts for user-triggered actions. In parallel, consolidate docs assets (including Postman collection under `docs/`) and prepare one easy-deploy SQL structure file.

This plan also includes QoL UI refinement for Schedule + Attendance pages (reduced text noise, stronger icon affordance, higher contrast).

---

## 2) Current State (verified)

- Queue exists only on `app/scanlog/page.jsx` (page-local right panel), not globally shared.
- Async queue backend exists in `app/api/scanlog/sync/route.js` with in-memory pending workers + DB batch tracking.
- No abort endpoint for running/pending batch.
- Machine page (`app/machine/page.jsx`) can still trigger pull operations directly and is not guarded by queue lock semantics.
- SDK client (`lib/easylink-sdk-client.js`) has internal `AbortController` timeout per request but no batch-level cancel token wiring.
- Confirmation UX is inconsistent (`ModalShell` exists, but `window.confirm` is still used in places).
- Docs already contain curl references and manual response log:
  - `docs/scanlog-sdk-curl-postman-reference.md`
  - `docs/response_testing.md`
- SQL structure is fragmented across multiple root `.sql` files (MySQL + PostgreSQL mixed).

---

## 3) Decision-Complete Architecture

### A. Shared queue foundation (right side)

1. Create shared component: `components/queue/scanlog-queue-panel.jsx`.
2. Mount in `components/app-shell.jsx` with route-aware visibility (at minimum: `/scanlog`, `/machine`; extensible for future pages).
3. Expose compact + expanded panel modes so content pages remain usable.

### B. Single in-flight machine pull (anti-double-trigger)

1. Backend lock policy: reject/alias new `scanlog` pull when same machine has `queued|running` batch.
2. Add lock metadata to batch row (or derive from existing fields): machine identity (`sn`), mode (`new|all`), request hash.
3. API response behavior for duplicates:
   - return existing batch info (`batch_id`, status, queue state), not a new batch.

### C. Long paging session handling

1. Keep session-aware loop in backend worker (not UI).
2. Persist progress markers per batch (`current_page`, `pages_processed`, `last_activity_at`, `session_active`).
3. UI displays live progress + elapsed time + stale indicator.

### D. Abort/cancel flow

1. New endpoint: `POST /api/scanlog/sync/abort` with `batch_id`.
2. Cancellation strategy:
   - queued jobs: mark cancelled before run.
   - running jobs: set cancel flag in shared runtime registry and stop loop at safe checkpoints.
3. Adapter integration: pass cancellation signal down from job loop to SDK request layer.

### E. Confirmation UX (all button interactions in this scope)

1. Build reusable confirmation dialog wrapper using `components/ui/modal-shell.jsx`.
2. Apply to queue/machine actions (`Fetch`, `Pull`, `Sync Time`, `Abort`, heavy refresh/retry actions).
3. Severity levels: info/warning/danger visual variants.

### F. Backend/Frontend separation

1. Backend owns pulling/queueing/session lifecycle.
2. Frontend only triggers jobs, monitors queue state, and renders outcomes.
3. No direct multi-step pull logic in UI components.

### G. QoL design updates (Schedule + Attendance)

1. Reduce dense helper text blocks; replace with icon + concise labels.
2. Improve contrast for key statuses/actions (warning/error/success).
3. Keep interaction clarity with tooltips + consistent icon language.

### H. Docs + Postman restructuring (low-usage agents)

1. Create docs substructure:
   - `docs/api/`
   - `docs/features/`
   - `docs/postman/`
2. Extract/create Postman collection JSON under `docs/postman/` (currently no standalone postman file found).
3. Keep `docs/response_testing.md` as append-only runtime evidence log.
4. Update `docs/README.md` index links.

### I. One-file SQL structure for easy deploy

1. Generate consolidated MySQL structure file: `sql/deploy_all_mysql.sql`.
2. Include only structural migrations in deterministic order.
3. Exclude destructive/dev-only seeds from default deploy (`seed_test_dummy_data.sql`, truncate/reseed sections).
4. Keep PostgreSQL schema separate (`migration_postgres_v1.sql`) and document as alternative engine path.

---

## 4) Execution Phases

### Phase 1 — Queue core hardening

- Files:
  - `app/api/scanlog/sync/route.js`
  - `lib/easylink-sdk-client.js`
  - (new) `lib/domain/scanlog-queue-lock.ts` or JS equivalent
- Deliverables:
  - duplicate-request guard
  - progress fields
  - abort endpoint + runtime cancel registry

### Phase 2 — Shared rightbar integration

- Files:
  - `components/app-shell.jsx`
  - (new) `components/queue/scanlog-queue-panel.jsx`
  - `app/scanlog/page.jsx`
  - `app/machine/page.jsx`
- Deliverables:
  - shared queue panel
  - machine page queue visibility
  - all action buttons confirmation-gated

### Phase 3 — QoL visual pass

- Files:
  - `app/schedule/page.jsx`
  - `app/attendance/page.jsx`
  - (optional) shared icon/style tokens
- Deliverables:
  - reduced text clutter
  - improved icon usage
  - stronger contrast on critical actions/states

### Phase 4 — Docs + curl + Postman

- Files:
  - `docs/README.md`
  - `docs/scanlog-sdk-curl-postman-reference.md`
  - `docs/response_testing.md`
  - (new) `docs/postman/easylink-machine-sdk.collection.json`
  - (new) `docs/features/*.md`, `docs/api/*.md`
- Deliverables:
  - "Pull new scanlog" curl pack
  - users-feature curl pack
  - response-log workflow section

### Phase 5 — SQL consolidation

- Files:
  - (new) `sql/deploy_all_mysql.sql`
  - `docs/api/sql-deploy-guide.md`
- Deliverables:
  - single MySQL deploy file
  - documented excluded scripts + rationale

---

## 5) Required cURL Pack (for external terminal)

### A. Pull new scanlog (direct SDK)

```bash
curl --location --request POST 'http://localhost:5000/scanlog/new?sn=Fio66208021230737' \
  --header 'Content-Type: application/x-www-form-urlencoded'
```

### B. Pull new scanlog (app async queue)

```bash
curl --location 'http://localhost:3000/api/scanlog/sync' \
  --header 'Content-Type: application/json' \
  --data '{
    "source": "windows-sdk",
    "mode": "new",
    "async": true,
    "limit": 1000,
    "page": 1,
    "max_pages": 1
  }'
```

### C. Poll queue batch status

```bash
curl --location 'http://localhost:3000/api/scanlog/sync?batch_id=<BATCH_ID>'
```

### D. Users feature (app API)

```bash
# list
curl --location 'http://localhost:3000/api/users?search=' --cookie 'next-auth-or-session-cookie=...'

# create
curl --location 'http://localhost:3000/api/users' \
  --header 'Content-Type: application/json' \
  --cookie 'next-auth-or-session-cookie=...' \
  --data '{"pin":"12345","name":"User Demo","privilege":0,"rfid":""}'

# update
curl --location --request PUT 'http://localhost:3000/api/users' \
  --header 'Content-Type: application/json' \
  --cookie 'next-auth-or-session-cookie=...' \
  --data '{"pin":"12345","name":"User Demo Updated","privilege":0}'

# delete
curl --location --request DELETE 'http://localhost:3000/api/users' \
  --header 'Content-Type: application/json' \
  --cookie 'next-auth-or-session-cookie=...' \
  --data '{"pin":"12345"}'
```

---

## 6) Verification Gates (implementation session)

1. Functional:
   - duplicate click on pull action does not create a second running batch.
   - long paging run surfaces progress and can be aborted.
   - machine + scanlog pages both show consistent queue state.
2. UX:
   - all scoped action buttons require confirmation modal.
   - schedule/attendance readability improved with icon/contrast updates.
3. Docs:
   - docs index updated; postman collection placed under `docs/postman/`.
   - user-provided terminal responses can be appended to `docs/response_testing.md`.
4. SQL:
   - consolidated MySQL file runs cleanly on fresh DB.
   - excluded destructive/dev scripts documented explicitly.

---

## 7) Delegation Strategy (low usage token)

- Use `task(category="quick", ...)` for docs file moves/format cleanups.
- Use `task(category="writing", ...)` for markdown restructuring and cURL documentation.
- Use `task(category="implementation", ...)` for focused code modules where needed.
- Keep prompts atomic and per-phase to control token use.

---

## 8) Risks & Mitigations

1. **Abort mid-network call not immediate**
   - Mitigation: cooperative cancellation checkpoints + request timeout caps.
2. **Queue state split (memory vs DB)**
   - Mitigation: DB source-of-truth for batch status; memory only for worker runtime.
3. **One-file SQL accidentally includes destructive scripts**
   - Mitigation: strict inclusion list + separate dev seed file.
4. **Postman collection source not found as file**
   - Mitigation: generate canonical collection from documented endpoints and store in `docs/postman/`.
