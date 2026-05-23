# Schedule Revision Ticketing Spec

**Status**: Active draft for review  
**Last updated**: 2026-05-22  
**Canonical context**: `docs/CONTEXT.md`  
**Related auth anchor**: `docs/adr/0001-auth-identity-resolution-and-capability-model.md`

---

## Purpose

Define target workflow, domain terms, invariants, permissions, and UI/API expectations for monthly schedule planning and revision ticketing before implementation work starts.

This spec supersedes schedule-revision parts of `docs/auth_and_schedule_revision_spec.md`, which describe an older and much simpler `pending/approved/rejected` request model.

---

## Current code anchors

Current relevant code and docs:

- `app/schedule/page.jsx`
- `app/api/schedule/route.js`
- `app/api/schedule-revisions/route.js`
- `app/api/schedule-revisions/[id]/approve/route.js`
- `app/api/schedule-revisions/[id]/reject/route.js`
- `lib/auth-session.ts`
- `lib/authz/authorization-adapter.ts`
- `lib/domain/employee-auth-model.ts`
- `docs/auth-domain-glossary.md`
- `docs/learning/role-capability-matrix.md`
- `docs/app-current-state-graph.md`

Important current-state gap:

- current `schedule-revisions` API is a stub around `tb_schedule_revision_requests`
- current approval endpoint does **not** apply payload into live schedule tables
- current route allows broader creation than locked v1 design
- current model does not express monthly scope, shared open draft ownership, explicit close state, or live version replacement

---

## Scope

This spec covers v1 schedule-domain approval only.

Included in scope:

- initial monthly schedule planning submission
- overdue/deadline exception flow for monthly planning
- running-schedule change requests through revision ticketing
- request/list/detail/review behavior for leader, member, and admin users
- audit and visibility rules for monthly schedule ticket lifecycle

Out of scope for v1:

- HR leave/sick approval workflows
- attachments/proof uploads
- urgency or SLA mechanics
- free-form ticket types
- multi-month ticket scope
- automatic schedule mutation caused by HR membership changes
- direct live schedule unlock/edit without ticket workflow

---

## Core domain model

### Policy language

Authorization language must stay aligned with current repo direction:

- canonical roles: `admin`, `group_leader`, `employee`
- effective authorization is capability-driven and scope-driven
- convenience booleans like `is_leader` and `is_admin` are compatibility projections, not final policy graph

### Business actors

#### Admin

- global cross-group visibility
- can create schedule tickets
- can approve or reject schedule tickets
- can close tickets
- may self-approve own ticket if business allows
- self-approval must stay explicitly auditable

#### Group leader

- can create and continue schedule tickets for own active group scope
- can edit draft schedule content for own active group scope
- can submit draft for approval
- cannot approve own or others' tickets unless also acting through admin authority

#### Member

- view-only in v1
- can see live schedule and ticket flow/history for own visible group scope
- cannot create, edit, submit, approve, or reject schedule tickets

### Group membership assumptions

Current business assumption for v1:

- employee belongs to one active group at a time
- employee may move group/division/status over time
- historical schedule/ticket records stay tied to original group/status at time of action
- new actions follow current active group/status
- membership/status changes do not auto-mutate live schedule

---

## Domain terms

These terms should be added to `docs/auth-domain-glossary.md` or moved into broader glossary language later.

### Live Schedule

Current authoritative approved schedule version for one `group + period_month` scope.

### Schedule Draft

Editable monthly schedule artifact for one `group + period_month + ticket_type` scope before submission.

### Submitted Schedule

Locked schedule snapshot awaiting admin decision. Content cannot change while in submitted state.

### Approval Lock

Rule that prevents schedule content edits after submission and before admin decision.

### Schedule Change Ticket

Approval artifact that carries request metadata, reason, audit flow, and proposed schedule revision for one monthly scope. `Pengajuan` maps to this concept.

### Schedule Revision Draft

Proposed editable revision derived from current live schedule for a running-schedule change.

### Approved Schedule

Submitted or revised schedule version that has been approved and promoted to live for that monthly scope.

### Rejected Schedule

Submitted schedule request that was not approved and must start a new request cycle if resubmitted.

### Approval Feedback

Admin decision commentary. Required on rejection, optional on approval.

### Effective Period

Normalized monthly business period represented as one `period_month` value even if UI uses date selectors.

---

## Ticket types

v1 ticket types are fixed controlled options only:

- `plan_submission`
- `deadline_exception`
- `schedule_change`

Rules:

- no free-text ticket types in v1
- all ticket types use same unified artifact style
- same list/detail/review model applies to leader-created and admin-created tickets

Ticket intent by type:

- `plan_submission`: normal monthly planning submission
- `deadline_exception`: reopen/unlock/admin-controlled exception path when planning window expired or special access is needed
- `schedule_change`: changes against already-live monthly schedule

---

## Scope and invariants

### Monthly normalization

Every v1 ticket is normalized to one monthly scope:

- key scope = `group_id + period_month + ticket_type`
- UI may use date controls or date ranges
- business storage and uniqueness normalize to one month

### One open artifact rule

There is exactly one open draft/ticket per:

- `group_id`
- `period_month`
- `ticket_type`

Implications:

- no competing parallel drafts for same monthly scope
- if another authorized leader starts same request, system reuses existing open artifact
- UI opens existing draft/ticket instead of creating duplicate
- audit trail still records who edited, commented, and submitted

### Shared group ownership

Draft operational ownership is group-scoped, not permanently tied to one person.

Implications:

- removed leader loses authority immediately
- another current active leader of same group may continue open draft if authority still applies
- authorship history remains personal and auditable

### Close behavior

Ticket is operationally open until admin closes it.

Implications:

- approval does not auto-close ticket
- rejection ends current approval request cycle
- new attempt after rejection requires new draft/ticket cycle
- approved workflow may still remain open until explicit admin close if business process requires it

---

## Lifecycle

### Primary states

Recommended v1 lifecycle:

1. `draft`
2. `submitted`
3. `approved`
4. `rejected`
5. `closed`

### State semantics

#### `draft`

- editable by authorized leader/admin creator within scope
- members cannot see private draft editing state
- if shared by multiple leaders, header shows last editor, last updated, current status

#### `submitted`

- schedule content locked
- approval target frozen
- comments/discussion may continue
- leader cannot edit submitted schedule content until decision

#### `approved`

- decision recorded
- new monthly live schedule version becomes effective immediately in v1
- previous live version preserved as history
- ticket may remain open until admin closes it

#### `rejected`

- current approval cycle ends
- rejection feedback required
- no reopen of same approval request
- future retry uses new draft/ticket cycle, optionally referencing prior rejected ticket

#### `closed`

- administrative closure of ticket workflow after operational completion

---

## Workflow by scenario

### 1. Initial monthly planning

1. Leader opens monthly planning for own group.
2. System creates clean monthly scaffold.
3. Scaffold pre-fills:
   - active group members
   - monthly calendar grid
   - holiday markers
4. No default shift assignments are prefilled.
5. Leader edits draft.
6. Leader submits monthly schedule.
7. Admin approves or rejects.
8. If approved, version becomes live immediately.
9. Ticket remains open until admin closes if operationally needed.

Notes:

- copy-forward from previous month is out of scope for v1 except maybe future optimization for limited fixed-pattern staff
- monthly planning usually starts from scratch due to holidays and monthly changes

### 2. Deadline exception / overdue planning

1. Planning window is overdue or expired.
2. Ticketing system becomes formal lock/unlock or exception path.
3. Leader or admin creates `deadline_exception` ticket.
4. Admin reviews and may approve, reject, or later close.
5. If admin raises own exception ticket and self-approves, audit must explicitly show same-person path.

### 3. Running schedule change

1. Live monthly schedule already exists.
2. Direct live mutation is not allowed through leader workflow.
3. Leader or admin creates `schedule_change` ticket.
4. System creates proposed revision draft from current live version.
5. Draft is edited within same monthly scope.
6. Draft submitted for review.
7. If approved, approved result becomes new full live version for that `group + period_month`.
8. UI may show diff-focused changed rows/cells, but storage semantics treat approved result as new full live version.

---

## Approval unit

Approval unit is one whole `group + period_month` schedule ticket.

Implications:

- leader edits monthly schedule for one group and one month
- submits one approval artifact for that scope
- admin reviews whole batch
- UI may still show employee-level or cell-level diffs inside that batch
- approved result becomes active monthly live schedule version for that scope

---

## Live version semantics

Live schedule remains authoritative until approval changes it.

Rules:

- no direct unlock of current live rows for leader editing
- runtime changes produce proposed revision draft attached to ticket
- approval promotes new full live version
- old live version remains historical
- ticket should link previous live version and approved live version

Approval transaction should atomically:

1. record approval decision
2. preserve old live version as history
3. promote approved version to current live version
4. keep audit link from ticket to approved version

---

## Permission and visibility rules

### Schedule access summary

#### Admin

- sees all groups
- can create tickets
- can edit drafts created under admin authority
- can approve/reject
- can close tickets
- can self-approve, with explicit audit mark
- can search/filter across all visible records

#### Group leader

- sees own group ticket flow/history
- can create `plan_submission`, `deadline_exception`, `schedule_change` within own scope
- can continue shared open draft for own group scope
- can submit
- cannot approve/reject unless acting through admin authority

#### Member

- sees current live schedule for own group
- sees ticket list/flow/status for own group
- cannot see private pre-submission draft editing state
- cannot create or edit tickets

### Visibility follows scope

- member/leader visibility is group-scoped to their visible group data
- admin visibility is global across groups
- search follows same visibility scope as list visibility
- history stays tied to original group at time of action

---

## Search, filters, list, and detail UX

### Default list behavior

- default focus is open/current items
- full history remains preserved and visible by permission
- history should be accessible by filter or button
- default sort is newest updated/open items first

### v1 filters

Base filters:

- `status`
- `month`
- `ticket_type`

Admin extra filters:

- `group`
- `requester`

### v1 text search

Simple text search should exist in v1.

Useful search targets:

- ticket id
- requester
- reason text

Search follows same permission scope as list visibility.

### Compact list row fields

Each list row should show at least:

- `status`
- `ticket_type`
- `group`
- `month`
- `requester`
- `updated_at`

### Shared draft header

When user opens existing shared draft, header should show:

- last editor
- last updated time
- current status

### Ticket detail view

Ticket detail is monthly-ticket based. It always belongs to one normalized `group + period_month + ticket_type` scope.

Default detail composition:

- top summary/meta
- request reason/comment
- approval history/timeline
- schedule diff or action area for that same monthly scope

If request targets older month:

- it still uses one monthly ticket scope
- timeline, diff, and action area remain anchored to that older `period_month`
- revision of older month is allowed only if business/admin rules permit it

---

## Form behavior

### Request form

v1 request form should include at least:

- controlled `ticket_type` dropdown
- normalized monthly period selector
- group scope derived from user authority
- required free-text request reason/comment
- request metadata and ticket status context

### Admin decision form

Decision UI should expose:

- `Approve` button
- `Reject` button
- comment box

Feedback rules:

- rejection comment required
- approval comment optional

No separate `return_for_revision` state in v1.

---

## Audit rules

Audit must preserve at least:

- requester identity
- current and historical group scope
- who last edited draft
- who submitted
- who approved or rejected
- whether approval was self-approval
- timestamps for create/edit/submit/approve/reject/close
- reason text
- approval feedback
- links from ticket to prior and promoted live schedule versions

Self-approval must be explicit in stored data and UI.

---

## Suggested entity shape

Minimum logical fields for target ticket model:

- `id`
- `ticket_type`
- `scope_type` = `group_month`
- `group_id`
- `period_month`
- `requester_user_id`
- `request_reason`
- `request_payload`
- `status`
- `approval_feedback`
- `approved_by`
- `approved_at`
- `closed_by`
- `closed_at`
- `is_self_approved`
- `live_schedule_version_from`
- `proposed_schedule_version_to`
- `last_edited_by`
- `last_edited_at`
- `submitted_at`
- `rejected_at`
- `created_at`
- `updated_at`

Optional later fields:

- `related_ticket_id`
- attachments/proof fields
- urgency metadata

---

## Constraints against current code

Current code/doc mismatches that future implementation must resolve:

1. `app/api/schedule/route.js` still uses direct `is_admin || is_leader` write gate instead of fully capability/scope-shaped schedule mutation model.
2. `app/api/schedule-revisions/route.js` currently allows any authenticated creator and does not enforce v1 leader/admin-only creation or monthly uniqueness.
3. existing revision request model is `pending/approved/rejected`; target model requires `draft/submitted/approved/rejected/closed` semantics.
4. approval endpoint currently does not promote payload into new live schedule version.
5. current docs matrix still implies `group_leader` may approve/reject under legacy compatibility logic; target v1 business rule is admin-only approval.

These are deliberate implementation gaps, not reasons to weaken target design.

---

## Documentation follow-up required

When this spec is accepted, follow-up docs should be aligned:

1. `docs/README.md`
   - add this spec under core docs or specs section
2. `docs/CONTEXT.md`
   - add this spec into canonical docs map or active focus references
3. `docs/auth-domain-glossary.md`
   - add schedule ticketing domain terms from this spec
4. `docs/learning/role-capability-matrix.md`
   - update approval row to admin-only v1 target, with current-state note if implementation still differs
5. `docs/app-current-state-graph.md`
   - note schedule ticketing target flow if graph is refreshed
6. `docs/auth_and_schedule_revision_spec.md`
   - mark stale/superseded and point here

---

## Open implementation review questions

These are not open business questions. They are implementation review checkpoints for Momus/Oracle before code:

1. whether this should stay one spec or also produce ADR for schedule approval architecture
2. whether schedule ticketing should reuse existing `tb_schedule_revision_requests` table or move to new versioned schedule/ticket schema
3. how to model monthly live schedule version chain safely with current `tb_schedule` shape
4. where exact shared authorization boundary should live so route-local checks converge over time
5. how much of current `app/schedule/page.jsx` can be reused versus split into ticket-aware subflows
