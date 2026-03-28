# How to Agent (Updated Learning Notes)

## Context

During discussion and implementation, we identified that **Users page loading was slow** because the frontend fetched a full JSON list and paginated only on the client.

## What changed

1. Switched Users data flow to **server-side pagination** (`page`, `limit`, optional `search`).
2. Streamlined backend query path to avoid full-table heavy joins for every request.
3. Added clearer frontend **error state + retry** behavior for failed loads.
4. Adjusted UI hierarchy to align with architecture notes:
   - top KPI-style summary cards,
   - clear filter status,
   - paginated table as detailed layer.

## Agent implementation guidance

- Prefer **backend pagination** over client-only slicing for potentially large datasets.
- Keep UI consistent with "summary first, details next" hierarchy.
- Treat fetch failures as first-class UX states (inline error + retry), not toast-only.
- For heavy data pages, fetch only records needed for current page and scope related joins accordingly.

## Validation checklist for similar tasks

- [ ] API returns `{ total, page, limit, pages, records/users }`
- [ ] Frontend page controls drive backend query params
- [ ] Search/filter is applied server-side when dataset can grow
- [ ] Error UI offers recovery action (Retry)
- [ ] Typecheck/build/tests remain green after change
