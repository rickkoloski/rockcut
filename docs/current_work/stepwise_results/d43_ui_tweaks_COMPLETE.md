# D43: UI Tweaks — Completion Record

**Status:** COMPLETE, merged to `develop` (PR #25), 2026-10-15. Not yet on prod.
**Spec:** `specs/d43_ui_tweaks_spec.md` (scenarios S143–S169)
**Plan:** `planning/d43_ui_tweaks_plan.md`
**Concept:** 02_scaffold_ui
**Branch:** `d43-ui-tweaks`, cut from `develop` (`ab66a13`). Prototype on the
local branch `local/theme-preview` (never pushed).
**DEV gate SHAs:** `7249387` (API v40 / UI v38); test-only fix `ae70ef1`;
QA fix cycle `6259eb1` (API v41 / UI v39).
**Backlog:** 4298 (G7, filed at the gate).
**QA report:** `stepwise_results/d43_dev_qa_report.md`
**Lead decisions:** `prompts/d43_lead_decisions_1.md` … `_5.md`

---

## Summary

Look-and-feel work collected with Matt on 2026-10-14/15: a new color scheme
with a dark mode, layout that gives more of the screen to content, and a set
of small readability and Scheduler fixes. One API change (the theme setting).

## What shipped

| # | Item |
|---|---|
| 1 | **Hop Field** light theme replaces Brown & Amber (PWA colors too). |
| 2 | **Hop Field Night** dark mode: lifted moss nav, green logo, nav / account / menu icons. |
| — | **Theme setting** `users.color_mode` (light / dark / device, default light): `PUT /api/me/color_mode` (people only), `color_mode` on `PATCH /api/devices/:id` (owner, or a manager of the tablet's home department via `:set_color_mode`), `/api/me` reports the tablet's mode during "Sign in as me". Chosen in the account menu; a tablet's in Admin → Shared devices. Changes in place; last mode cached per browser. |
| 3 | Board layers: page, columns (and today), cards in distinct shades. |
| 4 | Logos: black-on-clear main, green dark version. |
| 5 | Nav: Tasks under Home. |
| 6 | Page title in the top bar; breadcrumbs → "‹ Parent" on detail pages; board switcher in the bar. |
| 7 | Account menu: name, email, Profile, Theme, Log out (tablet personal sessions keep a visible Sign out). |
| 8 | View Schedule without setup buttons (Calendar sync in the filter box); Scheduler without Calendar sync. |
| 9 | Scheduler week totals under Staff; per-person hours "8 hr · 8 hr draft". |
| 10 | Staff order: ⋮ → Move (↑ ↓ or keys; Enter / Esc / Finished; a click elsewhere ends it). |
| 11 | Finished Daily card: dimmed, struck through, starts closed. |
| 12 | Notification preferences: In-app and Push only (Email, SMS hidden). |
| 13 | Position menu: department headings vs indented positions with shift-color squares. |
| 14 | Board day header in start-time order (amends D38 §3.2). |

Also from the gate: a dark theme built on MUI's dark defaults (QA G1/G2),
shift-chip text chosen by contrast and done task cards dimming only the title
(G3, approved by Matt on DEV), Move ending on any outside click (G4), a
failed theme save reverting with a message (G5), "User change log" title,
and a `fix:` for nine API tests pinned to 2026-10-14 (`43a082f`, tests only).

One migration (`20261018120001_add_color_mode_to_users`); no secrets or
dependencies.

## Testing

- **Local gate (`7249387`):** Playwright 379 passed / 1 skipped (DEV
  ribbon), `mix test` 1470 / 0, `vite build`, typecheck, lint clean on
  changed files (26 older lint errors elsewhere, task 4084).
- **DEV run 1 (`7249387`):** 377 / 1 failed (G4 stale-tab test: a timing
  race on DEV, pre-existing; test-only fix `ae70ef1`).
- **DEV run 2 (`ae70ef1`):** 380 passed, 0 failed.
- **QA pass 1:** PASS with gaps (26/27; G1–G5, title). Fixed in `6259eb1`
  with a test each (revert-checked).
- **DEV run 3 (`6259eb1`, docs after):** 391 passed, 0 failed.
- **QA recheck:** G1–G5 and the title fixed; banners and every page
  re-walked in Dark; new G7 (Light "Acting as" bar, pre-existing) → task
  4298, accepted for the backlog by Matt.
- **Matt:** done-task look approved on DEV; hands-on check on DEV ("looks
  good to me").

## Notes for the release

- Email stays hidden, not removed: before a real mail provider replaces
  `MailerNoop`, show the column again or flip the email default (spec §1.12).
- PWA icons and favicon unchanged.
- The migration adds a column with a default; no data backfill.
