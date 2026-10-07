# Session Handoff — 2026-10-07b

Follows `SESSION_HANDOFF_2026-10-07.md` (D37 DEV pass 1 fixed, not pushed).

This session took **D37 from DEV pass 1 to prod.** It covered the reboot recovery,
DEV pass 2, the merge (PR #15), the `main → develop` sync (PR #16) and release
`v2026.10.07` (PR #17). Matt's prod check passed and the close-out is done.
**Nothing is in progress.**

## Where things are

| | State |
|---|---|
| **Prod** | `v2026.10.07` (D37) since 2026-10-07 ~19:52 UTC: API v25 / UI v20. Rollback API v23 / UI v19 (image refs on PR #17). Pre-release snapshot `vs_m44GA2n32e5t9g66q9K13Xw`. New secret `STAFF_CODE_KEY` (Matt holds it). |
| **DEV** | Free (conv 80 msg 87172). It runs `develop` `0ed1afa` (API v28 / UI v25), reseeded. |
| **Repo** | `develop` has `main` (PR #16) plus this close-out. `main` is the `v2026.10.07` squash (`853983b`), so the next release PR needs another `main → develop` sync first (same check, `-s ours`). The `d37-buy-a-beer-board` branch is merged and can be deleted. |
| **QA folders** | `~/src/rockcut-d37-qa/` and `~/src/rockcut-d37-qa2/`. Their `auth/` tokens expire on their own. Reports copied to `stepwise_results/`. |
| **Herdr** | Lead `w1:p1`, servers `w1:p2`/`w1:p3`, ops tab, build tab (a fresh `builder` with its limits, idle). |

## Decisions this session (Matt)

- **Ship D37 with QA pass 2's six minor gaps** → task 4118.
- **Long runs and agents get their own herdr tab** (not a split of the lead view), with live output (no `| tail`).
- Prod `STAFF_CODE_KEY` is Matt's: generated and set in the ops tab, stored in his password manager.

## Tasks

- **Closed:** 4083.
- **Filed (project 254):** 4115 (History export follows search), 4116 (History search matches "who"), **4117 (medium:** API accepts writes before a required password reset), 4118 (D37 follow-ups), 4119 (`source-map-js` advisory, build-time).
- **Still open:** 4054 (reload prompt, next in Matt's queue), 4055/4056, 4057, 4060–4064, 4084 (lint), 3856; **3994 (`decimal`, due 2026-10-30)**; **4058 (due 2026-11-04)**.
- **Humans:** set staff codes for Taproom staff before the tablets use the board; pair the prod tablets if not done.

## Next

D38 isn't chosen yet. Matt's queue starts with 4054.

## Gotchas (new this session)

- **Herdr resumes Claude panes without their flags** after a reboot: the builder lost `--disallowedTools`, and the lead lost `--dangerously-skip-permissions`. In default mode the auto-mode classifier blocked `gh` PR merges ("Merge Without Review") and a prod rollback ("Production Deploy"); Matt ran those himself. Now in `~/.config/herdr/rockcut-workflow.md` §1.
- **Check a new secret before deploying it.** A malformed staged `STAFF_CODE_KEY` took the prod API down ~8 minutes (v24 failed to boot, before migrations). `echo "$KEY" | base64 -d | wc -c` must print 32. Have the human paste carefully, or generate into a variable and set from it.
- **`fly deploy` can report failure after the image is live** (a 401 from Fly mid-smoke-check): check `fly status` / the machine's version before redeploying.
- **`gh pr edit` still fails here;** `gh api -X PATCH repos/rickkoloski/rockcut/pulls/<n> -F body=@file` works.
- **Memory:** the Chromebook container shows ~1–2.5 GB available; run full local Playwright with `--workers=2`.
