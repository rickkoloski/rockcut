# D20: Department-Grouped Navigation — Complete

**Spec:** none — a directed UX change (no formal spec phase; see Deviations).
**Completed:** 2026-09-22
**Concept:** 06_auth_roles / 02_scaffold_ui

---

## Summary

Restructured the left-hand navigation from a flat list into **collapsible
headings**: a top-level **Schedule** section, one heading **per department**
(shown only to its members), an **Admin** section, and **Messages** (renamed from
"Activity"). Schedule's agenda and grid views became two menu items backed by two
routes. Frontend-only — no backend or data-model changes.

---

## Implementation Details

### Menu structure (top → bottom)

- **Schedule** (all signed-in users)
  - **View Schedule** → `/schedule` (agenda view)
  - **Scheduler** → `/scheduler` (week grid; owner/manager only)
  - **Time off** → `/time_off`
- **Department headings**, grouped and **alphabetical**, each visible only to
  users assigned to that department (owners see all):
  - **Bar**, **Office**, **Sales** — no pages yet → disabled *"Coming soon"* child
  - **Brewery** — Home, Brands & Recipes, Ingredient Library, Batches, Settings
- **Admin** (owner/manager) → **Users & Roles** (`/users`)
- **Messages** (all users; renamed from "Activity") → **Alerts** (owner-only) —
  the existing owner activity feed (`/activity`), keeping its pending badge.
  Non-owners see Messages with a *"coming soon"* placeholder (a hook for future
  employee messaging).

### How gating works (no backend change)

- **Department headings** are driven by `capabilities.modules`: for a member it is
  their department keys; for an owner it is all assignable keys — so filtering
  `modules` (minus `"schedule"`) through a static label/icon map yields exactly
  the headings a user may see. Unknown keys are ignored defensively.
- **Scheduler / Admin** gate on `is_owner || manages_departments.length > 0` and
  `can_manage_users` respectively (both already on the frontend).
- "Bar" kept as its stored name (the department the owner refers to as "Taproom");
  a rename was explicitly deferred.

### Schedule agenda/grid split

- `Schedule.tsx` gained an optional `forceView?: 'agenda' | 'week'` prop. When set,
  it pins the view (via an effect) and hides the in-page Agenda/Week toggle, so the
  menu drives the view. `/schedule` → `agenda`, `/scheduler` → `week` (the
  `/scheduler` route is only registered for owners/managers). Page title/breadcrumb
  reads "Scheduler" for the grid, "Schedule" for the agenda.

### Collapsed rail

- In the icon-only rail, section icons render with tooltips; clicking one reopens
  the drawer and expands that section. Sections auto-open when they contain the
  active route; Schedule defaults open.

### Key Files

| File | Change |
|------|--------|
| `rockcut-ui/src/App.tsx` | Nav rebuilt as collapsible `NavSection[]`; `/scheduler` route; `Messages`/`Alerts`; stricter `isSelected` (prefix-boundary match so `/schedule` ≠ `/scheduler`) |
| `rockcut-ui/src/pages/schedule/Schedule.tsx` | `forceView` prop; pin view + hide toggle; title by view |

---

## Testing

- [x] `tsc --noEmit -p tsconfig.app.json` clean (only the pre-broken
      `../../shared` datagrid errors remain, as expected).
- [x] `vite build` succeeds; ESLint clean on changed files.
- [x] Backend untouched → ExUnit unaffected (141 passing baseline).

---

## Deviations from Process

- **No spec phase.** Implemented directly at the owner's request as an interactive
  UX change. Recorded here after the fact. Departments other than Brewery have no
  content pages yet, so their headings are intentionally empty placeholders.

---

## Follow-Up Items

- [ ] Give Bar/Office/Sales real landing pages (removes their placeholders).
- [ ] Optional: rename the "Bar" department to "Taproom".
- [ ] Build out **Messages** into employee messaging/notes (beyond owner Alerts).
- [ ] Fold the responsive-nav behavior into the **D19** PWA mobile-baseline pass.

---

## Notes

Commit: `4d59f86`. Numbered D20 though completed before D19 (PWA) is implemented —
IDs are identifiers, not an order; D19 stays reserved for the PWA work already
specced this session.
