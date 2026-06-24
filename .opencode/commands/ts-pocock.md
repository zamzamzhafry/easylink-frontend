---
description: Pocock-style TypeScript review pass on a file/dir. Brands, discriminated unions, satisfies, exhaustiveness, Result types. Bans any/ignore/expect-error.
agent: build
---

Run a Matt Pocock-style TypeScript review on: $ARGUMENTS

Load the `matt-pocock-ts` skill first. Then for the target path(s):

1. Read all `.ts` / `.tsx` files in scope.
2. Run `tsc --noEmit` to confirm baseline is clean (or note pre-existing errors).
3. Grep for banned patterns:
   - `as any`, `as unknown as`, `@ts-ignore`, `@ts-expect-error`
   - `: any` in params/returns
   - Unconstrained generics `<T>(` (no `extends`)
   - Optional-field-soup that should be discriminated unions
   - `Object.keys(x)` cast to typed keys
4. Identify identity values that should be branded (any place two same-primitive IDs can be confused).
5. Identify literal config objects using `as` that should use `as const satisfies T`.
6. Identify thrown control flow that should be `Result<T, E>`.
7. Identify switches over union types missing `assertNever` exhaustiveness.

Produce a structured report:

## Findings
- File:line — issue → suggested fix (1 line)

## Priority
- BLOCKER: bans violated (any/ignore/expect-error)
- HIGH: identity mix-up risk, missing discriminated union, missing exhaustiveness
- MEDIUM: weak generics, open Record keysets, satisfies opportunities
- LOW: readonly hygiene, naming

## Recommended diff
For TOP 3 highest-impact fixes, produce minimal patch (full file path + before/after).

DO NOT auto-apply. Wait for user approval before editing.

If $ARGUMENTS is empty, default to scanning `lib/**/*.ts` and `app/**/*.ts`.
