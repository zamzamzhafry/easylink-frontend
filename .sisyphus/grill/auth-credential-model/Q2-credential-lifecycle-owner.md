# Q2 — Who owns the credential lifecycle?

**Severity**: 🟠 Architecture (bounded-context ownership)
**Status**: OPEN

---

## The finding

Employee identity and employee credentials live on **two different surfaces** with two different anchors:

| Surface | Route | Anchored on | What it writes |
|---|---|---|---|
| Employees | `app/api/employees/route.js` | **NIP** (`tb_karyawan` + `tb_karyawan_auth`, keyed by `karyawan_id`) | identity row; auth row with **empty** hash, `is_active=0` (line 156) |
| Users | `app/api/users/route.js` | **PIN / `tb_user`** (machine mirror) | sets `password_hash` + `is_active=1` via `upsertLegacyEmployeeAuth` (line 225), also `cs_employee_auth_identity` (line 565) + `tb_user` |

`tb_user` is the **machine/device mirror** — pulled from the fingerprint device through `app/api/machine/sync/route.js` (PHP bridge actions `sync_users` / `user_all`). So the surface that actually activates a login credential is the PIN/machine-centric one, while the surface that represents the real employee (NIP) leaves the credential dormant.

## Why this matters

A person's *employment identity* (NIP, contract dates, name) is created on the employees page, but their *ability to log in* is born on the users page, which is conceptually about device/PIN enrollment. The credential lifecycle is split across a bounded-context seam.

## Challenge against docs

- `CONTEXT.md` lists three identity lanes (`account`, `employee_nip`, `legacy_pin`) and says "effective auth is rebuilt server-side from DB state." It does **not** name which surface is the system of record for setting a credential. **Gap.**
- `ADR-0001 §3` says "identity resolution must be explicit and typed" and `§4` "mixed identity records must not silently disagree." A credential lifecycle split across two surfaces is exactly the kind of silent disagreement ADR-0001 wants to eliminate — but ADR-0001 covers *resolution*, not *provisioning*. **Adjacent, not covered.**

## My recommendation

**Make the employees (NIP) surface the system of record for employee credentials; treat the users/PIN surface as machine-device enrollment only.**

- Employee create/edit sets, hashes, and activates the NIP password (ties into Q3).
- The users page stops being the place a real employee's login is born; it stays responsible for PIN/device mirror data.
- `legacy_pin` lane remains a documented compatibility path, not the provisioning path.
- Capture this as an ADR ("Employee credential lifecycle is owned by the NIP surface") and add a `CONTEXT.md` glossary entry distinguishing **employee identity** (NIP) vs **device enrollment** (PIN/`tb_user`).

Reasoning: aligns the credential with the durable human identity (NIP) rather than the machine-derived PIN, which matches your stated concern that "users come from the machine, not actual employee NIP/password." It also collapses the seam ADR-0001 is trying to close.

**Dependency**: Q3 is the concrete implementation of this decision. Decide Q2 first (ownership), then Q3 (mechanics).

---

## Agent-Proposed Assessment (PROPOSED — pending human ratification)

**Status**: PROPOSED (engineering direction clear) + one DEFERRED business call.
**Source**: Oracle consult (`ses_15f4b3a55ffeFQOp7WCYQAiFmX`, 2026-06-07) + verified code facts.

**Proposed decision**: Make the **NIP/employees surface the system of record** for employee login credentials. The PIN/`tb_user`/users surface becomes **device enrollment only** and must not write password or activation state.

**Oracle reasoning**:
- Identity (NIP, contract, name) is already anchored to `tb_karyawan`/`karyawan_id` on the employees surface — credentials belong with the durable human identity, not the machine mirror.
- `tb_user` is **device-derived** (synced from the fingerprint device via `/api/machine/sync`). Anchoring credentials there means a device sync can **race or clobber** credential/activation state — re-introducing exactly the "silent disagreement" ADR-0001 §4 exists to eliminate.
- `employee_nip` is the canonical login lane in CONTEXT.md; credential ownership should sit there, with **`cs_employee_auth_identity` as the canonical store and `tb_karyawan_auth` as a projection** (do NOT keep two independent sources — that recreates divergence).

**Risks Oracle flagged (must be handled if ratified)**:
- Existing employees received credentials via the users page → a **backfill is required** so nobody is locked out when ownership flips.
- After the flip, device-sync write boundaries must be explicit: device sync **cannot touch** password/activation, or drift returns.

**🟠 DEFERRED — business judgment for human owner**:
> Does the org want device enrollment and login credentials **coupled or decoupled**? i.e. who operationally manages devices vs. who manages logins (HR vs. ops)? Oracle marks this as the one genuine business-process decision that the engineering recommendation cannot settle. The PROPOSED direction assumes **decoupled** (logins = HR/NIP, devices = ops/PIN). Confirm or override.

**Proposed doc action**: New ADR — "Employee credential lifecycle owned by the NIP surface; `cs_employee_auth_identity` canonical, `tb_karyawan_auth` projection; device sync write-boundaried." Plus a CONTEXT.md glossary entry distinguishing **employee identity (NIP)** vs **device enrollment (PIN/`tb_user`)**. Not written yet — awaits your ratification.

---

## Human Final Verdict

> Decision:
>
> Reasoning:
>
> Doc action (ADR / CONTEXT entry / none):
