# D48 DEV QA fix cycle 2: status, 2026-10-22

Branch `d48-batch-changes`, on top of `63d7ecb` (the merged DST hotfix). Committed as `fix: D48 DEV QA fix cycle 2 (…)`, **not pushed**.

**Inputs:**
- `prompts/d48_lead_decisions_3.md`;
- `stepwise_results/d48_qa_recheck_report.md` (N1 must-fix, N2–N6 minor, the part 2 click check).

## Fixed (with tests)

| Item | Change | Tests |
|---|---|---|
| **N1** | **API:**<ul><li>New `BatchChanges.no_tank_twice!/3`: after the change, vessel `j` and vessel `j − 1` may not share a tank. Unassigned never matches. It runs in the same transaction, against the vessels the change produced.</li><li>It runs after: Add transfer / filter (also through Add step, and on a split part), Remove transfer, a template change, each part of a split, and Undo split.</li><li>Into the current tank still gives `{:same_tank, name}`, "The beer is already in Q1RC.".</li><li>Any other pair gives `{:same_tank, name, day}`, "The beer goes into Q1RC next, on Fri Dec 18." (`error: "same_tank"`). The day is the transfer into the second vessel.</li><li>A split where no part stays, and part 1 (which keeps the later tanks) goes into the parent's next tank, is refused the same way. The other parts' later tanks start Unassigned, so they never match.</li></ul>**UI:**<ul><li>The Into picker leaves out the tank the beer is in **and** the tank of the vessel that comes next.</li><li>A tank picked before the day changed stays shown, and the preview gives the refusal (either wording) before saving, as for item 1.</li></ul>**The preview wording and the move:** the CIP & Sanitize at the old tank's exit is no longer listed or counted. That's true in the preview and in the API's `moved`, so the snackbar's count matches. See the note below on why the CIP still moves. | ExUnit `batch_changes_test` ("no two vessels in a row in one tank": next tank, current tank, through Add step, Unassigned, Remove transfer, template change), `splits_marks_test` (a split part, Unassigned later tanks, a part's own transfer), controller test (the message); Playwright `d48-fix-cycle-2` (picker, preview refusal, the save refusal, the preview list without the CIP, the snackbar count, the vessels and CIP after the save) |
| **N2** | A part stays `planned` until its Split is checked off, so the dialog now goes by the label. "#44.2" reads "#44.2 · the parent's number", and "P6.2" keeps the planned wording. | Playwright `d48-fix-cycle-2` |
| **N3** | **API:** `Batches.update` refuses a volume change on a part as well as on a parent (`split`, "Undo the split first."). **UI:** a part's Volume is read-only, with "Undo the split first to change it", and Save is disabled. | ExUnit `splits_marks_test`, controller test; Playwright `d48-fix-cycle-2` |
| **N4** | For a split part (which has no Brew day), Add step and Add a ramp before the parent's Split give the new code `before_split`, "A step can't come before the split.". Unsplit batches keep `before_brew_day`. | ExUnit `splits_marks_test`, controller test |
| **N5** | The split dialog clears its refusal when the day, the method, or any part changes (tank, volume, Add part, Remove). | Playwright `d48-fix-cycle-2` |
| **N6** | Add step and Add a ramp must fall on or before the exit of the tank they go in. That's the chosen tank, or the one the beer is in that day. The exit is a full Package, a Split, or the next transfer. The exit day itself is allowed. A ramp whose **last** step would be after the exit is refused whole (`after_exit`, "The beer isn't in that tank on that day."). | ExUnit `batch_changes_test` (exit day allowed, a day later refused, a ramp refused whole, a tank left by a transfer), controller test |
| **Check** (part 2 of a brewed split) | **Not reproduced.** Locally I set up a batch brewed today with its brew day checked off, split it the next day with part 1 staying and part 2 going into its own tank, then clicked part 2's bar. The dialog opened on the first click. It's now a Playwright test. If QA sees it again on DEV, a screenshot of where the click landed would help. | Playwright `d48-fix-cycle-2` |

`tests/COVERAGE.md` has rows for all of these.

### Note on N1's "Check the actual move too"

I checked the move itself and kept it as it was. Only the wording changed.

- When a transfer is added before an existing transfer, the existing transfer now leaves the **new** tank, not the old one.
- The CIP that belonged to that exit goes with it (vessel k → k + 1), so it cleans the tank the beer actually leaves on that day.
- Example: Q1RB → (added, Dec 17) Q1RD → (template, Dec 18) Q1RC. Q1RB gets the new CIP on Dec 17, and Q1RD gets the Dec 18 CIP.
- This was already the tested behavior ("a transfer before an existing one" in `batch_changes_test`). `remove_transfer!` relies on it too: it finds a transfer's CIP in vessel j − 1.
- If the CIP stayed in the old tank, Q1RB would get two CIPs and Q1RD none.
- In QA's case, the CIP landed on a full Q1RC only because the transfer went Q1RC → Q1RC. That's refused now.
- So the preview just doesn't list or count that CIP as a step that moves. The Playwright test checks the result: vessels a → d → b → c, and the transfer-day CIP in vessel 1 (d).

## Results

- **ExUnit (targeted):** 217 tests, 0 failures. This covers `production/*`, `production_test`, `seeds/synthetic_test`, the three production controller tests, `device_route_matrix_test` and `authz_boundary_test`. `mix compile --warnings-as-errors --force` and `mix format --check-formatted` are clean.
- **UI:** tsc and ESLint (`src/pages/production`, the new spec) are clean. Vitest: 169 passed.
- **Playwright, targeted** (`--project=production --workers=1`): d48-toolbar, d48-batch-changes, d48-split-select, d48-fix-cycle-1, d48-fix-cycle-2, batches, d47-qa-fixes, steps and gantt. **70 passed** (7.3 min; 69 tests plus the setup project).

## Questions (for the lead, or Matt in the morning)

1. **Setting a vessel's tank directly:** the batch dialog's "Ferment in / Transfer to" pickers, and dragging a bar to another tank's row (`PATCH /batches/:id/vessels/:k`). Right now these can still put two vessels in a row in one tank.
   - The decision's list (Add transfer, a part's transfer, Remove transfer, template change) didn't name them, so I left them alone. Add and Remove transfer, and Undo split, only check the vessels they touch, so a pair made with a picker doesn't block them elsewhere in the batch. A template change and a split check every vessel of the batch or part, so such a pair would refuse them.
   - Refusing these too would match "any change to a batch's vessels".
   - The cost: a brewer could no longer swap two vessels' tanks directly. A → B, B → A would be refused at the middle step, so they'd have to go through a third tank or Unassigned.
   - Should they be refused too, and should the pickers leave out the neighbouring tanks?
2. **Change ramp past the exit:** N6 covers Add step and Add a ramp. Change ramp… can still regenerate a ramp so that its last steps fall after the tank's exit, for example with a lower target or a smaller change per day. Should it be refused with `after_exit` too?

## LEAD:

- `LEAD: run cd rockcut_api && mix test` (the full ExUnit suite).
- `LEAD: run cd rockcut-ui && npx playwright test` (the full default suite, `--workers=2` at most).
- No migration, so no restart is needed. The dev API picked up the code changes on reload.
- Backlog: the task-board-ui dark "✓ name readable" flake as its own task (lead decision, not D48).
