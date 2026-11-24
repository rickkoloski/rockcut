# Session handoff — 2026-11-23

## Where things stand

- **Prod: `v2026.11.23` (D64, yeast, brinks, harvests and cell counts).** Matt's check passed on desktop and
  phone.
  - D64 PR #94 merged to `develop` as `b302cf4`. Release PR #95 squashed as `554b802`, tagged `v2026.11.23`.
  - API v45 `registry.fly.io/rockcut-api:deployment-01M862CR4G2W8GP971MGZD029P`, UI v41
    `registry.fly.io/rockcut-ui:deployment-01M862FJSB7KEXTVXXH3NCSWQ9`.
  - **Rollback:** restore snapshot `vs_4bq8yLP0wkx9UKGoVGBKoX4` (2026-11-24 06:00:13 UTC, before the API deploy),
    then API v44 / UI v40. Anything entered since would be lost.
  - **Data:** 111 products, 112 offers, 28 lots, 28 movements, 11 batches. The D64 seed's second run added
    nothing. WLP001, Wyeast 1056 and WLP002 (unused) were removed, and US-05 became Chico Ale.
- **DEV is free** (conv 80 msg 109950). It runs `0a56b70`, which has `develop`'s app code.

## The D64 gate, in short

Record: `stepwise_results/d64_yeast_harvests_COMPLETE.md`, with the QA reports beside it.

| Pass | Result |
|---|---|
| Local QA | four passes, 26 gaps, ended at pass with gaps |
| Local Playwright | 1,014 passed, 1 skipped (`c88cebc`) |
| DEV Playwright (`0a56b70`) | every test passed, not in one clean run: d58 S16 and managers 12/13 failed under load, then passed rested |
| DEV QA | pass with gaps: 1 should-fix, 3 minor |

- **Not tested:** harvests beside Transfer, CIP and Package on a real tank; un-check and Undo after every answer
  on the board and device. Gap 25's sentences were only partly covered by DEV QA.
- **Lead calls Matt has seen and let stand:** Adjust and Dump can't be dated before the harvest; a count dated
  before the latest harvest doesn't tick the Count task; removing an entry or lot pitch deletes its line.

## Next

1. **Ask Matt about a security hotfix.** `mix hex.audit` lists five advisories, on libraries D64 didn't change:
   phoenix 1.8.15 (two HIGH: EEF-CVE-2026-128361 Presence, EEF-CVE-2026-129344 channel serializer), and
   phoenix_live_view 1.2.12, plug 1.20.3 and idna 7.1.0 (MEDIUM). A quick search found no Presence or channel
   modules in the app; that isn't a full review. `pnpm audit --prod` is clean.
2. **D63: scope in chat first**, and write the spec only when Matt says scoping is done.
   - Recipes on products, brew-day drawdown, °Plato (4987), batch-log time (4986), the rest of 4989/5203, lint 4084.
   - **Stop 0 carry-ins:** 6260 (phone Back on ConfirmDialog), 6261 (empty Voided rows), 6262 (order footer units).
   - **Matt's rule:** a brew is always saved. An unmatched yeast pitch is marked "Yeast source needed". D64's
     date refusal lives in the Pitch and count actions so brew day isn't bound by it.
   - Seen during D64, not filed: Edit Batch requires a batch number, so a planned batch or split part can't be
     saved there without one (predates D64).
   - Memory note: `rockcut-d64-yeast-scoping`.
3. **5911 (flaky tests), not yet updated with D64's:** S16 and managers 12/13 (DEV, after a full run); S183 matched
   a label containing "to" (fixed, `258ea0f`); d48-fix-cycle-1 phone scroll fails with leftover QA batches, passes
   after a reseed (cause not proven).

## Notes

- **Playwright order:** production → brewery-board → ingredients → d58 (D64's specs brew batches). It hasn't had a
  full run in this exact order. Reseed before a run.
- **`rpc` SQL:** double quotes and `%` patterns fail in the one-line form; filter by id or in Elixir.
- **Snapshots:** list with `--json` and sort by `created_at`; confirm the new one before deploying.
- **Builder (w1:p4):** idle, with nothing pending. `/clear` it before D63; that keeps its limits but drops its
  name (`herdr agent rename w1:p4 builder`). It tried `git checkout` and once a `git stash list` during D64; its
  limits blocked both.
- **QA folders:** briefs and reports are archived in `~/src/rockcut-qa-briefs/rockcut-d64-qa` and `-devqa`.
- **Lead panes:** the API server runs in w1:p2, the UI dev server on :5174.
