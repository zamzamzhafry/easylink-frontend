# Task 2 — Auth Session Payload Shape Reference

**Wave 0 preflight — READ ONLY. No code edits made.**
**Date:** 2026-06-13
**Source files:** `lib/auth-session.ts` (850 lines), `lib/auth-hardening-helpers.js` (85 lines)

---

## 1. Token JSON Shape (canonical)

Produced by `encodeSessionToken` in `lib/auth-hardening-helpers.js` L5–14:

```js
// auth-hardening-helpers.js L5-13
export function encodeSessionToken(payload, sign, base64UrlEncode) {
  const encodedPayload = {
    sub: payload.subject,   // string: prefixed subject (e.g. "nip:12345", "account:admin01", "pin:82")
    st: payload.subject_type ?? null, // AuthSubjectType | null
    exp: payload.exp,       // unix seconds
    v: 2,                   // version constant
  };
  const raw = base64UrlEncode(JSON.stringify(encodedPayload));
  return `${raw}.${sign(raw)}`;   // base64url(JSON).HMAC-SHA256-base64url
}
```

Token wire format: `<base64url-JSON>.<HMAC-SHA256-base64url-signature>`

### Legacy payload shape (compat only)
When `decoded.sub` is absent/empty but `decoded.pin` is present,
`decodeSessionToken` (helpers L40–50) treats it as legacy: `{ subject: pin_value, payload_format: 'legacy', subject_type: 'legacy_pin' }`.

---

## 2. Subject String Formats

Defined by `AuthSubjectType` union at `auth-session.ts L70`:
```ts
export type AuthSubjectType = 'account' | 'employee_nip' | 'legacy_pin';
```

| subject_type   | `sub` field prefix | Example `sub`          | Resolved by                  |
|----------------|-------------------|------------------------|------------------------------|
| `account`      | `account:`        | `account:admin01`      | `createAuthContextByLoginId` |
| `employee_nip` | `nip:`            | `nip:20211200006`      | `createAuthContextByNip`     |
| `legacy_pin`   | `pin:`            | `pin:82`               | `createAuthContextByPin`     |

Inference logic in `decodeSession` (`auth-session.ts L278–284`):
```ts
const inferredSubjectType = payload.subject.startsWith('account:')
  ? 'account'
  : payload.subject.startsWith('nip:')
    ? 'employee_nip'
    : payload.subject.startsWith('pin:')
      ? 'legacy_pin'
      : undefined;
```

---

## 3. TTL

`auth-session.ts L16`:
```ts
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h
```
**Value: 43200 seconds (12 hours)**

Cookie `maxAge` set at `auth-session.ts L776`:
```ts
maxAge: SESSION_TTL_SECONDS,
```

---

## 4. NIP Resolve SQL (verbatim)

`createAuthContextByNip`, `auth-session.ts L500–503`:
```sql
SELECT a.karyawan_id, a.nip, k.nama, k.pin
FROM tb_karyawan_auth a
JOIN tb_karyawan k ON a.karyawan_id = k.id
WHERE a.nip = ? AND a.is_active = 1
```
Param: `[nip]` (string).
Tables: `tb_karyawan_auth` (PK=karyawan_id, nip NOT NULL UNIQUE), `tb_karyawan`.

---

## 5. `getAuthContextFromCookies` Decode Waterfall

Function at `auth-session.ts L701–742`.

### Stage 1 — normalized subject_type field present (L706–717)
Uses `normalizeSubjectType(payload.subject_type)` (helpers L1–3).

```
normalizeSubjectType(raw):
  returns raw if raw ∈ {'account','employee_nip','legacy_pin'}, else undefined
```

| Branch condition (L708, 711, 714)     | Action                                        | Guard                          |
|---------------------------------------|-----------------------------------------------|--------------------------------|
| `normalizedSubjectType === 'account'` | `createAuthContextByLoginId(subject value)`   | none                           |
| `normalizedSubjectType === 'employee_nip'` | `createAuthContextByNip(subject value)` | none                           |
| `normalizedSubjectType === 'legacy_pin'`  | `createAuthContextByPin(subject value)` | only if `LEGACY_PIN_FALLBACK_ENABLED` (L715) |

### Stage 2 — fall through: prefix-based inference (L719–728)
When `subject_type` was absent/unrecognized:

| Branch condition (line)               | Action                                        | Guard                          |
|---------------------------------------|-----------------------------------------------|--------------------------------|
| `subject.startsWith('account:')` L719 | `createAuthContextByLoginId(subject.slice(8))` | none                          |
| `subject.startsWith('nip:')` L722     | `createAuthContextByNip(subject.slice(4))`    | none                           |
| `subject.startsWith('pin:')` L725     | `createAuthContextByPin(subject.slice(4))`    | only if `LEGACY_PIN_FALLBACK_ENABLED` (L726) |

### Stage 3 — last-resort bare-value compat (L730–741)
Only executed if `LEGACY_SESSION_PAYLOAD_COMPAT_ENABLED` is true (L730).
Subject has no known prefix — try each resolver in order:

```
1. createAuthContextByLoginId(payload.subject)   → return if non-null  (L734–735)
2. createAuthContextByNip(payload.subject)        → return if non-null  (L737–738)
3. if LEGACY_PIN_FALLBACK_ENABLED:
      createAuthContextByPin(payload.subject)     → return              (L740–741)
   else: return null
```

---

## 6. `normalizeSubjectType` Function

`lib/auth-hardening-helpers.js L1–3`:
```js
export function normalizeSubjectType(raw) {
  return raw === 'account' || raw === 'employee_nip' || raw === 'legacy_pin' ? raw : undefined;
}
```
Returns the raw value unchanged if it is one of the three valid `AuthSubjectType` literals; otherwise `undefined`.
Used in: `getAuthContextFromCookies` L706, `setAuthCookie` L751.

---

## 7. Env Flag Usage

### `EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT`

Read at `auth-session.ts L38–41`:
```ts
const LEGACY_SESSION_PAYLOAD_COMPAT_ENABLED = parseEnabledFlag(
  process.env.EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT,
  true   // default: ENABLED
);
```
- **Default when unset:** `true` (enabled)
- **What it gates:**
  1. Passed to `decodeSessionToken` (L270) — controls whether legacy `{pin: ...}` shaped tokens (no `sub` field) are decoded at all (helpers L41).
  2. Gates Stage 3 bare-value fallback in `getAuthContextFromCookies` (L730) — if false, skip all three bare-value resolver attempts and return `null`.

### `EASYLINK_ENABLE_LEGACY_PIN_FALLBACK`

Read at `auth-session.ts L34–37`:
```ts
const LEGACY_PIN_FALLBACK_ENABLED = parseEnabledFlag(
  process.env.EASYLINK_ENABLE_LEGACY_PIN_FALLBACK,
  true   // default: ENABLED
);
```
- **Default when unset:** `true` (enabled)
- **What it gates:**
  1. Stage 1 `legacy_pin` branch (L715): if false, return `null` instead of calling `createAuthContextByPin`.
  2. Stage 2 `pin:` prefix branch (L726): same guard.
  3. Stage 3 last-resort PIN fallback (L740): if false, return `null`.

---

## 8. `setAuthCookie` Token Encode Call

`auth-session.ts L750–758`:
```ts
const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
const subjectType = normalizeSubjectType(options.subjectType) ?? 'account';
const token = encodeSession({
  subject: String(subject ?? '').trim(),
  subject_type: subjectType,
  exp,
  payload_format: 'canonical',
});
```
Default `subjectType` is `'account'` when caller passes none.

---

## 9. `AuthContext` Shape (full type)

`auth-session.ts L90–107`:
```ts
export type AuthContext = {
  pin: string;
  nama: string;
  privilege: number;
  is_admin: boolean;
  can_schedule: boolean;
  can_dashboard: boolean;
  is_leader: boolean;
  is_hr?: boolean;
  nip?: string;
  karyawan_id?: number;
  account_id?: number;
  login_id?: string;
  role_key?: AuthAccountRole | string;
  subject_type?: AuthSubjectType;
  groups: GroupAccess[];
  canonical_roles: CanonicalEmployeeRole[];
};
```

---

## 10. Migration Impact Notes (for Tasks 8/9)

- Current NIP-lane subject: `sub = "nip:<nip_string>"`, `st = "employee_nip"`.
- Target: `sub = "<karyawan_id_number>"`, `st = "employee_karyawan_id"` (new value — not yet in type union).
- Backward-compat decode window (12h = one TTL): Stage 2 `nip:` prefix branch (L722–723) must survive; Stage 3 bare-numeric must route to new `createAuthContextByKaryawanId`.
- `normalizeSubjectType` in helpers must expand to accept new `employee_karyawan_id` literal.
- `LEGACY_SESSION_PAYLOAD_COMPAT_ENABLED` already gates the right fallback path; no new flag needed for the transition window.
- SQL target: `SELECT ... FROM tb_karyawan WHERE id = ?` (PK lookup, always non-NULL, replaces `WHERE a.nip = ?` join).
