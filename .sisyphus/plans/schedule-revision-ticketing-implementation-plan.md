# Schedule Revision Ticketing Implementation Plan

## Goal

Implement monthly schedule ticketing and approval workflow defined in `docs/specs/schedule-revision-ticketing-spec.md` without weakening locked business rules.

## Inputs

- `docs/specs/schedule-revision-ticketing-spec.md`
- `docs/CONTEXT.md`
- `docs/auth-domain-glossary.md`
- `docs/adr/0001-auth-identity-resolution-and-capability-model.md`
- `app/api/schedule/route.js`
- `app/api/schedule-revisions/route.js`
- `app/api/schedule-revisions/[id]/approve/route.js`
- `app/api/schedule-revisions/[id]/reject/route.js`
- `app/schedule/page.jsx`
- `components/schedule/schedule-grid.jsx`
- `components/schedule/bulk-assign-modal.jsx`
- `components/ui/modal-shell.jsx`
- `lib/auth-session.ts`
- `lib/authz/authorization-adapter.ts`
- `lib/domain/employee-auth-model.ts`
- `migration_v2_auth_and_scanlog.sql`
- `docs/learning/demo_easylink clean structure export.md`

## Concrete anchors

### Current schema anchors

- `migration_v2_auth_and_scanlog.sql` lines 37-52 define current `tb_schedule_revision_requests` migration shape
- `docs/learning/demo_easylink clean structure export.md` lines 524-539 show exported live table definition for `tb_schedule_revision_requests`

### Current UI anchors

- `app/schedule/page.jsx` is current monthly schedule surface and main integration point
- `components/schedule/schedule-grid.jsx` is current schedule grid rendering anchor
- `components/schedule/bulk-assign-modal.jsx` is reusable modal pattern within schedule domain
- `components/ui/modal-shell.jsx` is reusable shell for ticket detail/request/review modal flows if modal approach is chosen

### Expected new UI file targets

Phase 5 should not hunt for locations. Start from these exact paths:

- edit `app/schedule/page.jsx`
- reuse or extend `components/schedule/schedule-grid.jsx`
- optionally create `components/schedule/ticket-list.jsx`
- optionally create `components/schedule/ticket-detail-panel.jsx`
- optionally create `components/schedule/ticket-request-form.jsx`
- optionally create `components/schedule/ticket-timeline.jsx`
- optionally reuse `components/ui/modal-shell.jsx` for detail/review flow
- if API surface expands beyond current stub, extend `app/api/schedule-revisions/**` first before adding new nested routes

## Locked business rules

1. One open artifact per `group_id + period_month + ticket_type`.
2. Monthly scope normalized to one `period_month`.
3. Ticket types fixed to `plan_submission`, `deadline_exception`, `schedule_change`.
4. Only leader and admin can create schedule tickets.
5. Only admin can approve or reject.
6. Members are view-only.
7. Submitted schedule content is immutable until decision.
8. Approval promotes new live version immediately.
9. Old live version remains history.
10. Ticket stays open until admin closes.
11. Rejection ends request cycle; retry requires new ticket.
12. Shared draft ownership is group-scoped; current active leader can continue open draft.
13. Search/filter/list visibility follows same permission scope as ticket visibility.
14. Self-approval by admin is allowed but must be explicit in audit.

## Current-state gaps

1. `app/api/schedule-revisions/**` is stub-only and uses `pending/approved/rejected`.
2. Current approval endpoint does not promote payload into live schedule tables.
3. Current route allows broader creation than target leader/admin-only model.
4. Current auth checks still rely on compatibility shortcuts like `is_hr` and direct `is_leader` checks.
5. Current model does not express monthly scope, close state, shared draft ownership, version chain, or uniqueness invariant.

## Target architecture

Oracle-driven architecture direction:

- treat this as **new schedule-ticket lifecycle architecture**, not small patch on current stub
- separate three concerns explicitly
- do not treat `tb_schedule_revision_requests` as safe final model by default
- keep authorization capability-driven and group-scope-driven, not compatibility-shortcut-driven
- formalize architecture in ADR before or during implementation if schema/lifecycle split is confirmed

Separate three concerns:

1. Ticket lifecycle record
   - stores ticket metadata, status, requester/reviewer/closer, comments, audit, scope
2. Versioned schedule content record
   - stores draft/submitted/approved schedule content snapshots for one `group_id + period_month`
3. Live-version pointer
   - identifies current authoritative live schedule version for one monthly scope

Oracle constraints to preserve:

- current `app/api/schedule-revisions/**` stub violates locked rules around state model, approval authority, and version promotion
- approval flow must not be considered complete unless decision record, historical preservation, and live promotion metadata all succeed together
- open-artifact uniqueness must be enforced on normalized monthly scope
- if old rows in `tb_schedule_revision_requests` cannot map cleanly to new semantics, use new tables or companion tables instead of ambiguous in-place mutation
- route-local raw `is_hr` / `is_leader` checks must not remain final authority for review decisions

Do not rely on existing `tb_schedule_revision_requests` as-is for final architecture unless migration work proves it can safely express target semantics without ambiguous old-row meaning.

## Implementation phases

### Phase 1 — schema + data model design

Starting anchors:
- `migration_v2_auth_and_scanlog.sql` lines 37-52
- `docs/learning/demo_easylink clean structure export.md` lines 524-539

Required decision gate before schema commit:
- explicitly choose one path:
  1. new schedule ticket tables + version tables
  2. companion tables around legacy `tb_schedule_revision_requests`
  3. in-place extension of legacy table **only if** semantics remain unambiguous for old rows
- if ambiguity remains, default to option 1 or 2, not 3

Deliverables:
- define target tables or companion tables for ticket lifecycle, schedule versions, and live pointer
- define normalized `period_month`
- define DB uniqueness for one open artifact per `group_id + period_month + ticket_type`
- define audit fields for create/edit/submit/approve/reject/close/self-approval
- decide migration stance for legacy `tb_schedule_revision_requests`

Success criteria:
- schema can represent all locked business rules without overloading old `pending` request shape
- uniqueness and lifecycle constraints are DB-enforceable
- migration stance for old `tb_schedule_revision_requests` rows is explicit, not implied

Executable QA:
- Tool: `read`
- Steps:
  1. read `migration_v2_auth_and_scanlog.sql` around `tb_schedule_revision_requests`
  2. read `docs/learning/demo_easylink clean structure export.md` around exported table DDL
  3. compare proposed schema against locked rules and old columns (`revision_type`, `payload`, `status`, reviewer fields)
- Expected result:
  - plan names whether old table is extended, wrapped by companion tables, or replaced
  - plan explicitly covers `period_month`, `ticket_type`, `closed` semantics, uniqueness, audit, and version links

### Phase 2 — authz boundary hardening

Deliverables:
- centralize schedule ticket permission checks in capability/scope-driven helpers
- remove final-authority dependence on raw `is_hr` and direct `is_leader` route-local shortcuts for ticket lifecycle decisions
- align leader/admin/member behavior with canonical policy direction
- define exact review authority boundary so all protected schedule-ticket decisions converge on shared authz helpers instead of route-local drift

Success criteria:
- create, edit, submit, review, close, list, search all flow through clear capability + scope checks
- admin-only approval rule enforced server-side

Executable QA:
- Tools: `read`, `grep`, `lsp_diagnostics`
- Steps:
  1. grep for `is_hr`, `is_leader`, `can_schedule`, and schedule revision auth checks in `app/api/schedule-revisions/**`, `app/api/schedule/route.js`, `lib/auth-session.ts`, `lib/authz/authorization-adapter.ts`
  2. confirm new helper boundaries replace route-local approval authority shortcuts
  3. run `lsp_diagnostics` on changed auth files
- Expected result:
  - create/list/edit/submit/approve/reject/close paths map to capability + scope checks
  - admin-only approval rule no longer depends on legacy `hr` alias semantics
  - diagnostics clean on changed auth files

### Phase 3 — ticket lifecycle API

Deliverables:
- replace stub create/list/approve/reject behavior with lifecycle-aware API
- support states `draft`, `submitted`, `approved`, `rejected`, `closed`
- enforce immutable submitted content
- enforce rejection feedback required, approval feedback optional
- enforce one-open-artifact rule
- enforce reopen-via-new-ticket after rejection

Success criteria:
- API semantics match spec exactly
- invalid state transitions blocked server-side

Executable QA:
- Tools: `read`, `grep`, `lsp_diagnostics`
- Steps:
  1. inspect `app/api/schedule-revisions/route.js` and nested routes for explicit state transition handling
  2. verify there is a path for create/open existing, submit, approve, reject, and close
  3. verify submitted content mutation is blocked after `submitted`
  4. verify rejection requires feedback and follow-up retry uses a new ticket path
  5. run `lsp_diagnostics` on changed API files
- Expected result:
  - all five lifecycle states exist or are clearly represented
  - duplicate open artifact for same `group_id + period_month + ticket_type` is blocked or rerouted to existing artifact
  - diagnostics clean on changed API files

### Phase 4 — version promotion flow

Deliverables:
- build atomic approval transaction
- preserve previous live version as history
- promote approved version to live immediately
- keep ticket links to prior and promoted live versions
- prevent partial success states where ticket says approved but live-version pointer/history chain is incomplete

Success criteria:
- approval transaction is atomic and auditable
- live schedule stays authoritative until approval

Executable QA:
- Tools: `read`, `grep`, `lsp_diagnostics`
- Steps:
  1. inspect approval code path for transaction boundaries and version-link writes
  2. verify approval writes decision metadata, preserves old live version, and promotes new live version in one transactional flow
  3. verify ticket keeps links to prior and promoted versions
  4. run `lsp_diagnostics` on changed approval/version files
- Expected result:
  - approval path cannot leave ticket approved without live version promotion metadata
  - previous live version remains queryable as history
  - diagnostics clean on changed files

### Phase 5 — schedule UI integration

Exact UI file targets:
- edit `app/schedule/page.jsx`
- reuse or extend `components/schedule/schedule-grid.jsx`
- optionally create `components/schedule/ticket-list.jsx`
- optionally create `components/schedule/ticket-detail-panel.jsx`
- optionally create `components/schedule/ticket-request-form.jsx`
- optionally create `components/schedule/ticket-timeline.jsx`
- optionally reuse `components/ui/modal-shell.jsx`
- optionally retire or adapt `components/schedule/bulk-assign-modal.jsx` patterns where useful

Deliverables:
- adapt `app/schedule/page.jsx` into ticket-aware monthly workflow
- support clean monthly scaffold for planning drafts
- support existing-open-artifact reuse instead of duplicate creation
- shared draft header shows last editor, last updated, status
- list view supports default open/current focus, compact fields, search, and filters
- detail view shows summary, reason, timeline, diff/action area for same monthly scope

Success criteria:
- member/leader/admin UX matches locked visibility and workflow rules
- older-month revision still uses same monthly ticket model where allowed

Executable QA:
- Tools: `read`, `grep`, `lsp_diagnostics`
- Steps:
  1. inspect `app/schedule/page.jsx` and any new `components/schedule/ticket-*.jsx` files
  2. verify list rows expose `status`, `ticket_type`, `group`, `month`, `requester`, `updated_at`
  3. verify filters include `status`, `month`, `ticket_type` and admin extras `group`, `requester`
  4. verify detail view includes summary, reason, timeline, and monthly diff/action area
  5. verify shared open artifact reuses existing draft instead of creating duplicate UI path
  6. run `lsp_diagnostics` on changed page/component files
- Expected result:
  - UI file locations are explicit and discoverable
  - member/leader/admin visibility rules match spec
  - diagnostics clean on changed UI files

### Phase 6 — docs alignment

Deliverables:
- update `docs/README.md`
- update `docs/CONTEXT.md`
- update `docs/auth-domain-glossary.md`
- update `docs/learning/role-capability-matrix.md`
- mark `docs/auth_and_schedule_revision_spec.md` as superseded
- add ADR if review confirms architecture should be formalized

ADR expectation:
- if implementation keeps explicit split between lifecycle record, versioned content record, and live pointer, create ADR before or alongside code changes
- ADR should capture why old `pending` request stub was insufficient and why admin-only approval + atomic live promotion are architectural rules, not local endpoint behavior

Success criteria:
- canonical docs no longer contradict implementation target

Executable QA:
- Tools: `read`, `lsp_diagnostics`
- Steps:
  1. read changed docs and confirm new spec/ADR cross-links exist
  2. confirm superseded old doc points to new spec
  3. confirm glossary covers schedule ticketing terms introduced by spec
  4. run `lsp_diagnostics` on changed markdown files
- Expected result:
  - docs point readers to canonical current schedule ticketing design
  - no markdown diagnostics on changed files

## Risks

1. Trying to mutate current stub in place may preserve incompatible semantics from legacy `pending` rows.
2. Route-local auth checks may drift from canonical policy if not centralized first.
3. Schedule versioning may become unsafe if live pointer/history separation is skipped.
4. UI may become too coupled to old direct-edit schedule page if lifecycle boundaries are not explicit.

## Verification requirements

1. New schema/invariants reviewed before build.
2. Changed files pass `lsp_diagnostics`.
3. Each phase must include executable QA with tool + steps + expected result.
4. Implementation verification must prove:
   - admin-only approval
   - one open artifact invariant
   - submitted-content immutability
   - rejection requires new ticket cycle
   - approval promotes new live version and preserves previous one
   - search/filter visibility obeys scope rules

## Oracle-driven architecture mandates

1. Treat current `app/api/schedule-revisions/**` as legacy stub, not implementation target.
2. Do not keep approval authority on compatibility aliases like `is_hr`.
3. Make one-open-artifact invariant DB-backed, not UI-only.
4. Make approval transaction atomic across decision record, live pointer update, and version-history preservation.
5. Prefer new tables or companion tables over ambiguous mutation of legacy `tb_schedule_revision_requests` rows.
6. Escalate to ADR when schema/lifecycle split is confirmed.

## Open review questions for Momus

1. Is decomposition clear enough for safe implementation delegation?
2. Are any success criteria unverifiable or ambiguous?
3. Should ADR creation be mandatory before code or can it follow accepted spec?
4. Is migration stance for `tb_schedule_revision_requests` explicit enough, or does plan need stronger decision gate first?
5. Are Oracle mandates now concrete enough to prevent accidental in-place patching of legacy stub semantics?
