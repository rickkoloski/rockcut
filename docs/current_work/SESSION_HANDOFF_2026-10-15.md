# Session Handoff — 2026-10-15

> **Update (evening): D43 is COMPLETE and merged to `develop`** (PR #25,
> merge `a0fa758`). DEV gate PASS: DEV runs 377/1 → 380/0 → 391/0; QA pass 1
> PASS with gaps, fixes in `6259eb1`, recheck PASS; G6 by design; G7 (Light
> "Acting as" bar contrast) → **task 4298**, backlog per Matt. Matt approved
> the done-task look and did his hands-on check on DEV. **DEV is free** and
> runs `develop` (API v42 / UI v40, reseeded; conv 80 msg 89762). Record:
> `stepwise_results/d43_ui_tweaks_COMPLETE.md`. **Not on prod** — a release
> is Matt's call (alone or with D44). Local checkout is on `develop`; the
> `theme-servers` herdr tab still runs the local servers. QA folder
> `~/src/rockcut-d43-qa/` and scratch `~/src/rockcut-d43-scratch/` can be
> deleted once the release is done. The sections below are earlier in the day.

Supersedes `SESSION_HANDOFF_2026-10-14b.md`. **D43 (UI tweaks): scope closed
at 14 items (Matt, end of session).** D44 is scoped. Nothing is on DEV or
prod; all of D43 is an uncommitted prototype on a local branch.

## Where things are

| | State |
|---|---|
| **Prod** | Unchanged: `v2026.10.14` (API v26 / UI v21). See the 10-14b handoff for rollback refs. |
| **DEV** | Free (conv 80). Runs D40 `9dae539`; not touched this session. |
| **Branch** | `local/theme-preview`, cut from `develop` at `ab66a13`. **Nothing committed or pushed** (Matt hasn't asked). 17 modified + 5 new files: see `git status`. Don't push this branch as is: it contains the prototype theme code (`ThemePreviewSwitch.tsx`) that the build replaces. |
| **Local servers** | API :4002 and UI :5174 running in herdr tab **`theme-servers`** (`w1:t1A`; panes `w1:p1K` API, `w1:p1M` UI). Close it when done. |
| **Specs** | `specs/d43_ui_tweaks_spec.md` (DRAFT, items 1–14) and `specs/d44_scheduler_time_off_dialogs_spec.md` (DRAFT, scope only). Both untracked. CLAUDE.md's next-deliverable line updated (also uncommitted). |
| **Pages** | Comparison of schemes: https://claude.ai/artifact/PDcDf5SPGwDdYmGSRWXk1E · screenshots of the prototype: https://claude.ai/artifact/Drfanx5MKm3QGr32ffCcUG (private to Matt). |
| **Scripts** | Screenshot / check scripts and the original logo: `~/src/rockcut-d43-scratch/` (not in git). Run from `rockcut-ui/` with `node <script>`; they use the harness storageState files (`npx playwright test --project=setup` refreshes them). |

## D43 so far (all prototyped, details in the spec)

1. **Hop Field** light scheme replaces Brown & Amber.
2. **Hop Field Night** dark mode: nav lifted to `#2B3428` with an edge and
   shadow; nav icons, account icon and menu icons in hop green `#8DBF6A`.
3. **Board layers**: page / columns / cards in distinct colors
   (`background.boardColumn`, `boardToday`, `boardCard`), all themes.
4. **Logo**: black-only main logo (white made clear); a green version
   (`rockcut-logo-light.png`, `#8DBF6A`) in dark mode. Made in Chromium's
   canvas (`logo/convert.mjs`, `logo/green.mjs`).
5. **Nav**: Tasks moved above Schedule.
6. **Page title in the top bar** (`components/PageTitle.tsx`, portal);
   breadcrumbs → "‹ Parent" link on detail pages; board switcher in the bar.
7. **Account menu**: name/email, Profile, **Theme (Light / Dark / Match this
   device)**, Log out. A person on a shared tablet keeps a visible Sign out.
8. **Schedule buttons**: View Schedule has none (Calendar sync moved into the
   filter box); Scheduler drops Calendar sync.
9. **Week totals** under "Staff" in the Scheduler (Scheduled / Draft hours).
10. **Move mode** for the staff order (⋮ → Move; ↑↓ keys, Enter/Esc/Finished).
11. **Finished Daily card**: dimmed, struck through, starts closed.
12. **Notification preferences**: only In-app and Push (Email, SMS hidden).
13. **Position menu** in the shift dialog: styled department headings, indented
    positions with their shift-color squares.
14. **Board day header** sorted by start time (amends D38 §3.2).

Decided (spec §2): dark mode follows the person (one `users.color_mode`
column, the only API change in D43) with a per-tablet setting set by a
manager in Admin → Shared devices; choices Light / Dark / Match this device,
default Light; chosen in the account menu. "Sign in as me" on a tablet keeps
the tablet's setting.

Next: finish the D43 spec (persona scenarios, acceptance criteria), then
the build plan (`planning/`), then build on a fresh branch from `develop`.
Known build work: the `color_mode` column + `/api/me` + device setting; a
dark-mode sweep of every screen (dim toggle buttons still to fix); test
updates (Logout is now inside the account menu: `session_revocation`,
`personal_signin`, `personal_signin_revoke`, `offline_logout`; Add shift /
Add event live only on `/scheduler`); new specs for move mode, header order,
finished Daily card. Estimated size: D42/D40 range.

## Other decisions this session

- **D44** (time off from the Scheduler: approved → details dialog; pending →
  request, notes, Approve / Deny): split from D43 as new behavior. Its open
  questions are deferred (Matt: "skip questions on d44 for now").
- **Task 4054** (reload prompt) stays out of D43: it changes the service
  worker's update mode (`registerType: 'autoUpdate'` + `skipWaiting` today)
  and needs `vite preview` testing. Proposed as **D45**, before or after D43.
- **Email**: hidden in the UI only. When a real mail provider replaces
  `MailerNoop`, email defaults to on (`Notifications.@default_on`); that
  deliverable must show the column again or flip the default first.

## Open (carried over)

- Matt: create and pair the brewhouse tablet on prod.
- Task 3994 (`decimal`, plus fold in the `bandit` upgrade?) due 2026-10-30;
  4058 due 2026-11-04.
- `~/src/rockcut-d42-qa/`, `~/src/rockcut-d40-qa/` can be deleted.

## Gotchas (new)

- **MUI AppBar text is white** (`color="primary"`) even with a paper
  background: anything portaled into the bar needs `color: 'text.primary'`.
- **The Taproom board is `/tasks/bar`** (key stays `bar` since D32);
  `/tasks/taproom` silently redirects to your own board.
- **Scratch Playwright scripts outside the repo** can't import
  `@playwright/test` by name (ESM resolves from the script's folder): import
  `~/src/rockcut/rockcut-ui/node_modules/@playwright/test/index.mjs`.
- Piping a script's output through `head` kills it early (EPIPE) and can skip
  its screenshots; write to a log instead.
- The local DB's board/schedule data has Matt's hand edits from this session
  (Daily ticks, a moved Brewer shift); reseed before relying on it.
