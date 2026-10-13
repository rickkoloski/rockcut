# D39: Recurring Tasks + D38 Follow-ups — Plan

**Spec:** `specs/d38_brewery_task_board_spec.md`. D39's part is in the
"Delivery split": §3.10 (recurring tasks), the §5 items moved to D39, and
"Phone width" (the vertical view and dragging between days). Scenarios
S52–S67 and S69–S77; S68 (the staff code) is D40.
**Release:** D39 merges to `develop` after its DEV gate and waits. D38, D39,
D41 and D40 ship in one prod release after D40.
**Branch:** `d39-brewery-recurring-tasks`, cut from `develop` (`2d9624d`).
**Task:** PortableMind 4212

## Approach

D39 is three groups of work. Each lands as its own commits and can be
tested on its own:

1. **Recurring tasks** (§3.10): the biggest part. A `brewery_task_series`
   rule row, plus real `brewery_tasks` rows for each occurrence, kept 12
   months ahead.
2. **Phone: vertical view and drag between days** (spec "Phone width",
   S70–S74). Matt added (2026-10-12): dragging from the Unfinished card to a
   day, and rescheduling by dragging to another day, on the phone.
3. **D38 follow-ups** (§5, S75–S77): un-retiring Daily items, the QA pass 2
   gaps, back-closes for the other phone dialogs, and the S26 flake.

### Recurring tasks

**It follows D32's events, with three differences:**

| | D32 events | D39 tasks |
|---|---|---|
| Rules | weekly (every 1–2 weeks), monthly by nth weekday | weekly (every 1–4 weeks), monthly by day **or** nth weekday, quarterly, annually |
| Horizon | 12 months at creation, then an **Extend** button | always 12 months ahead: the D22 scanner tops up every day |
| Same date twice | an occurrence is found by its time | `series_id` + `series_date` is unique, so a moved occurrence can't be generated again on its old date |

**`Recurrence` is shared, not copied.** Its functions match on
`%ScheduleEventSeries{}` today.
- They'll match on the rule's fields instead (`frequency`, `interval`,
  `weekdays`, `week_of_month`, `weekday`, `day_of_month`, `start_date`,
  `until_date`, `count`, `skipped_dates`), so a `brewery_task_series` works
  too.
- New `candidates` clauses:
  - `monthly_day`: day N, or the month's last day if it's shorter;
  - `quarterly_day` and `quarterly_weekday`: every 3 months from the start
    month;
  - `annually`: the start's month and day, with Feb 29 → Feb 28.
- D32's `weekly` and `monthly_weekday` don't change, and its tests must
  pass untouched.
- The brewery series stores the spec's `frequency` + `month_rule`, and maps
  them to these internal kinds in one function.

**Occurrences are ordinary tasks.**
- Each occurrence is created at the bottom of its day. The bottom positions
  for all the new dates are found in one query.
- Everything D38 does to a task works unchanged: complete, uncomplete,
  move, Move all to today, the Unfinished card, the filter and the Daily
  counts.
- `Placement` gains nothing except `series_id` on the card, which the UI
  uses for the ↻ icon.

**Horizon:**
- through `today + 12 months`, including that date, so an annual task has
  next year's occurrence as soon as this year's exists (spec §3.10);
- capped by `until_date` and `count`, as D32 does.

The top-up is `BreweryTasks.Series.top_up(today)`, called from the D22
`Reminders.Scheduler` tick (every 5 minutes).
- It's one query for the series whose `generated_through` is behind, so
  every tick after the first one of the day does nothing (S66).
- It's idempotent: the unique index guards it, and `generated_through` only
  moves forward.

**Edits** (spec "Changing one"):
- **Just this one:** changes the occurrence and sets `series_exception`.
- **This and all following, content only** (title, notes, assignee): the
  same result as the spec's split, done in place, as D32's
  `update_following` does. The series row takes the new content, and every
  occurrence from this `series_date` on that's open and not an exception
  gets it. Earlier occurrences, finished ones and exceptions don't change
  (S61).
- **This and all following, rule changed:** a real split, D32's `split/2`.
  The old series ends the day before. Its later open occurrences are
  removed, and those changed on their own are kept or removed as chosen in
  the confirm (Decision 2). A new series starts on this occurrence's date
  with the new rule, and the count carries over (D32's `remaining_count`).
- **Day changes always apply to one occurrence.** That covers a drag,
  Change day…, Move to Future, Move all to today, and the Day field in the
  dialog. Each one sets `series_exception`, and never asks (spec).
- **Delete just this one:** adds its `series_date` to `skipped_dates`,
  then deletes it (S64).
- **Delete this and all following**, and **Stop repeating:** end the series
  the day before (Stop repeating: on this one), and remove later open
  occurrences. Occurrences changed on their own are kept or removed, as
  the person chooses in the confirm (Decision 2). The counts come from a
  `series` endpoint (S63).
- **Moving a task onto the Future list ends its repeat link.** A recurring
  task needs a day (S67), so the occurrence becomes a one-off: `series_id`
  is cleared, and its date goes on `skipped_dates`.
- **Someone leaving the Brewery:** D38 unassigns their open tasks. D39 also
  clears `assignee_id` on series they're assigned to, in the same
  transaction, so the top-up doesn't assign them new occurrences.

**History:** one entry per series action, on the occurrence acted on. For
example, "created recurring task (Repeats every week on Wed)", "changed this
and following", "stopped repeating (removed 40)". The top-up writes nothing.
Decision 3 below.

### Phone: vertical view and drag between days

**The vertical view is the desktop board in one column.**
- The same `SortableLists` and containers, with Unfinished first and Future
  last.
- Every day shows its header, Daily card and tasks, stacked.
- `sameListOnly` is off, so drags go between days as on desktop.
- `@dnd-kit` auto-scroll is already on, and it scrolls the window when a
  held task nears the top or bottom.

**The view toggle** sits in the phone toolbar.
- It's remembered per browser in `localStorage` (wrapped in try/catch, like
  1 week / 2 weeks).
- With no saved choice, phones start in the vertical view (S70).
- The one-day view and its swipe stay as they are.

**One-day view, Unfinished → today (S73):**
- `sameListOnly: boolean` becomes `canMoveTo(fromList, toList)` in the
  generic layer (default: any).
- The board's phone rule is: the same list, or Unfinished → today.
- No Brewery code goes into `components/dnd/`.

### D38 follow-ups

- **Un-retire (S75).** Edit Daily items gets a "Retired" section with
  Restore. The API is `POST /daily_items/:id/restore`, not `PATCH active`;
  G3's 422 stays. Restore:
  - puts the item back at the bottom;
  - counts against the 12-item limit;
  - is refused if an active item has the same name (ignoring case);
  - logs "restored".
- **GAP-1 / GAP-2.** Any `PATCH` on a retired item answers 422 `retired`:
  - a rename, which today returns 404;
  - `active: false` or `position`, which today return a silent 200.
- **O-1 (S77).** Editing or completing a task someone else deleted answers
  `410 deleted`, if History has a "deleted" entry for that id. The UI says
  "This task was deleted".
- **O-2.** The Edit Daily items dialog reads the board's query, so the
  60-second refresh updates its list while it's open.
- **O-3.** Unticking a retired item that was ticked today: Decision 1.
- **Back-closes (S76).** `useBackCloses` on:
  - the task dialog;
  - "Where should it show";
  - Change day…;
  - History;
  - Edit Daily items;
  - the confirm dialogs.

  At phone width only, as with the sheet.
- **S26.** First, find the cause. Run `task-board-daily` with
  `--repeat-each 20` and full-suite runs with tracing kept, and look at why
  the last box's click didn't check it. A fix goes in only with a cause.
  If no cause turns up in a bounded try (about two hours), the result is
  written up and stays open.

## Changes

### API (`rockcut_api`)

- **Migration `…_create_brewery_task_series`:**
  - `brewery_task_series` with the spec §3.1 columns. The internal rule
    kind isn't stored: `TaskSeries.rule_kind/1` derives it from
    `frequency` + `month_rule`;
  - adds `series_id` (FK, `on_delete: :nilify_all`), `series_date` and
    `series_exception` (default false) to `brewery_tasks`;
  - a unique index on `(series_id, series_date)`, and an index on
    `brewery_task_series.generated_through`.

  Reversible.
- **`Scheduling.Recurrence`:** the generalization and the new rules above,
  with tests for every new rule, including Feb 29, day 31 and "last Friday".
- **`BreweryTasks.Series`** (a new module, like `EventSeries`): `create`,
  `update(task, attrs, scope)`, `delete(task, scope)`, `stop(task)`,
  `preview(task)` (later open count), `top_up(today)`, and the
  repeat-param parsing. `BreweryTasks.create/update/delete/move` call into
  it when `repeat` or `scope` is present, or when the task has a
  `series_id`.
- **Schema `BreweryTasks.TaskSeries`**, validated:
  - weekly: 1–7 weekdays, interval 1–4;
  - monthly and quarterly: `day` 1–31, or nth 1–4 or last;
  - annually: no options;
  - end: a date or 1–400 times, not both.
- **Controller:**
  - flat `repeat*` params on `POST /tasks` and `PATCH /tasks/:id`, as
    D32's are: `repeat`, `repeat_interval`, `repeat_weekdays`,
    `repeat_month_rule`, `repeat_day_of_month`, `repeat_week_of_month`,
    `repeat_weekday`, `repeat_until`, `repeat_count`;
  - `scope=this|following` on `PATCH` and `DELETE`;
  - `GET /tasks/:id/series` returns the rule, its summary fields and the
    later open count;
  - `POST /tasks/:id/stop_repeating`;
  - `POST /daily_items/:id/restore`;
  - every new route is in the people-only scope and the route matrix.
- **The board JSON:** each card gets `series_id`, and the task dialog's data
  gets the series rule.
- **Errors in `brewery_errors.ex`:**
  - `repeat_needs_day`;
  - `scope_required` (a `PATCH` or `DELETE` on an occurrence without
    `scope`);
  - `deleted` (410);
  - `retired` on every retired-item write.
- **Scanner:** `Reminders.Scheduler`'s tick also calls `Series.top_up/1`,
  rescued on its own so one failure doesn't stop the reminders.
- **Seed:**
  - `[SEED]` "Keg Wash" (weekly, Wed);
  - "Glycol check" (monthly, last Fri);
  - "Calibrate pH meter" (quarterly).

  `reset` deletes `[SEED]` series and their tasks. `cleanup_temp` deletes
  `[TEST-TEMP]` series.

### UI (`rockcut-ui`)

- **`lib/events.ts` repeat helpers:** extended for the new rules, or a
  small `lib/repeat.ts` that the event helpers keep using, so D32's dialog
  keeps working. `repeatSummary` covers "on the 31st (or the last day)",
  "every 3 months on the 15th" and "every year on Mar 1".
- **`TaskDialog`:**
  - a Repeat field (Never / Weekly / Monthly / Quarterly / Annually), with
    defaults from the Day;
  - rule options, Ends, and a summary line;
  - Repeat is disabled with "Pick a day to repeat" when the Day is No day
    (S67).

  For an occurrence, Save asks "Just this one" / "This and all following",
  as D32's dialog does (S69). The dialog still sends only changed fields
  (G1).
- **`TaskCard`:** a ↻ icon when `series_id` is set.
- **`TaskMenu`:** for an occurrence it adds:
  - **Edit series…** (the dialog, with "This and all following" chosen);
  - **Stop repeating** (a confirm with the count from `GET …/series`).

  Delete asks for the scope.
- **The vertical view and the toggle** (`TaskBoard`, `BoardToolbar`),
  `canMoveTo` in `SortableLists`, and the board's phone rule.
- **`DailyItemsDialog`:** the Retired section with Restore, and reading the
  board query (O-2).
- **`useBackCloses`** on the dialogs listed above.

## Tests

**ExUnit:**
- `scheduling/recurrence_test`: each new rule; the D32 cases unchanged.
- `brewery_tasks/series_test`:
  - create with each rule (S52–S57), and the horizon including next year's
    annual;
  - complete one (S58), and move one with no second copy (S59);
  - "this" (S60), "following" content (S61, exceptions kept), "following"
    rule (S62, split and count);
  - `changed=keep` and `changed=remove` for stop, delete "following" and a
    rule split;
  - stop (S63, with the count), delete "this" with the skip held (S64), and
    delete "following";
  - move to Future ends the link;
  - top-up idempotent across two runs and a day later (S66), and never past
    `until` or `count`;
  - Move all to today with three missed occurrences (S65);
  - leaving the Brewery clears the series assignee.
- `brewery_daily_test`: restore (limit, name clash, position, log); GAP-1
  and GAP-2; O-3 as decided.
- Controller: the new params and routes, `scope_required`, `deleted` 410,
  the route matrix, and every route as a non-Brewery person (403).

**Vitest:** `repeatSummary` and the default rules from a day; `moveModel`
with `canMoveTo`.

**Playwright** (`tests/regression/brewery/`):

| File | Scenarios |
|---|---|
| `task-board-recurring.spec.ts` (new) | S52–S65, S67, S69 |
| `task-board-phone.spec.ts` | S70–S74 at 360px with emulated touch, and S76 (back closes each dialog) |
| `task-board-daily-items.spec.ts` | S75, O-2 |
| `task-board-tasks.spec.ts` | S77 |

- S66 is ExUnit-only.
- Every write is persist-verified, and dates are relative to today.
- Long ranges for S52 use the date range selector, 31 days at a time.
- `tests/COVERAGE.md` gets a D39 section.
- **Pixel (Matt, at the DEV gate):** S70–S74 and S76 on hardware.

## Order of work

1. `Recurrence` generalization and the new rules, with tests; D32's
   recurrence and event tests stay green.
2. Migration, the `TaskSeries` schema, and `BreweryTasks.Series`:
   create, top-up and delete, with ExUnit.
3. Series edits ("this", "following" content, rule split), stop, preview,
   and the Future and leaving-the-Brewery rules, with ExUnit.
4. Controller, routes, errors, route matrix, scanner hook, seed.
5. The UI: Repeat in `TaskDialog`, the scope chooser, ↻, the menu items.
   Drive S52–S69 in a browser as the personas, then write
   `task-board-recurring`.
6. D38 follow-ups, API and UI (S75–S77, GAP-1/2, O-2, O-3,
   back-closes).
7. Phone: `canMoveTo`, the vertical view and toggle, Unfinished → today.
   Drive S70–S74 at 360px, then the specs.
8. The S26 investigation (time-boxed).
9. COVERAGE.md, the local gate, and a PR to `develop` with the handoff
   note.

## Handoff-note LIMITATIONS to carry to DEV

- **The top-up on a real clock.** Locally it's tested with a pinned
  `today`. On DEV, check the scanner ran (`generated_through` is today +
  12 months) after the deploy, and again the next day if the gate runs
  that long.
- **Touch in the vertical view (Pixel):**
  - a long-press drag across days with auto-scroll;
  - Unfinished → a day;
  - a normal scroll that starts on a card only scrolls;
  - back closing each dialog.
- **Volume:** a weekly series makes 53 rows a year. Check a 31-day range
  `GET` stays quick on DEV with the seed's series.
- **The migration at boot** on the DEV volume.

## Risks

- **Series edits are the subtlest part.** Mitigations: D32's proven
  split and count logic, a test per scenario, and the rule that day changes
  are always "just this one".
- **Changing `Recurrence` could break D32 events.** Its existing tests
  run unchanged in step 1, before anything else builds on it.
- **Size.** If the gate runs long, the S26 investigation and back-closes on
  the confirm dialogs can move out without touching the rest.

## Decisions (Matt, 2026-10-12)

1. **O-3:** unticking a retired item is **refused** (422 `retired`, "Temps
   is retired; its ticks are kept").
2. **Removing later repeats asks about the ones changed on their own.**
   This covers Stop repeating, Delete "this and all following", and a
   rule change saved with "This and all following".
   - When some later open occurrences were moved or edited on their own,
     the confirm offers two buttons:
     - **"Remove 40, keep the 2 changed on their own"**;
     - **"Remove all 42"** (that deletes the 2 changed on their own too).
   - When none were changed, it's a plain confirm: "Removes 40 later
     occurrences".
   - A rule change has no confirm when nothing would be removed.
   - The API takes `changed=keep|remove` (default `keep`), and
     `GET …/series` returns both counts.
3. **History:** one entry per series action, and none from the daily
   top-up.
4. **Moving an occurrence to the Future list makes it a one-off.** Its
   `series_id` is cleared and its date is skipped.
