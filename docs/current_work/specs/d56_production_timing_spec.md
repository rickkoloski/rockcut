# D56: Production timing (pre-brew days, multi-day steps) and follow-ups — Spec

**Status:** DRAFT for Matt's review (2026-11-12)
**Backlog:** PortableMind project 254, tasks 5207 (main), 5210, 5211, 4950, 5791
**Branch:** `d56-production-timing` from `develop` (already holds the 5791 fix, `d627538`)
**Builds on:** D46 spec (`specs/d46_production_scheduling_spec.md`), D47–D50, D58 §3.1

## 1. Why

- **Pre-brew work has no place on the schedule.** A template step can't be before brew day
  (`template_steps.day_offset` is 0–365), so "Prepare grain" the day before brewing lives outside
  the app.
- **Every step is one day.** A dry hop that sits three days, a two-day packaging run or a slow
  transfer shows as a single dot, and the steps after it can't follow its real end. "Brew over two
  days" is a special case built from two steps ("1 of 2", "2 of 2").
- **Smaller items tagged D56:** the Gantt's "Label by" picker (specified in D46, never built),
  board settings that don't refresh when the app returns to the screen, the template editor's
  non-atomic Save (5210), a step taken off the task list that drops off the Gantt (5211), the Undo
  snackbar over dialogs (4950), and the Boards due-date typing bug (5791, already fixed).

## 2. Decisions (Matt, 2026-11-12)

1. **Pre-brew steps show on the batch's first tank row as dots before the bar.** The bar still
   starts on brew day, so a pre-brew step doesn't put the beer in the tank: no tank time, no
   overlap flag. With no first tank, they show on the Unassigned row.
2. **Pre-brew steps always move with brew day,** keeping their distance, with no question. Finished
   ones stay put. A pre-brew step can be moved on its own, but never to brew day or later.
3. **Any step can last several days, Brew day included.**
4. **A multi-day step is one task, done once.** It's one Brewery board task that shows on every day
   of its span ("Day 2 of 3"). Checking it off marks the whole step done. The steps after it wait
   for its last day.
5. **A multi-day Transfer, Filter or Split holds both tanks for the whole span.** The new tank is
   taken from the first day and the old tank until the last day. Overlap and dirty-tank flags see
   both. The old tank's CIP follows the last day.
6. **"Brew over two days" becomes one Brew day step lasting 2 days.** A migration merges each
   existing "1 of 2" / "2 of 2" pair. In Plan batch, the checkbox becomes the Brew day's length.
7. **On the Gantt, a multi-day step is its dot on the first day plus a line to the last day.**
   Dragging the line's end changes the length and runs the move prompt for the steps after it. The
   step dialog, batch dialog and template editor have a "Lasts [n] days" box.
8. **Checking a multi-day step off early or late moves its last day to the day it was done.** The
   start stays. Then the usual move-all / move-only prompt runs for the steps after it.

## 3. Requirements

### 3.1 Data model

- **`template_steps.days`** and **`production_steps.days`**: integer, default 1, 1–60. A step
  covers `due_on` through `due_on + days − 1`, its **last day**. Additive migration; an older image
  ignores the column.
- **`template_steps.day_offset`** accepts −30…365. A negative offset is a **pre-brew step** (§3.2).
  The template's first Brew day stays at 0, and offsets still count from the first brew day.
- **`production_steps.due_on`** stays the first day. `done_on` is the day it was checked off, which
  is its last day after a check-off (decision 8).
- **API:** step and template-step JSON gain `days` and a computed `last_on`. `days` is accepted
  wherever `due_on` / `day_offset` is accepted today (create, edit, the batch dialog's step list).
  Out-of-range values return a 422 with a readable message ("Enter 1–60 days.").

### 3.2 Pre-brew steps (decisions 1, 2)

- **Allowed types:** plain step types and custom steps, with no phase. Brew day, Transfer/Filter,
  Split, Package, Set temp, CIP and phase markers can't have a negative day (422 `not_before_brew`:
  "A <type> can't be before brew day."). See open question Q1 about CIP.
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

### 3.3 Multi-day steps (decisions 3–5, 7, 8)

**Editing the length**
- Template editor: "Lasts [n] days" on every step (markers excepted), default 1.
- Step dialog and the batch dialog's step list: the same box for an unfinished step. Changing it
  runs the move prompt for the steps after it (move all = shift by the change in the last day).
- Gantt: drag the end of the span line (mouse and touch). Same prompt. Shift-drag = move only,
  as for dots. Can't make it shorter than 1 day.
- A finished step's length can't change (it's history).

**How it behaves**
- **Links:** a step that follows a multi-day step may not start before that step's last day.
  The "steps out of order" flag and the drag hints compare against the last day.
- **Moving the step** (drag the dot, the date box): the whole span moves; the length stays.
- **Check-off (decision 8):** done on day d ≥ first day: the last day becomes d (the length
  changes), then the move prompt for the steps after it. Done before the first day: the step
  moves to d and lasts 1 day, as a one-day step's check-off moves it today. Mark not done restores
  the planned span (D49's `checkoff_move` records it).
- **What a step does to the tank happens at its check-off**, as today. Its span is only the plan.
  - **Brew day:** the tank is taken from the first day. The batch number prompt and "brewed"
    come with the check-off. Transfers, Splits and Packages still need brew day done first.
  - **Transfer/Filter/Split (decision 5):** the old tank is taken through the last day; each new
    tank from the first day. The bar of the leaving part ends on the last day; the new part's bar
    starts on the first day. The old tank's linked CIP is due on or after the last day.
  - **Package (full):** the tank empties on the last day.
  - **CIP:** the tank is clean when it's checked off; hatched across the span.
  - **Set temp:** the status line's temperature changes on check-off, as today. Before then it
    shows "· to 48° by Thu" across the span.
- **Status line:** on a tank receiving a multi-day transfer, the incoming batch shows from the
  first day with "· filling, day 1 of 2". On the tank it's leaving: "· emptying, day 1 of 2".
- **Gantt (decision 7):** the dot on the first day with a line to the last day under the bar,
  in the dot's state color (late = red once the last day has passed unfinished). Expanded rows: a
  long diamond across the span. Initials sit above the first day. Labels say "(3 days)".
- **Batch dialog:** "days 3–5" instead of "day 3". The date box edits the first day.
- **Brewery board (decision 4):** one task, shown in every day column of the span with "Day 2 of
  3" (one task, not copies). Ticking it on any day checks off the step on that day (decision 8,
  with D49's prompts on the board). After the last day, unfinished, it goes to the Unfinished card
  as today. The brewhouse device sees and works it the same way with a staff code.
- **Undo** covers length changes and every move above.

### 3.4 Two-day brews become one step (decision 6)

- **Migration** (data, one way): for each batch with `brew_two_days`, merge "Brew day - 1 of 2"
  and its "2 of 2" into the first step with `days = 2`.
  - The merged step keeps the first step's id, links, notes, assignee and task. Links into or out
    of the "2 of 2" step move to the merged step. The "2 of 2" step and its board task are deleted.
  - **Done:** done if "2 of 2" was done (its `done_on`, `done_by`, device). If only "1 of 2" was
    done, see Q2.
  - The detail "1 of 2" is cleared.
  - Recorded in the migration's log: batch, steps merged, any half-done pair.
  - `batches.brew_two_days` stays in the table (rollback) but is no longer read or written.
- **Plan batch:** "Brew over two days" becomes "Brew day lasts [1|2|…] days", defaulting to the
  template's Brew day length.
- **Rollback:** the API image before D56 ignores `days`, so a merged brew shows as one day. Merged
  pairs can only come back from the pre-release snapshot.

### 3.5 The expanded tank's "Label by" picker (5207)

As D46 §3.6 and the mockup (`docs/current_work/reference/tank_schedule_mockup.html`, "Label these
rows by batch", `lblsel` / `ui.labelBy`) describe:
- When two or more batches share a tank in the visible range, the expanded tank's first step row
  gets a picker. It chooses which batch's steps are labelled by name alone; the others keep
  "step · batch".
- Remembered per person, like the expanded state (D58 board settings). Front end only.
- Its Playwright test replaces the `tests/COVERAGE.md` limitation line.

### 3.6 Board settings refresh when the app returns (5207)

- When the page becomes visible again (`visibilitychange`), re-read `/api/me` at most once a
  minute. Apply the new `board_settings`, `color_mode` and `show_planned_batches` without a reload.
- A board-settings PUT in flight isn't aborted or overwritten.
- A failed refresh is silent: no "Can't reach the server" over a working app (keep `loadMe`'s
  existing handling).
- Shared tablets too. Front end only.

### 3.7 Template step Save is all-or-nothing (5210)

- One API call saves a template step and its picked "comes after" / "leads to" links in one
  transaction. If any link is refused, nothing is saved and the error names the link.
- The editor uses it; a reload mid-Save leaves the old step and links as they were.

### 3.8 A step taken off the task list stays reachable (5211)

- "Take off the task list" keeps the step on the Gantt, as the prompt promises. In the expanded
  tank it's a diamond like every other step. The batch dialog's step name opens its step dialog.
- Its step dialog's "Show on the Brewery task list" puts it back (a new task, as for any step
  turned on).
- The collapsed row's dots stay as D46 defines them (task-list steps and CIPs).
- First reproduce on local (`#907 · Set temp - 58°` path in the task) to find which of those is
  missing.

### 3.9 Undo snackbar over dialogs (4950) — proposed, see Q3

- **A:** Ctrl/Cmd+Z runs the live Undo while one is live and focus isn't in a text field. It
  works with a dialog open. The snackbar's text mentions it on a device with a keyboard.
- **B:** while a dialog is open, the snackbar stays up until its Undo expires (2 minutes) or is
  used. With no dialog it hides as today.
- **C:** with a dialog open, the snackbar sits at the bottom of the screen, clear of the dialog's
  title.

### 3.10 Boards due date typed by hand (5791) — done

Fixed on the branch (`d627538`): the card's due date saves on leaving the field or Enter.
Included in the DEV runs and QA.

## 4. Not in D56

- D57 test results and automatic retests (5208).
- CIPs before brew day on a batch (Q1), unless Matt says otherwise.
- °Plato (4987), events in calendar feeds (4055), company-wide events (4056), 5789, 4084.

## 5. Open questions for Matt

- **Q1 — CIP before brew day.** Should a batch be able to have a "CIP & Sanitize" on its first
  tank before brew day, clearing the "filling a dirty tank" flag? Proposed: no; the standalone CIP
  already does that.
- **Q2 — a half-done two-day brew at release.** If a batch has "1 of 2" done and "2 of 2" not
  when the migration runs, proposed: the merged step stays **not done** but keeps its batch number,
  and the batch stays brewed. Simpler: release on a day with no brew in progress, and the migration
  refuses to run if it finds one.
- **Q3 — 4950.** Are §3.9's A/B/C the right fix, or a smaller one (just Ctrl/Cmd+Z)?
- **Q4 — limits.** Pre-brew up to 30 days before brew day; a step up to 60 days long. OK?

## 6. Persona scenarios

| # | Persona | Entry | Scenario | Expect |
|---|---|---|---|---|
| S1 | `breweryMgr` | Set up → Templates | Adds "Prepare grain" at day −1; tries a Transfer at −1 | Saved, preview left of brew day; Transfer refused with the message |
| S2 | `brewer1` | Gantt → Plan batch | Plans from that template on FV3 | A dot left of the bar on FV3; no overlap flag with the batch ending there the day before |
| S3 | `brewer1` | Gantt | Drags the bar 2 days later; then Undo | The pre-brew dot moves with it; Undo puts both back; persists after reload |
| S4 | `brewer1` | Batch dialog | Moves brew day by the date box, answers "Move only" | Pre-brew step still moves; steps after brew day stay |
| S5 | `brewer1` | Gantt | Drags the pre-brew dot onto brew day | Refused, the hint says why |
| S6 | `brewer1` | Tasks → Brewery | Ticks the pre-brew task of a planned batch | Done; no batch number prompt; the batch stays planned (P-number) |
| S7 | `breweryMgr` | Templates | Dry hop "Lasts 3 days"; a Gravity check linked after it on its first day | Out-of-order warning; saved at its last day instead |
| S8 | `brewer1` | Gantt | Drags the dry hop's span end out 2 days, "Move all" | Followers shift 2 days; reload keeps it |
| S9 | `brewer1` | Tasks → Brewery | The 3-day dry hop shows in each day's column, "Day 2 of 3" | One task; ticking it on day 2 makes it 2 days and asks about the followers |
| S10 | `brewer1` | Step dialog | Mark not done after S9 | Back to 3 days, followers back if they moved |
| S11 | `brewer1` | Gantt | A 2-day Transfer FV3 → FV5 | FV5 taken from day 1, FV3 through day 2; a batch already on FV5 on day 1 is flagged; FV3's CIP on day 2 |
| S12 | `brewer1` | Plan batch | "Brew day lasts 2 days" | One Brew day dot with a line; check-off asks for the batch number once |
| S13 | — | migration on a copy of seeded data | Two-day batches before and after | One 2-day step each; links and tasks moved; the "2 of 2" task gone |
| S14 | `breweryDevice` | Production, staff code | Changes a step's length; ticks a multi-day task | Works; "· on Brewery Test 1" in History; others' Undo refused |
| S15 | `brewer2` (not Brewery manager) | API | Length outside 1–60; pre-brew at −31 | 422 with the messages |
| S16 | `office1` | API | Change a step's length | 403, as for other schedule writes |
| S17 | `brewer1` | Gantt, two batches in FV3 in range | Expands FV3, picks a batch in "Label by" | Its steps by name only; kept after reload and on another browser |
| S18 | `brewer1` | two browser contexts | Changes Show planned batches in A; B returns to the screen | B shows it with no reload; no error if `/api/me` fails |
| S19 | `breweryMgr` | Template editor | Picks two links; the server refuses the second | Nothing saved, error names the link; a retry saves both |
| S20 | `brewer1` | Tasks → Brewery | Takes a linked task off the list | Step still on the Gantt (expanded) and in the batch dialog; its dialog puts it back |
| S21 | `brewer1` | Batch dialog → Pencil in | Ctrl/Cmd+Z with the dialog open | Undo runs; the snackbar doesn't cover the title |
| S22 | `bartender1` | Boards → a card | Types a due date key by key | Saved once on leaving the field (5791) |

## 7. Rollout

- **Migrations:** `days` on both step tables (additive). The two-day brew merge (data, one way;
  rollback needs the pre-release snapshot). The day-offset range change is validation only.
- **No new secrets.**
- **Release timing:** see Q2. Check on prod before the release that no two-day brew is half done.
