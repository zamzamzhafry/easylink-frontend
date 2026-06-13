# Auth NIP Migration — Locked Decisions

> **Status: LOCKED. Both decisions below are RESOLVED as of 2026-06-12. Do NOT re-open.**

---

## Decision M1 — Role Key Migration Strategy

**RESOLVED 2026-06-12**

**Decision: BAN + migrate**

Convert `tb_karyawan_roles` rows:
- `scheduler` → `group_leader`
- `hr` → `admin`
- `viewer` → `employee`

Then narrow the `role_key` ENUM to the canonical set: `('admin', 'group_leader', 'employee')`.

**This is LOCKED. Do not re-open.**

---

## Decision — Placeholder NIP Policy

**RESOLVED 2026-06-12**

**Decision: BLOCK range 9990001–9990044 from login**

Placeholder NIPs in the range `9990001`–`9990044` must be blocked from logging in.
Return a unified invalid-credentials error — no enumeration of whether the NIP exists or is a placeholder.

**This is LOCKED. Do not re-open.**

---

## Reference

- Placeholder NIPs applied: 44 NULL-nip `tb_karyawan` rows filled sequentially (9990001–9990044, ordered by id, NULL-guarded).
- Map: `/tmp/nip_placeholder_report.tsv`
- Rollback: `/tmp/nip_placeholder_rollback.sql`
- Canonical role keys after migration: `admin`, `group_leader`, `employee`.
