---
name: matt-pocock-ts
description: TypeScript type-design and infra hardening in the Matt Pocock / Total TypeScript style. Use when reviewing or writing TS that handles identity, role, state, config, API I/O, or domain model boundaries. Triggers on requests like "improve types", "tighten types", "ts review", or any TS file where `as`, `any`, `as unknown as`, weak generics, or boolean-flag-soup show up.
---

# Matt Pocock TS — Type Infra Hardening

Purpose: replace permissive, structurally-loose, AI-slop TS with intentional types that make wrong states unrepresentable. Domain models become arguments to the compiler, not vibes in comments.

## When to use

- New domain model, role model, auth/session/identity surface, or state machine
- API request/response shapes (zod parse boundaries)
- Any file where `as any`, `@ts-ignore`, `@ts-expect-error`, `as unknown as` appears
- Boolean-flag explosion (`is_admin`, `is_leader`, `is_hr`, `can_x`, `can_y` on one object)
- Generic function with `<T extends any>` or no constraint at all
- Config objects, role/permission tables, discriminated event payloads
- Any "looks fine but I'm not sure why" TS that needs a second pass

## Non-negotiable bans

These are repo-level bans (see `docs/agent-restrictions.md`) AND Pocock-style bans:

- `as any` — use `unknown` then narrow, or fix the source type
- `as unknown as T` — almost always a sign the source type is wrong
- `@ts-ignore`, `@ts-expect-error` — fix the type; if truly unfixable, isolate behind a typed adapter
- `Object.keys(x)` typed as `string[]` then cast — use `keyof typeof x` helper
- `function f(x: any)` — every param has a meaningful type or `unknown`
- Returning `Promise<void>` then throwing for control flow — return `Result<T, E>` or a discriminated union

## Core patterns

### 1. Branded / opaque types for identity

Anywhere two different IDs are both numbers/strings and confusing them is a real bug, brand them.

```ts
type Brand<T, B> = T & { readonly __brand: B };

export type KaryawanId = Brand<number, 'KaryawanId'>;   // immutable PK
export type EmployeeNip = Brand<string, 'EmployeeNip'>; // mutable HR field
export type AccountLoginId = Brand<string, 'AccountLoginId'>;

// Constructors live in one place. Casting outside that file is forbidden.
export const toKaryawanId = (n: number): KaryawanId => n as KaryawanId;
```

In this repo: `karyawan_id` vs `nip` vs `pin` vs `account.login_id` MUST be branded. The whole H1 bug class (mutable-NIP session subject) only existed because they were all interchangeable `string | number`.

### 2. Discriminated unions for "this OR that, never both"

```ts
type AuthContext =
  | { subjectType: 'karyawan_id'; karyawanId: KaryawanId; nip: EmployeeNip | null }
  | { subjectType: 'account';     accountId: AccountId;    loginId: AccountLoginId }
  | { subjectType: 'legacy_pin';  karyawanId: KaryawanId;  pin: LegacyPin };
```

Then `if (ctx.subjectType === 'account') ctx.loginId` narrows. No optional-field-soup, no "field present only if other field is X" comments.

### 3. `satisfies` over `as` for literals

```ts
// BAD — loses narrowness, allows typos
const roleKeys: Record<string, string> = { admin: 'admin', ... };

// GOOD — keeps literal types AND validates shape
const ROLE_KEYS = {
  admin: 'admin',
  group_leader: 'group_leader',
  scheduler: 'scheduler',
  hr: 'hr',
  viewer: 'viewer',
} as const satisfies Record<string, RoleKey>;
```

### 4. Make wrong states unrepresentable

If `is_admin = true` requires `group_id = null`, the type should enforce it. Don't enforce with a comment and a runtime guard alone. (B2 in this repo existed because `is_admin` + `group_id != null` was structurally valid TS.)

```ts
type GlobalRole  = { roleKey: 'admin' | 'hr'; groupId: null };
type ScopedRole  = { roleKey: 'group_leader' | 'scheduler' | 'viewer'; groupId: GroupId };
type RoleRow     = GlobalRole | ScopedRole;
```

### 5. Generic constraints — never bare `<T>`

```ts
// BAD
function pick<T>(obj: T, key: string) { return obj[key]; } // any leak

// GOOD
function pick<T extends object, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
```

### 6. Result types over thrown control flow

```ts
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

Throw for genuine bugs (invariant violation). Return `Result` for expected failures (bad password, soft-deleted user, rate-limited). Callers MUST handle both arms; TS will enforce it.

### 7. Zod for I/O boundaries, infer inward

```ts
const LoginInput = z.object({
  loginId: z.string().min(1),
  password: z.string().min(1),
});
type LoginInput = z.infer<typeof LoginInput>;
```

Validate ONCE at the boundary. Inside the app, types are trusted. No re-validation, no defensive `?.` after a zod parse.

### 8. `Record<K, V>` with closed K

```ts
// BAD — open keyset
const ROLE_LABEL: Record<string, string> = { admin: 'Admin' };

// GOOD — exhaustive
const ROLE_LABEL = {
  admin: 'Admin',
  group_leader: 'Leader',
  scheduler: 'Scheduler',
  hr: 'HR',
  viewer: 'Viewer',
} as const satisfies Record<RoleKey, string>;
```

TS will then error if a new RoleKey is added without a label.

### 9. `never` for exhaustiveness

```ts
function assertNever(x: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(x)}`);
}

switch (ctx.subjectType) {
  case 'karyawan_id': return handleKaryawan(ctx);
  case 'account':     return handleAccount(ctx);
  case 'legacy_pin':  return handleLegacy(ctx);
  default:            return assertNever(ctx);
}
```

Adding a 4th subjectType becomes a compile error at every switch. No more grep-and-pray refactors.

### 10. Readonly by default

`readonly` on arrays, `Readonly<T>` on params that shouldn't mutate. The mutation should be local + explicit, not ambient.

## Review checklist

Before approving any TS PR / before marking a TS task complete:

- [ ] No `any`, `as any`, `as unknown as`, `@ts-ignore`, `@ts-expect-error`
- [ ] Identity values branded if a mix-up is a real-world bug
- [ ] Variant data uses discriminated union, not optional-fields-soup
- [ ] Literal config uses `as const satisfies T`, not `as T`
- [ ] Generics have meaningful `extends` constraints
- [ ] I/O boundaries validated with zod once, trusted after
- [ ] Exhaustive switches use `assertNever`
- [ ] Errors expected by domain returned as `Result`, not thrown
- [ ] Read-only data is `readonly`
- [ ] `tsc --noEmit` clean

## Anti-patterns to grep for

```bash
grep -rn 'as any'                                    # ban
grep -rn 'as unknown as'                             # ban
grep -rnE '@ts-(ignore|expect-error)'                # ban
grep -rnE ': any[,)\s]'                              # weak param types
grep -rnE 'function .*<[A-Z]>\(' --include='*.ts'    # unconstrained generic
grep -rnE 'Record<string,'                           # open keyset (review case by case)
```

## Apply to EasyLink (priority targets)

1. `lib/auth-session.ts` — brand `karyawan_id` / `nip` / `pin` / `accountId`. AuthContext discriminated by `subjectType`. RoleRow GlobalRole | ScopedRole union.
2. `lib/domain/employee-auth-model.ts` — already the right shape, harden with branded IDs.
3. `lib/authz/authorization-adapter.ts` — Result types on permission decisions.
4. `app/api/auth/login/route.js` — port to `.ts`, zod input parse, Result-typed waterfall.
5. `lib/password.ts` — return discriminated `VerifyResult = { ok: true; needsRehash: boolean } | { ok: false; reason: 'invalid' | 'legacy_disabled' }` instead of `{ valid, needsRehash }` ambiguity.
