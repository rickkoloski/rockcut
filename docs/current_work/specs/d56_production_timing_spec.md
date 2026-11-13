# D56: Pre-brew steps, test results and retests, and follow-ups — Spec

**Status:** DRAFT for Matt's review (2026-11-12)
**Backlog:** PortableMind project 254, tasks 5207, 5208 (was D57), 5210, 5211, 4950, 5791
**Branch:** `d56-production-timing` from `develop` (already holds the 5791 fix, `d627538`)
**Builds on:** D46 spec (`specs/d46_production_scheduling_spec.md`), D47–D50, D58 §3.1

**Scope change (Matt, 2026-11-12):** D57 (test results and retests) is folded into D56. D57 is
retired as "merged into D56" and isn't reused. Multi-day steps are dropped (backlog task 5792,
with the question of part-day work), so "Brew over two days" stays as it is.

## 1. Why

- **Pre-brew work has no place on the schedule.** A template step can't be before brew day
  (`template_steps.day_offset` is 0–365), so "Prepare grain" the day before brewing lives outside
  the app.
- **A failed test can't change the plan.** A Diacetyl test is either done or not. When it fails,
  the brewer has to move the Crash by hand and remember to test again.
- **Smaller items tagged D56:** the Gantt's "Label by" picker (specified in D46, never built),
  board settings that don't refresh when the app returns to the screen, the template editor's
  non-atomic Save (5210), a step taken off the task list that drops off the Gantt (5211), the Undo
  snackbar over dialogs (4950), and the Boards due-date typing bug (5791, already fixed).

## 2. Decisions (Matt, 2026-11-12)

**Pre-brew steps**
1. **Pre-brew steps show on the batch's first tank row as dots before the bar.** The bar still
   starts on brew day, so a pre-brew step doesn't put the beer in the tank: no tank time, no
   overlap flag. With no first tank, they show on the Unassigned row.
2. **Pre-brew steps always move with brew day,** keeping their distance, with no question.
   Finished ones stay put. A pre-brew step can be moved on its own, but never to brew day or later.

**Test results**
3. **Step types marked "Has a result" record Pass / Fail at check-off.** A switch on each type in
   Phases & steps. Diacetyl test and Gravity check start switched on.
4. **A Fail asks what to do next: "Retest in [2] days" or "Continue as planned".**
   - **Retest:** the failed test is done that day with result Fail. A retest step is added N days
     later. The steps that waited on the test (e.g. Crash) now wait on the retest and move with it
     through the usual move prompt.
   - **Continue as planned:** the test is done with result Fail, and nothing else changes.
5. **N comes from the template step,** "Retest after [2] days", and can be changed in the prompt.
   There's no cap on retests. After the third Fail in a row on one test, the batch gets a flag
   that can be signed off.

**Scope**
6. **Multi-day steps are out** (backlog 5792). **D57 is folded in.**

## 3. Requirements

### 3.1 Pre-brew steps (decisions 1, 2)

- **`template_steps.day_offset`** accepts −30…365. A negative offset is a **pre-brew step**. The
  template's first Brew day stays at 0, and offsets still count from the first brew day.
- **Allowed types:** plain step types and custom steps, with no phase. Brew day, Transfer/Filter,
  Split, Package, Set temp, CIP and phase markers can't have a negative day (422 `not_before_brew`:
  "A <type> can't be before brew day."). See Q1 about CIP.
- **Vessel:** always the first vessel (0). The template editor hides the tank picker for them.
- **Template editor:** the day picker offers "Day −1 (before brew day)" and so on. The template
  preview shows them left of brew day.
- **Plan batch / Change template:** copied like other steps, `due_on` = brew day + offset.
- **Moves:**
  - Any change to the first Brew day's date (drag, date box, check-off on another day, whole-batch
    drag, Undo) moves every unfinished pre-brew step by the same amount. This happens before and
    apart from the move prompt, which still covers only the steps after brew day.
  - Moving a pre-brew step itself: its own links' prompt as today. Its new day must be before the
    first brew day (422 `before_brew_day`: "A pre-brew step stays before brew day."). The drag's
    live hint says so.
  - Undo restores both.
- **Check-off:** allowed while the batch is planned or pencilled. It doesn't ask for the batch
  number, and checking it off doesn't fill the tank. The "nothing empties a tank before brew day"
  rule is unaffected (pre-brew steps never empty anything).
- **Shown as:**
  - The batch and step dialogs: "day −1".
  - The Brewery board task: worded like other steps ("FV3 · Galactic P2 · Prepare grain"; the
    tank is the first vessel's, or "Unassigned"), with the Planned batch pill and per-person hiding
    as today.
  - The expanded tank rows include it, left of the batch's brew day.
  - The tank status line ignores it.

### 3.2 Test results and retests (decisions 3–5; was D57)

**Data**
- **`production_step_types.has_result`** (boolean, default false). Brewers switch it in Phases &
  steps, built-in or not. A migration sets it on for the seeded Diacetyl test and Gravity check.
- **`template_steps.retest_days`** and **`production_steps.retest_days`** (integer 1–30, default
  2; only used when the type has a result). Copied into batches like other step fields.
- **`production_steps.result`** (`pass` / `fail` / null) and **`retest_of_id`** (the step this one
  retests, null otherwise).
- Additive migrations; an older image ignores the columns.

**Check-off of a step whose type has a result**
- Everywhere a step is checked off (Gantt, step dialog, batch dialog, the Brewery board, the
  brewhouse device), checking off first asks **Pass** or **Fail**. Cancel leaves it open. The API
  refuses the check-off without a result (422 `result_required`).
- **Pass:** done as today. The off-plan move prompt follows if it was done on another day.
- **Fail:** a second question: **"Retest in [2] days"** (the step's `retest_days`, editable) or
  **"Continue as planned"**.
  - **Retest:**
    - The test is done that day with result Fail.
    - A new step of the same type is added on done day + N: same vessel, phase, notes,
      assignee, task-list setting and `retest_days`; detail "retest" ("Diacetyl test - retest";
      "retest 2" for the next, and so on); `added: true`; `retest_of_id` = the failed step.
    - The failed step's **outgoing** links move to the retest (same default answers), so the
      steps after the test now follow the retest.
    - Then the move prompt runs for those steps against the retest's day (move all = the steps
      after it shift so they're no earlier than before relative to it; move only = they stay and
      are flagged out of order as today).
    - Its task appears on the Brewery board like any added step.
  - **Continue as planned:** the test is done with result Fail; nothing else changes.
- **Changing a recorded result:** the step dialog of a done test shows the result with **Change**.
  Changing Pass → Fail asks the Fail question; Fail → Pass removes nothing on its own (see Q2 for
  Undo and Mark not done).

**Repeated fails**
- When a test fails for the third time in a row (the original and two retests, all Fail), the
  batch gets a flag **"3 failed Diacetyl tests"**. It follows the D47 flag rules: shown in the
  flag list and badges, can be signed off, and comes back if another Fail is added.
- No cap on retests.

**Shown as**
- Gantt dot of a failed test: a filled dot with a small ✗ (Pass: ✓). The expanded rows say
  "· failed" / "· passed".
- Step and batch dialogs: "Done Mon · Fail" / "Pass". A retest's dialog says "Retest of
  Diacetyl test (failed Mon)".
- Brewery board: the done task shows "✗ Fail" / "✓ Pass". History: "Diacetyl test checked off ·
  Fail · retest Wed" / "· continue as planned".
- Template editor: "Retest after [2] days" on steps whose type has a result.

**Undo** (proposed, see Q2)
- Undo of a Fail check-off (the snackbar, within its 2 minutes) removes the retest it added,
  moves the links back to the test, and puts moved steps back, if the retest isn't done.
- **Mark not done** on a failed test does the same, with a confirm. A done retest blocks it:
  "Mark the retest not done first."

### 3.3 The expanded tank's "Label by" picker (5207)

As D46 §3.6 and the mockup (`docs/current_work/reference/tank_schedule_mockup.html`, "Label these
rows by batch", `lblsel` / `ui.labelBy`) describe:
- When two or more batches share a tank in the visible range, the expanded tank's first step row
  gets a picker. It chooses which batch's steps are labelled by name alone; the others keep
  "step · batch".
- Remembered per person, like the expanded state (D58 board settings). Front end only.
- Its Playwright test replaces the `tests/COVERAGE.md` limitation line.

### 3.4 Board settings refresh when the app returns (5207)

- When the page becomes visible again (`visibilitychange`), re-read `/api/me` at most once a
  minute. Apply the new `board_settings`, `color_mode` and `show_planned_batches` without a reload.
- A board-settings PUT in flight isn't aborted or overwritten.
- A failed refresh is silent: no "Can't reach the server" over a working app (keep `loadMe`'s
  existing handling).
- Shared tablets too. Front end only.

### 3.5 Template step Save is all-or-nothing (5210)

- One API call saves a template step and its picked "comes after" / "leads to" links in one
  transaction. If any link is refused, nothing is saved and the error names the link.
- The editor uses it; a reload mid-Save leaves the old step and links as they were.

### 3.6 A step taken off the task list stays reachable (5211)

- "Take off the task list" keeps the step on the Gantt, as the prompt promises. In the expanded
  tank it's a diamond like every other step. The batch dialog's step name opens its step dialog.
- Its step dialog's "Show on the Brewery task list" puts it back (a new task, as for any step
  turned on).
- The collapsed row's dots stay as D46 defines them (task-list steps and CIPs).
- First reproduce on local (`#907 · Set temp - 58°` path in the task) to find which of those is
  missing.

### 3.7 Undo snackbar over dialogs (4950) — proposed, see Q3

- **A:** Ctrl/Cmd+Z runs the live Undo while one is live and focus isn't in a text field. It
  works with a dialog open. The snackbar's text mentions it on a device with a keyboard.
- **B:** while a dialog is open, the snackbar stays up until its Undo expires (2 minutes) or is
  used. With no dialog it hides as today.
- **C:** with a dialog open, the snackbar sits at the bottom of the screen, clear of the dialog's
  title.

### 3.8 Boards due date typed by hand (5791) — done

Fixed on the branch (`d627538`): the card's due date saves on leaving the field or Enter.
Included in the DEV runs and QA.

## 4. Not in D56

- Multi-day steps and part-day (hours) planning: backlog 5792.
- CIPs before brew day on a batch (Q1), unless Matt says otherwise.
- Numeric test readings (a gravity number, a VDK reading) beside Pass / Fail.
- °Plato (4987), events in calendar feeds (4055), company-wide events (4056), 5789, 4084.

## 5. Open questions for Matt

- **Q1 — CIP before brew day.** Should a batch be able to have a "CIP & Sanitize" on its first
  tank before brew day, clearing the "filling a dirty tank" flag? Proposed: no; the standalone CIP
  already does that.
- **Q2 — a Fail recorded by mistake.** Proposed in §3.2 "Undo": Undo or Mark not done removes the
  retest it added (if the retest isn't done) and puts the following steps back. Alternative: only
  the result is cleared, and someone removes the retest by hand.
- **Q3 — 4950.** Are §3.7's A/B/C the right fix, or a smaller one (just Ctrl/Cmd+Z)?
- **Q4 — limits.** Pre-brew up to 30 days before brew day; a retest up to 30 days out. OK?

## 6. Persona scenarios

| # | Persona | Entry | Scenario | Expect |
|---|---|---|---|---|
| S1 | `breweryMgr` | Set up → Templates | Adds "Prepare grain" at day −1; tries a Transfer at −1 | Saved, preview left of brew day; Transfer refused with the message |
| S2 | `brewer1` | Gantt → Plan batch | Plans from that template on FV3 | A dot left of the bar on FV3; no overlap flag with the batch ending there the day before |
| S3 | `brewer1` | Gantt | Drags the bar 2 days later; then Undo | The pre-brew dot moves with it; Undo puts both back; persists after reload |
| S4 | `brewer1` | Batch dialog | Moves brew day by the date box, answers "Move only" | Pre-brew step still moves; steps after brew day stay |
| S5 | `brewer1` | Gantt | Drags the pre-brew dot onto brew day | Refused, the hint says why |
| S6 | `brewer1` | Tasks → Brewery | Ticks the pre-brew task of a planned batch | Done; no batch number prompt; the batch stays planned (P-number) |
| S7 | `breweryMgr` | Set up → Phases & steps | Turns "Has a result" on for Rouse; checks Diacetyl test is on | Saved after reload; the template editor shows "Retest after" on both |
| S8 | `brewer1` | Gantt → D-test dot → step dialog | Check off → Fail → "Retest in 2 days" → Move all | Test done with ✗; retest 2 days later; Crash now follows the retest and moved 2 days; kept after reload |
| S9 | `brewer1` | Tasks → Brewery | Ticks a D-test task → Fail → "Continue as planned" | Done with ✗ Fail; no retest; Crash unchanged |
| S10 | `brewer1` | Step dialog | Fail → Retest, then Undo from the snackbar | Retest gone, links back on the test, Crash back (Q2) |
| S11 | `brewer1` | Gantt | Fails the test, then retest, then retest 2 | "3 failed Diacetyl tests" flag; sign off; a 4th Fail brings it back |
| S12 | `breweryDevice` | Production / board, staff code | Checks off a D-test as Fail → Retest | Works; "· on Brewery Test 1" in History |
| S13 | `brewer1` | API | Check off a has-result step with no result | 422 `result_required` |
| S14 | `brewer2` | API | Pre-brew at −31; retest days 0 | 422 with the messages |
| S15 | `office1` | API | Record a result | 403, as for other schedule writes |
| S16 | `brewer1` | Gantt, two batches in FV3 in range | Expands FV3, picks a batch in "Label by" | Its steps by name only; kept after reload and on another browser |
| S17 | `brewer1` | two browser contexts | Changes Show planned batches in A; B returns to the screen | B shows it with no reload; no error if `/api/me` fails |
| S18 | `breweryMgr` | Template editor | Picks two links; the server refuses the second | Nothing saved, error names the link; a retry saves both |
| S19 | `brewer1` | Tasks → Brewery | Takes a linked task off the list | Step still on the Gantt (expanded) and in the batch dialog; its dialog puts it back |
| S20 | `brewer1` | Batch dialog → Pencil in | Ctrl/Cmd+Z with the dialog open | Undo runs; the snackbar doesn't cover the title |
| S21 | `bartender1` | Boards → a card | Types a due date key by key | Saved once on leaving the field (5791) |

## 7. Rollout

- **Migrations:** all additive: `production_step_types.has_result` (on for Diacetyl test and
  Gravity check), `retest_days` on both step tables, `production_steps.result` and
  `retest_of_id`. The day-offset range change is validation only. Rollback is image only.
- **No new secrets.**
- **Existing done tests** on prod have no result (null): shown as done with no ✓/✗.
- **The `has_result` migration finds the two types by their seeded names.** If either was renamed
  on prod, it stays off, and Matt switches it on in Phases & steps.
