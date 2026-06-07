
## 2026-06-05 runtime logging and rollback knobs
- Verified existing rollback/env knobs in `lib/auth-session.ts`: `EASYLINK_ENABLE_LEGACY_PIN_FALLBACK`, `EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT`, and `ALLOW_INSECURE_COOKIES`.
- No new runtime flag needed. Safe logging already emits reason-coded warnings only (`AUTH_SESSION_DECODE_FAILURE`, `AUTH_SESSION_SUBJECT_TYPE_MISMATCH`); preserve no-token/no-password policy.
- Expanded `tests/auth-hardening.test.js` to cover legacy payload rejection when compat knob is off.
- Rewrote `tests/auth-session-compat.test.js` to pin env knob expectations and keep rollback-path coverage explicit, including legacy pin compat and insecure-cookie default state.
- Verified with `node --test tests/auth-hardening.test.js tests/auth-session-compat.test.js tests/auth-login-route.test.js` (exit 0). Node emitted existing `MODULE_TYPELESS_PACKAGE_JSON` warnings only.
- `lsp_diagnostics` clean on changed auth test files.

## 2026-06-05 verification refresh
- Verification command results: 
ode --test tests/auth-hardening.test.js tests/auth-session-compat.test.js tests/auth-response-contract.test.js tests/auth-login-route.test.js tests/use-auth-session.test.js passed.
- 
pm run build passed and regenerated .next/types/**; follow-up 
pm run typecheck passed.
- 
pm run lint still fails only on unrelated non-auth docs/home files; no scoped auth fixes needed.
- Scoped diff check passed: changed files remain pp/api/auth/login/route.js, pp/api/auth/me/route.js, hooks/use-auth-session.js, lib/auth-session.ts, 	ests/auth-hardening.test.js.
