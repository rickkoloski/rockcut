# D43 builder brief

**Branch:** `d43-ui-tweaks` (checked out in `~/src/rockcut`; already has the
docs commit `fdc0f54`).
**Read first:** `docs/current_work/specs/d43_ui_tweaks_spec.md` (APPROVED) and
`docs/current_work/planning/d43_ui_tweaks_plan.md`. The plan is the
instructions; this brief adds the working rules and splits the work.

## Working rules

- **The prototype** is on local branch `local/theme-preview` (`31e6fc0`).
  You can't `git checkout`, so read or copy its files with
  `git show local/theme-preview:<path>` (e.g.
  `git show local/theme-preview:rockcut-ui/src/components/PageTitle.tsx > rockcut-ui/src/components/PageTitle.tsx`;
  for the PNGs, redirect the same way: `git show` writes binary fine).
  `git diff develop local/theme-preview -- rockcut-ui` shows everything it
  changed. Don't port `rockcut-ui/src/ThemePreviewSwitch.tsx`; its theme
  values move into `src/theme.ts` (plan, UI step 1).
- **Servers** belong to the lead (API :4002, UI :5174, already running from
  this checkout). Don't start or stop them. When the dev DB needs the new
  migration, or the API needs a restart, stop and write `LEAD: migrate dev DB`
  (or `LEAD: restart API`); the lead does it and tells you. `mix test` uses
  its own DB: run it freely.
- **Commits:** one per task, on this branch, staging paths by name (never
  `git add -A` / `-a`; leave `.playwright-mcp/` alone). Message format
  `feat: D43 <what>` and end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Don't run repo-wide `mix format` in `rockcut_api` (it reformats the legacy
  tree); format only files you touched (`mix format path/to/file.ex`).
- Browser checks: Playwright with the harness storageState files
  (`tests/.playwright-auth/<persona>.json`, refreshed by
  `npx playwright test --project=setup`). Never read or print tokens.
- Stop at the end of each task with a short report: what changed, test
  results, anything you decided, and `LEAD:` lines for questions.

## Task 1 — API: `color_mode`

Plan § API, items 1–6, plus its ExUnit tests (plan § Tests, API). Include the
`device_route_matrix_test.exs` entry for `PUT /api/me/color_mode` (device
denied). `mix test` green (full suite). Then stop; the lead migrates the dev
DB before Task 2.

## Task 2 — UI: theme root and the port

Plan § UI items 1–7 and 9: `theme.ts`, `ThemeRoot`, `main.tsx`, the account
menu's Theme section on the API, Shared devices' Theme select, the PWA colors,
and the port of spec §1.3–§1.14 from the prototype. `pnpm exec tsc --noEmit
-p tsconfig.app.json` and `pnpm exec eslint` on touched files clean. Check
S143, S144, S146, S147 and S148 by hand in the browser (Playwright script,
screenshots in the scratchpad). Then stop.

## Task 3 — dark-mode sweep

Plan § UI item 8. Walk every page and dialog listed there as `owner` in Dark
(and Light, for the pages you change), fix what's unreadable, and save the
before/after screenshots under `~/src/rockcut-d43-scratch/sweep/` (outside the
repo). Report the list of fixes. Then stop.

## Task 4 — tests

Plan § Tests: update the existing specs for the moved controls, add the new
specs for S143–S169 (S150 stays manual), and run the full local Playwright
suite. Report the results, including any spec you couldn't make pass. Then
stop.
