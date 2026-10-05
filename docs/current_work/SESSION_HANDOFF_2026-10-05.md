# Session Handoff — 2026-10-05

Follows `SESSION_HANDOFF_2026-10-04b.md` (D36 through the local gate).

This session took **D36 from the local gate to prod.** It covered the DEV
gate, independent QA, a fix for one QA gap, the merge (PR #12), and release
`v2026.10.05` (PR #13). Matt's prod check passed and the close-out is done.
**Nothing is in progress.**

## Where things are

| | State |
|---|---|
| **Prod** | `v2026.10.05` (D36) since 2026-10-05 ~04:31 UTC: API v23 / UI v19. Rollback API v22 / UI v18 (image refs on PR #13). Pre-release snapshot `vs_L77p961Y6oaIgv8AVb7jm61`. |
| **DEV** | Free (conv 80 msg 85328). It runs `develop` `0207fcd` (API v25 / UI v21), reseeded. |
| **Repo** | `develop` = `main` content. `main` was merged back into `develop` (PR #14) before the release. No open branches or worktrees. |
| **QA folder** | `~/src/rockcut-d36-qa/` (brief, report, scripts). Its `auth/` holds DEV tokens that expire on their own. The report is copied to `stepwise_results/d36_dev_qa_report.md`. |

## Decisions this session (Matt)

- **K / task 4057 stays open.** It wasn't reproduced in 41 DEV runs, and neither theory (an SW `autoUpdate` reload, a LoadingScreen remount) is supported. The findings are in the task.
- **QA gap 1 was fixed in D36** (`d6fae38`): a Sunday overnight shift now sees Monday's time off. Gaps 2–4 were filed.
- **Keep personal "Sign in as me" on the tablets for now.** Matt asked how much simpler things would be without it. Answer: much simpler, since it causes most of the device complexity (the two-token set-aside, idle return, cross-tab sync) and both flaky tests this session. Staff would lose doing their own things at the bar tablet. A phone QR hand-off is a possible future alternative.

## Tasks

- **Closed:** 3941, 3942, 3997, 4001, 4002, 4003, 4050, 4051, 4052, 4053, 4059.
- **Filed (project 254):**
  - 4060: intermittent ExUnit pairing test;
  - 4061: tablet header at 384 px and below;
  - 4062: a channel page stuck on "Loading…" when the list fails (predates D36);
  - 4063: malformed lists crash some pages to Reload;
  - 4064: S13 fails locally in parallel (predates D36).
- **Still open:** 4057 (K); 4054 (reload prompt, next feature); 4055/4056 (D32 event features); 3856 (telemetry); **3994 (`decimal` advisory, due 2026-10-30)**; **4058 (pre-D34 token cleanup, due 2026-11-04)**. In Backlog: RBAC 3847 and 3849–3853, 3843, 3855.
- **Humans:** pair the prod taproom tablets, and tell staff to copy their Calendar sync links again (from D35).

## Next

D37 isn't chosen yet. Matt's queue starts with 4054 ("new version available, tap to reload").

## Gotchas (new this session)

- **Release PRs are squash-merged,** so before the next `develop → main` PR, merge `main` back into `develop` or the PR shows conflicts. Use `-s ours` **only after** checking that `main`'s tree equals some `develop` commit (`git rev-parse <c>^{tree}`). See PR #6 and PR #14.
- **`gh pr edit` fails on this repo** (a GraphQL "Projects (classic) is being deprecated" error). Use `gh api -X PATCH repos/rickkoloski/rockcut/pulls/<n> -F body=@file`, and `gh api -X PUT …/pulls/<n>/merge` to merge.
- **Playwright `error-context.md` can include an `Authorization: Bearer …` header** from an API call log. Don't paste those files around unredacted.
- **`fly logs --no-tail` keeps only the last 100 lines.** For a run you may need to debug, capture `fly logs -a <app>` to a file in the background first.
- **No `unzip` on this machine.** Read Playwright traces with Python's `zipfile`.
- **Don't `pkill -f <pattern>` from a shell whose command line contains the same pattern;** it kills itself (exit 144). Use the PIDs from `pgrep -fa`.
- **Earlier gotchas still apply:** `fly deploy` needs `--depot=false`; the Users & Roles grid shows at most 100 rows; and the rest in handoffs 2026-10-04 and 2026-10-04b.
