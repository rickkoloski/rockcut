# Session Handoff: 2026-10-26 (b)

Supersedes `SESSION_HANDOFF_2026-10-26.md`. **D48 is complete and merged to `develop`.** DEV is free. Next is **D49 planning**.

## Where things are

| | State |
|---|---|
| **Prod** | Unchanged: `v2026.10.22`, the DST hotfix (UI v24 / API v27). D46–D49 go to prod in one release after D49. |
| **DEV** | **Free** (discussion 80, msg 99135). Runs `develop` at `bae9548` (API v59 / UI v62), reset and reseeded Oct 26. |
| **develop** | `bae9548`, "Merge D48: changing a batch …" (PR #34, merged `--no-ff`). This handoff is a local commit on top, not pushed. |
| **Local** | `~/src/rockcut` is on `develop`. Servers stopped. No builder or QA agents running. `~/src/rockcut-d48-deploy` removed. |
| **PortableMind** | Task 4631 (D48) set to In Review (as D47's 4630). New flake task **4933** (device_signout G4). |

## D48 this session

- **Recheck 5** (`bb38b29`): Y1–Y3 fixed; **Z1** must-fix (a part could get ahead of its parent's Split), Z2/Z3 minor.
- **Fix cycle 6** (`889c151`, decisions 7): a part's exit waits for the Split (`before_split`); the Split can't be un-checked while a part's exit is done (`part_exit_done`); parts are planned while the Split isn't done; late-Split snackbar names the parts; step PATCH refuses dates (`date_not_here`).
- **Recheck 6:** Z1–Z3 fixed; **AA1** must-fix (Undo got around the Z1 guard), AA2 minor.
- **Fix cycle 7** (`5c0e9ec`, decisions 8): Undo runs the same order guards as a direct check-off / un-check (`Steps.order_after_undo!`, in `Undo.restore`); brew day's `exit_done` names the part.
- **Recheck 7:** **no must-fix → D48 closed** (Matt's close-out rule). Minors BB1, BB2 go to D49.
- **Gates:** local ExUnit 1723/0; local Playwright 532 passed / 1 skipped / 1 flake (G4, task 4933); **DEV run 9: 535/0, run 10: 536/0**.
- **Close-out done:** reports copied to `stepwise_results/` (recheck 5–7), verdict on PR #34, merge, DEV redeploy + reseed, "DEV: free", `stepwise_results/d48_batch_changes_COMPLETE.md`, CLAUDE.md (D48 row; next D49; prod line corrected to `v2026.10.22`).

## Next steps: D49

1. **Start:** read `docs/process/three_environment_workflow.md`, the spec's D49 sections and `stepwise_results/d48_batch_changes_COMPLETE.md` (LIMITATIONS).
2. **Scope** (spec `specs/d46_production_scheduling_spec.md`):
   - **§3.12a Clean not sanitized** (P122–P129): the tank ⋯ dialog's Mark… as a vertical list (mockup B, https://claude.ai/artifact/V8DLwX5dfcYZ19h6iZ198V); "Clean no sani N days" (amber) with a soft flag on the next fill; CIP variants CIP & Sanitize / CIP - no sani / Sanitize; nothing expires on its own.
   - **§3.12b Pencilled batches** (P130–P135): X1, X2… numbers drawn faded; no board tasks until Schedule this batch; muted flags; brew day needs scheduling first.
   - **D48 minors:** BB1 (a refused snackbar Undo loses its button; the API accepts the retry) and BB2 (some Undo routes still `undo_stale` and never recover: Split's Undo after a part's full Package, brew day's in a split family, a Split un-check's after brew day, a late Split check-off's; after the last, the parts keep their carried dates).
   - **Decide during planning whether D49 needs splitting.**
3. **Branch** `d49-…` from `develop` (push this handoff first, or carry it on the branch). Claim DEV in discussion 80 when the DEV gate starts.
4. **After a reboot:** the same checks as before (lead permission mode, builder `--disallowedTools`, `free -m` ≥ 1.5 GB).

## Other open items

- **D44** item 0: split `Schedule.tsx` into `ViewSchedule.tsx` / `Scheduler.tsx` (Matt).
- **Task 4707:** View Schedule loses its today + 6 range after the Scheduler.
- **Flakes:** 4706 (task-board dark "✓ name"), 4933 (device_signout G4: failed 2 of 4 file runs locally; passed in DEV runs 9 and 10).
- **Due soon:** 3994 (`decimal` / `bandit` advisories) 2026-10-30; 4058 (remove the pre-D34 token path) 2026-11-04.
- **REMIND:** 4055 / 4056 (events in calendar feeds, company-wide events) when planning the next deliverable.

## Gotchas (new this session)

- **fly login expires.** After a reboot the session had expired; `fly auth login` completes on its own once approved in the browser (no `--code` needed).
- **`fly ssh console` can time out** probing the org ("tunnel unavailable"). Just retry.
- **The builder can stop on a permission prompt** even in bypass mode ("Dangerous rm operation not ruled out", set off by `\${` in a grep). The watch loop reports `blocked`; read the pane and approve if it's read-only.
- **QA agents can stop on "API Error: Connection lost mid-response".** The watch loop now also greps the pane for "API Error". Resume with a short prompt: check what the last command wrote, keep the ledger, carry on.
- **After a full DEV run** (board-replace project), run `reset_synthetic()` then `seed_synthetic()` before QA.
- **The DEV UI machine auto-stops** (`min_machines_running = 0`) and shows "stopped" in `fly status`; a request wakes it.
