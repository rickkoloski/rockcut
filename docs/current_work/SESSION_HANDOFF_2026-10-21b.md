# Session Handoff — 2026-10-21 (b)

Supersedes `SESSION_HANDOFF_2026-10-21.md`. This session took **D47** (the batch schedule and Gantt) through the whole workflow to `develop` and DEV, and acted on Rick's review and his Bryntum references.

## Where things are

| | State |
|---|---|
| **Prod** | Unchanged: `v2026.10.16` (UI v23 / API v27). D46–D49 go to prod together after D49. |
| **DEV** | Free (released in discussion 80). Running `develop` `5e0a4ed` (API v50, UI v53), reseeded. |
| **develop** | `5a778b3` (D47 completion record) plus this handoff. PRs #32 (D46) and #33 (D47) are merged. |
| **Local** | Checkout on `develop`. The untracked `.playwright-mcp/` was already there. |

## Done this session

- **D47 merged:** `stepwise_results/d47_batch_schedule_gantt_COMPLETE.md`. It took three fix cycles; Matt approved the third.
- **New decisions from Matt** (in the spec and the local notes):
  - Split - Transfer / Split - Filter, chosen once per split (P109, P110);
  - Package - Partial (P111, P112);
  - Shift-drag = Move only in D48 (P113);
  - live drag feedback (shipped in D47).
- **Rick's review** (discussion 80, file #4748), all taken:
  - the secret format check and the hotfix-before-close-out rule in `three_environment_workflow.md` §5;
  - task 4669 (build SHA on `/api/health`);
  - the 10-01 handoff's `POOL_SIZE` note marked outdated.
- **Rick's Bryntum links:** our tank view is Scheduler Pro-like, and we keep our own component. The ideas are in task 4670 (after D49).
- **PortableMind:** 4629 (D46) and 4630 (D47) are In Review; 4650 is Completed.

## Next: D48 (changing a batch)

1. Branch `d48-batch-changes` from `develop`. The plan comes from spec §3.11, P65–P89, P110 and P113.
   - D47 left out: add/remove step, ramps on batches, add/remove transfer/filter, split and undo split (Transfer/Filter method), change template and brand, multi-select, Shift-drag.
2. The builder brief keeps: full runs only through `LEAD: run`, in a visible herdr tab.
3. QA runs alongside the DEV suite with its own `[TEST-TEMP]` data. Tests that read the shared tank order must assert relatively.

## Gotchas from this session

- **Watching agents:** old `herdr agent wait` watchers fired late and out of order. Use a loop on `state_change_seq` (wait for idle **and** a seq greater than the one at prompt time) instead.
- **"continue" typed in the builder pane** made it skip the lead's steps. Lead decisions 3 now tells it to wait for the lead's reply.
- **Reading DEV state without a token:** `fly ssh console -a rockcut-api-dev -C "/app/bin/rockcut_api rpc '…'"` runs inside the live node (read only). `eval` starts a separate node.
- **Usage limits** paused the lead and QA twice. Both resumed on their own; background runs carried on.
