# Auth Grill + Redesign Context (2026-06-11)

## Goal

Diagnose the admin01 login failure, decide a path to re-anchor login on employee NIP (canonical) and remove the fragile machine-synced PIN path, and verify the design before any code change.

## Summary

`admin01`/correct-password returns HTTP 409 `Auth identity conflict.` — not a password bug. Same id exists in both `auth_accounts` (account lane) and `tb_karyawan_auth` (NIP lane); login forces account lane, then collision-checks the two contexts; static account flags vs dynamic NIP-derived flags diverge → 409 blocks login.

User wants login bound to employee NIP + `tb_karyawan_auth.password_hash`, dropping the `tb_user`-fed legacy_pin path entirely. Roles/leadership keyed on `karyawan_id` via `tb_karyawan_roles`. Multiple leaders per group required; leaders create schedules for their group.

Oracle adversarially reviewed (grilled) the draft redesign. Verdict: redesign kills 409 by construction but introduces three latent defects unless amended. Two live escalation bugs exist independent of the redesign and should ship first.

## Changes (no code yet)

Knowledge artifacts written:
- `docs/agent-context/oracle-auth-redesign-grill-2026-06-11.md` — full grill verdict (blockers, decisions, 7-step migration)
- `docs/agent-context/leaders-missing-nip-2026-06-11.tsv` — 3 leaders to backfill NIP
- `docs/agent-context/employees-missing-nip-2026-06-11.tsv` — 99 employees
- `docs/obsidian/auth-leader-schedule-map.md` — rewritten with confirmed root cause + B1/B2 + grill amendments
- `docs/obsidian/index.md` — last-updated bump, grill in reading order
- `docs/graphify-app-direction.md` — auth section 4 + flowchart updated for NIP-anchor direction
- `.omo/qa/auth-409-collision-diagnosis-2026-06-11.md` — repro + DB state + fix options
- `.multibrain/indexes/auth.md` — recon + grill summary entries

No code changes to `lib/auth-session.ts`, `app/api/auth/login/route.js`, etc. Stopped at design.

## Files (auth-relevant anchors, no edits this session)

- `lib/auth-session.ts` — 3-lane context builders (account L401, nip L487, pin L593); B1/B2 live at L513-545
- `app/api/auth/login/route.js` — login waterfall; 409 origin L57-58 + L83
- `lib/auth-login-helpers.js` — `resolveAuthenticatedLane` L12
- `lib/auth-hardening-helpers.js` — `hasPrivilegeMismatch` L56-64
- `app/api/groups/route.js` — leader assign/remove writes `tb_user_group_access.is_leader` by PIN (H4 split-brain risk: L88-104 read, L173-207 write)
- `app/api/schedule/route.js` — `ensureScheduleEdit` ~L36; gates stay as-is once B1 fixes per-group leader data
- `app/login/page.jsx` — posts `login_id`; rename to `nip` per redesign
- `lib/localization/ui-texts.js` — `loginIdLabel` strings; rename in redesign

## Verification

- Live DB queries against `demo_easylinksdk` confirmed: 135 employees, 99 nip-NULL, 4 leader rows in `tb_user_group_access` (group 9 has 2 leaders → multi-leader pattern works today).
- Playwright MCP login test (`admin01`/`Admin@123` → 409) confirmed bug live on workspace dev server.
- HOP B ingest path verified live end-to-end via curl (401/400/200/replay) — unrelated but covered the running server state.
- No `npm run typecheck` or `npm run build` run for auth (no code changed).

## Follow-up

1. Ship B1 + B2 fix immediately (live escalation, ~Short effort) per Oracle grill.
2. Verify admin01 has a `tb_karyawan` row before any account-lane removal.
3. Switch session subject `nip:X` → `karyawan_id:X`; add `createAuthContextByKaryawanId`.
4. Migrate `app/api/groups/route.js` leader read + write together to `tb_karyawan_roles`.
5. Dual-run lanes during HR NIP backfill; then disable `EASYLINK_ENABLE_LEGACY_PIN_FALLBACK`; then remove account branch.
6. Add `k.isDeleted=0` to NIP context query; rate-limit + CSRF on login.
7. Restore deployed server when done: `pm2 start easylink-frontend`; `tmux kill-session -t elworkspace`.

## References

- `docs/agent-context/oracle-auth-redesign-grill-2026-06-11.md`
- `docs/obsidian/auth-leader-schedule-map.md`
- `docs/CONTEXT.md` (canonical auth anchors)
- `docs/auth-domain-glossary.md`
- `docs/adr/0001-auth-identity-resolution-and-capability-model.md`
