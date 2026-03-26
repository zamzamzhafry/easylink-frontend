# Agent Restrictions & Contribution Guardrails

This document defines mandatory constraints for future AI agents and contributors.

## 1) Never break these rules

1. **Do not commit automatically** unless explicitly requested by the user.
2. **Do not bypass type safety** (`as any`, `@ts-ignore`, `@ts-expect-error` are disallowed by default).
3. **Do not remove failing tests** to make CI/build green.
4. **Do not silently change DB schema in app code** without adding/aligning migration SQL.
5. **Do not skip auth checks** for protected routes.
6. **Do not hardcode environment-sensitive endpoints** (IP/port should come from env where possible).

## 2) Change discipline

Before editing:

- Read surrounding module pattern first (`app/api/*` route style + `lib/*` helpers).
- Prefer extending existing helpers instead of duplicating logic.

After editing:

- Run `npm run typecheck`
- Run `npm run build`
- Report any missing scripts (example: there may be no `npm test` script)

## 3) API and auth consistency

- Always use `getAuthContextFromCookies()` and return:
  - `unauthorizedResponse()` when unauthenticated
  - `forbiddenResponse()` when lacking capability
- Reuse capability helpers:
  - `isAllowedGroup(...)`
  - `getAllowedGroupIds(...)`

## 4) Database and query safety

- Keep SQL parameterized (`?` placeholders), never string-concatenate user input.
- Preserve timezone assumptions (`+07:00` default currently in DB pool config).
- For heavy read changes, include fallback/rollback strategy in PR notes.

## 5) SDK integration safety (machine/scanlog)

- Do not remove existing adapter fallback behavior (`auto`, `windows-sdk`, `fingerspot-easylink-ts`).
- Prefer env priority instead of hardcoded LAN values:
  1. `EASYLINK_WSDK_BASE_URL`
  2. `EASYLINK_WSDK_IP` + `EASYLINK_WSDK_PORT`
  3. `EASYLINK_LAN_HOST` or `EASYLINK_API_HOST` fallback

## 6) Documentation requirement for major changes

Any change in these areas must update docs in the same task:

- Auth/session behavior
- DB schema or query model
- SDK endpoint contracts
- Attendance/performance computation rules
