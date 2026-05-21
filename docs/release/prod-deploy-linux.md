# Production Deploy Runbook (Linux)

Last updated: 2026-04-19

## Scope

Host-based Node.js deployment for EasyLink frontend/API on Linux VM/server.
This runbook assumes UAT is active and compatibility-first flags remain enabled.

## 1) Preflight

Run from project root:

```bash
npm ci
npm run typecheck
npm run build
```

Verify production hardening before deploy:

1. `AUTH_SECRET` is set to a strong value.
2. If app is served over HTTPS, keep `ALLOW_INSECURE_COOKIES` unset or `false`.
3. If app is served over plain LAN HTTP, set `ALLOW_INSECURE_COOKIES=true` or login session cookie will be dropped by browser.
4. `NODE_TLS_REJECT_UNAUTHORIZED` is unset or `1`.
5. `EASYLINK_DEFAULT_USER_PASSWORD` is set and not `1234`.
6. DB backup completed and restore path validated.

Pre-deploy schema drift checks:

```sql
SELECT COLUMN_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tb_user_group_access'
  AND COLUMN_NAME = 'is_leader';

SELECT COLUMN_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tb_attendance_note'
  AND COLUMN_NAME IN ('manual_hours', 'is_manual_approved');
```

If missing, apply corresponding migrations before continuing.

## 2) Environment Setup (UAT Hold Defaults)

Set compatibility-first rollout flags:

```bash
export EASYLINK_POLICY_SOURCE_MODE=legacy
export EASYLINK_DATA_SOURCE_CUTOVER_MODE=legacy_only
export EASYLINK_MACHINE_PARITY_EXPOSURE_MODE=off
export EASYLINK_REPORTING_INTERACTION_MODE=legacy
```

Set required runtime env values (`AUTH_SECRET`, `DB_*`, `EASYLINK_DEVICE_SN`, SDK connectivity envs).
Use `docs/release/env-contract.md` as the authoritative matrix.

Cookie transport rule:

```bash
# HTTPS reverse proxy / TLS terminator
unset ALLOW_INSECURE_COOKIES

# Plain LAN HTTP only
export ALLOW_INSECURE_COOKIES=true
```

Ensure migration/runtime DB targets are aligned before schema operations:

```bash
export DB_NAME=your_prod_db
export EASYLINK_DB_NAME=your_prod_db
```

## 3) Deploy

Option A (recommended): PM2

```bash
npm ci
npm run build
pm2 delete easylink-frontend || true
pm2 start npm --name easylink-frontend -- start
pm2 save
```

Option B: systemd service

```bash
sudo systemctl restart easylink-frontend
sudo systemctl status easylink-frontend --no-pager
```

## 4) Post-Deploy Smoke

```bash
curl -sS http://127.0.0.1:3000/api/auth/me
curl -sS "http://127.0.0.1:3000/api/report?from=2026-03-01&to=2026-03-31"
curl -sS "http://127.0.0.1:3000/api/attendance?from=2026-03-01&to=2026-03-31"
curl -sS http://127.0.0.1:3000/api/scanlog/sync
```

Verify:

1. Auth login/logout flow works.
2. Attendance/report pages load for admin and non-admin.
3. Machine queue status endpoint responds for admin.
4. Print/PDF previews render without holiday name text in compact cells/headers.

## 5) Rollback

Immediate rollback path:

1. Reset flags to compatibility defaults (same values as section 2).
2. Restart app process.
3. If required, run schema rollback orchestrator:

```bash
npm run migration:v3 -- --mode rollback --execute
```

4. Re-run smoke tests and freeze rollout until parity is restored.

## 6) UAT Hold Notes

During UAT hold:

1. Do not enable `canonical_read` or other aggressive cutover modes in production.
2. Do not drop legacy tables/columns.
3. Keep release changes limited to stability, docs, and non-breaking fixes.
4. Keep production as a single active app instance when relying on in-process queue workers (`/api/machine`, `/api/scanlog/sync`).
