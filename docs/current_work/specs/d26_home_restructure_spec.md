# D26: Company-wide Home + Brewery Dashboard — Specification

**Status:** Complete (2026-09-23) — see `stepwise_results/d26_home_restructure_COMPLETE.md`
**Created:** 2026-09-23
**Author:** Matt + CC
**Depends On:** D5 (scaffold UI), D20 (department-grouped nav)

---

## 1. Problem Statement

The app began as brewing-management only, so the landing page (`/`) was the
brewers' dashboard (batch/recipe/brand stats + grids). Now that Rockcut is a
**company-wide** app (schedule, time off, availability, messaging for every
department), a brewery dashboard is the wrong default landing for non-brewers.

Split them: keep the brewers' dashboard as a **brewery-only** page, and make `/`
a **generic home for all employees** — a light landing to be filled with
at-a-glance widgets later.

---

## 2. Requirements

- [ ] **New Home (`/`)** — default landing for **every** authenticated employee.
      A welcome + quick-link cards to the areas the user can access (Schedule,
      Scheduler if manager/owner, Time off, Availability, Messages, Brewery if a
      brewery member, Users & Roles if they manage users). Placeholder for future
      widgets.
- [ ] **Brewery Dashboard** — the old Home content (stat tiles, Active Batches,
      Recent Recipes) moved to **`/brewery`**, gated to brewery members; reached
      via **Brewery → Dashboard** in the nav.
- [ ] **Nav** — a top-level **Home** link (expanded + collapsed rail); the
      Brewery section's first item becomes **Dashboard → /brewery**.
- [ ] **Routing** — `/` renders Home for all; `/brewery` only for brewery members;
      unknown paths redirect to `/` (catch-all). Remove the old "brewery users
      only, else redirect to /schedule / NoModules" landing gate.

## 3. Scope / Non-Goals

- **Out:** actual home widgets (next shift, unread counts, approvals, announcements)
  — the page is intentionally a shell for those. No backend change.
- **In:** the split, the generic landing with quick links, nav/routing updates.
