# Session Handoff — EasyLink (fresh next session)

**Written**: 2026-06-07
**Previous focus**: auth-fix plan completion → grill-with-docs on credential/sync architecture
**Repo**: `E:\Project\easylink-frontend` (Next.js App Router + MySQL, private-network attendance/machine-sync)

---

## 1. Where things stand (one-paragraph TL;DR)

The `auth-fix` plan (Tasks 1-11) is **complete and verified** — auth works, login traces captured, 33/33 auth tests pass. The only loose end is the formal **Final Verification Wave (F1-F4)**, which was never sign-off-approved because the reviewer provider was flaky (direct verification passed instead). Most recent work: a **grill-with-docs** session produced 4 architecture/security questions in `.sisyphus/grill/auth-credential-model/`, each now pre-filled with evidence-backed agent proposals awaiting the human's final verdict. No code or ADR/CONTEXT files were written — everything is decision-pending.

---

## 2. Grill docs — YOUR action needed (primary)

Location: `.sisyphus/grill/auth-credential-model/`
Start at `README.md`, then each `QN-*.md`. Each has an **Agent-Proposed Assessment** + a blank **Human Final Verdict** slot.

| # | Topic | Proposal | What's deferred to you |
|---|-------|----------|------------------------|
| Q1 | Plaintext passwords at rest | Hash on every write; plaintext-verify migration-only; backfill canonical table | 🟢 None — clear engineering call, safe to ratify |
| Q2 | Credential lifecycle owner | NIP/employees surface owns creds; `cs_employee_auth_identity` canonical, `tb_karyawan_auth` projection | 🟠 Couple vs decouple device-enrollment from login (business/process call) |
| Q3 | Employee create = dormant auth | Set+hash+activate NIP password inline at create (Option A) | 🟡 Is password mandatory at create? (depends on Q2) |
| Q4 | HOP B Stage B never triggered | Scheduled Windows Task `php hop-b-batch-selector.php --worker-run` | 🟡 Interval + which box owns Task Scheduler |

**Sequencing**: ratify Q1 + Q2 first → Q3 follows → Q4 anytime (independent of credential thread).

### Important correction baked into Q1
An earlier claim that the users-page SELECT leaks `password_hash` to the browser was **FALSE and is retracted**. Verified: `app/api/users/route.js` returns `password_hash` in **no** client response; `resolveEmployeeAuthByLoginId` selects `employee_id, nip, is_active, karyawan_pin, nama` only. The at-rest plaintext risk is real; the client-exposure angle is not. Do not reintroduce that claim.

---

## 3. Verified code facts (don't re-litigate — build on these)

**Credential storage / hashing**:
- `lib/password.ts:10` `hashPassword()` (bcrypt rounds 12) — **only callers are `/api/auth/login` lines 69 & 108** (lazy re-hash on login). No write path, no backfill calls it.
- Login re-hashes `auth_accounts` (line 70) + `tb_karyawan_auth` (line 109) only — **never `cs_employee_auth_identity`**, so canonical table stays plaintext forever.
- `app/api/users/route.js`: `upsertLegacyEmployeeAuth` (~225) writes RAW `String(password)` to `tb_karyawan_auth.password_hash` (line 238); line 565 writes same raw value to `cs_employee_auth_identity`. `verifyPassword` (`lib/password.ts:19-36`) tolerates plaintext via legacy string-compare branch.
- `app/api/employees/route.js:144-156`: employee create inserts `tb_karyawan_auth` with **empty hash + is_active=0** → new employee can't log in until users page activates.

**HOP B sync (Windows ↔ Linux VM)**:
- Stage A (device→Windows staging): UI "Sync Scanlogs" → `useMachineSync.syncScanlogs()` → `/api/machine/sync?action=sync_scanlogs` → PHP bridge (`localhost:9090`) → local `easylink_bridge` DB. Knows nothing about the VM.
- Stage B (Windows staging→VM canonical): `ops/fservice-sync/hop-b-batch-selector.php`, **CLI-only** (`hop_b_main()`, `--worker-run` flag line 1292). POSTs to VM `/api/scanlog/ingest` with bearer token (`docs/hop-b-auth-contract.md`).
- **CONFIRMED: Stage B has NO automated trigger.** `run.bat` starts only FService + PHP control panel; only test files reference the selector. This is the root cause of "VM shows zero ingest rows."

**Auth model (per `docs/CONTEXT.md` + `docs/adr/0001-...`)**:
- Canonical roles: `admin`, `group_leader`, `employee`. Identity lanes: `account`, `employee_nip`, `legacy_pin`.
- Effective auth rebuilt server-side from DB; cookie is not role source of truth. Capability-driven authz.
- `is_leader` derived from `tb_karyawan_roles` (`group_leader`/`scheduler`) with `tb_user_group_access` fallback — `lib/auth-session.ts:514,548`.

---

## 4. Working credentials & runtime (for local testing)

Seeded fixtures (via `node scripts/seed-v3-role-fixtures.mjs --execute`), **all password = `password`**:
- `admin001` — admin, privilege 4, `karyawan_id 10006`
- `leader001` — group_leader, is_leader/can_schedule/can_dashboard true, group_id 32, `karyawan_id 10007`
- `employee001` — viewer/employee, group_id 32

**Do NOT use `admin01`/`ADMIN01` + `Admin@123`** — that's a permanent dual-lane collision (exists in both `auth_accounts` and `tb_karyawan_auth`) → `409 Auth identity conflict` by design (Task 6 mismatch guard working correctly). Not a bug.

Runtime prerequisites (local Windows dev):
- MySQL via `C:\xampp\mysql_start.bat` (port 3306, DB `demo_easylinksdk`).
- If `/login` 404s with "missing required error components": delete `.next`, restart `npm run dev` (stale dev artifacts).
- Login traces evidence: `.sisyphus/evidence/task-1-success-traces.md`.

---

## 5. Loose end — Final Verification Wave (F1-F4)

Plan `.sisyphus/plans/auth-fix.md` lines 954-975. All 11 implementation task checkboxes are marked `[x]`. F1-F4 checkboxes are **NOT** marked — the plan says wait for explicit human "okay". Direct verification already passed: `node --test` 33/33 on 5 auth test files, `lib/auth-session.ts` LSP clean, `middleware.ts` untouched (no rate-limit weakening), diff scoped to auth files. If user wants formal closure: either accept the direct verification, or re-fire the 4 reviewers (provider was flaky last time — verify results are plausible, not 1-3s instant returns).

---

## 6. Exact next steps for fresh session

1. **Ask the human** which grill verdicts they've filled in (`.sisyphus/grill/auth-credential-model/`). Read the **Human Final Verdict** slots.
2. For each ratified question: draft the ADR / CONTEXT.md entry first (docs before code), get approval, then delegate implementation.
3. Q1 is the safest to action first (clear engineering call). Q2 needs the couple/decouple business decision before Q3 can proceed.
4. Q4 is independent ops wiring — can be scheduled anytime.
5. Don't auto-mark F1-F4 without explicit human okay.

**Constraints carried from AGENTS.md**: private-network scope only; event-driven refresh over polling; never redirect to login on transient/non-auth failure; landing-page source of truth lives in `ops/landing-page/`.
