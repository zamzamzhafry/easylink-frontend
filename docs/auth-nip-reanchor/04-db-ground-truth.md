# DB Ground Truth (Live `demo_easylinksdk`)

From Task 1 preflight, still current. DB @ `127.0.0.1:3306`, user `easylink`.

---

## Schema findings (critical vs plan)

| Object | Reality | Plan assumed |
|---|---|---|
| `tb_karyawan.nip` | **TEXT, nullable, NO index, NOT UNIQUE** | UNIQUE (wrong) |
| `tb_karyawan_auth.nip` | varchar(50) **UNIQUE** — only unique credential handle | the column to DROP |
| `tb_karyawan` PK | `id` int AUTO_INCREMENT | — |
| `tb_karyawan.isDeleted` | tinyint(1) default 0 (exists) | — |

138 `tb_karyawan` rows, 0 NULL nips. 44 placeholders confirmed in range `9990001–9990044`.

## The 6 auth rows (`tb_karyawan_auth JOIN tb_karyawan`)

| karyawan_id | auth.nip | is_active | k.nip | nama | role |
|---|---|---|---|---|---|
| 9999 | ADMIN01 | 0 | 9990044 | Super Admin | admin / NULL |
| 10003 | HRD01 | 0 | HRD01 | HRD | — |
| 10004 | 99999 | 0 | 99999 (empty hash) | Test SN Fix | — |
| 10006 | admin001 | 1 | admin001 | Seed Admin 001 | admin / NULL |
| 10007 | leader001 | 1 | leader001 | Seed Leader 001 | group_leader / grp32 |
| 10008 | employee001 | 1 | employee001 | Seed Employee 001 | viewer / grp32 |

- All 3 active rows bcrypt `$2b$`. The one non-bcrypt row (`kar10004`, empty hash) is inactive.
- Login password for the seed accounts is `password`.
- Account lane: `admin01` / `Admin@123` in `auth_accounts` (separate from NIP lane).
- **No scheduler, no hr rows exist** → why T4 shrinks to `viewer→employee` only.

## Roles after T11 backfill

`tb_karyawan_roles` group_leader rows: **5** (was 1).

| karyawan_id | role_key | group_id |
|---|---|---|
| 10007 | group_leader | 32 (pre-existing) |
| 2 | group_leader | 2 (backfilled) |
| 23 | group_leader | 7 (backfilled) |
| 29 | group_leader | 9 (backfilled) |
| 108 | group_leader | 9 (backfilled, multi-leader with kar29) |

Plus admin/NULL rows for kar9999 and kar10006; viewer/grp32 for kar10008.

## Audit tables (additive, applied)

| Table | Rows | Source |
|---|---|---|
| `tb_role_change_audit` | 6 | T5 + T11 grant/revoke cycles |
| `tb_password_reset_audit` | 2 | T19 admin reset cycle |

## Session token facts (T2)

- Wire format: `<base64url-JSON>.<HMAC-SHA256>`; JSON fields `sub`, `st`, `exp`, `v`.
- `SESSION_TTL_SECONDS = 43200` (12h); cookie `maxAge` = same.
- Subject types: `account` (prefix `account:`), `employee_nip` (`nip:`), `legacy_pin` (`pin:`).
- Current NIP resolve SQL: `... WHERE a.nip = ? AND a.is_active = 1` (login keys on the unique handle).
- Decode waterfall: explicit `st` → prefix inference → bare-value last resort (gated by
  `EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT`, default true). PIN paths gated by
  `EASYLINK_ENABLE_LEGACY_PIN_FALLBACK`, default true.

## Environment notes

- Dev server up on `:3000` (tmux `elworkspace`).
- `.env` has `ALLOW_INSECURE_COOKIES=true` (dev knob) → causes 1 pre-existing test failure
  when running with `--env-file=.env`. Not a regression.
- Tests: `node --import tsx --env-file=.env --test tests/<file>.test.js` (no npm test script).
- `npm run build` fails offline on Google-Fonts ETIMEDOUT — environmental, not a code issue.
- `npm run typecheck` (`tsc --noEmit`) is the authoritative gate.
