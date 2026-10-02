# D32: Schedule Events + Taproom Rename — Implementation Instructions

**Spec:** `d32_schedule_events_spec.md` (approved 2026-09-29, including recurring events)
**Plan status:** Approved — Matt, 2026-09-29 (decisions 1–8 confirmed; questions answered below)
**Created:** 2026-09-29
**Branch:** `d32-schedule-events` (off `d31-rbac-consolidation`, which passed its DEV gate; merge waits on the workflow §2 branch cleanup)
**Process:** `docs/process/three_environment_workflow.md` — read it before starting.
**Backlog:** PortableMind project 254, task 3937 (+ 3940)

---

## Overview

Six phases, one commit (or more) each. Run the **full** API suite after every
API step (`cd rockcut_api && MIX_ENV=test mix test`). Format touched files only;
never run repo-wide `mix format` or `mix precommit`.

**Rules for the whole deliverable:**
- `test/rockcut_api/authz_parity/` stays **untouched and green**. If a parity
  test fails, behavior changed. Stop and ask Matt.
- `authz_boundary_test.exs` stays green. Every permission question about an
  event goes through `Authz`.
- Events **never** call `Notifications`.

| Phase | What | Commit message |
|---|---|---|
| A | Events API: migration, schema, context, `Authz`, controller, routes, JSON, ExUnit | `feat: D32 schedule events API` |
| R | Recurring events API: series table, rule expansion in Colorado time, scoped edit/delete, extend | `feat: D32 recurring schedule events` |
| B | "Bar" → "Taproom" rename: migration, seeds, UI label from data, tests | `feat: D32 rename the Bar department to Taproom` |
| C | Events UI: types, grid Events row, event dialog, agenda, Publish week | `feat: D32 schedule events in the scheduler and agenda` |
| D | 3940: dialogs default to the viewed week, + regression spec | `fix: D32 add dialogs default to the week being viewed` |
| E | Playwright event specs, local gate, PR | `test: D32 schedule events regression specs` |

---

## Prerequisites

- [ ] On `d32-schedule-events`; tree clean; the approved spec is committed (`a6051b6`).
- [ ] Baselines: `MIX_ENV=test mix test` → **605** passing. Local Playwright →
      28 passed, 1 skipped. `tsc` → 3 errors and `pnpm lint` → 27 problems,
      both pre-existing (waived in D31). **D32 must not add to either count.**
- [ ] Local servers seeded with personas (`mix rockcut.synthetic.setup`) for Phases C–E.

---

## Implementation decisions (approved by Matt, 2026-09-29)

1. **All-day events are stored as Denver-local midnights.** `starts_at` = start
   date 00:00 Denver, converted to UTC. `ends_at` = the day **after** the end
   date, 00:00 Denver (exclusive). The UI already works in Denver date keys
   (`localDayKey`, `localInputToUtc`), so a Fri–Sat event lands on Fri and Sat
   whatever the UTC offset. This needs no extra columns.
2. **A week query finds events by overlap, not by start time:**
   `starts_at <= end of "to"` **and** `ends_at > start of "from"`. Shifts filter
   on `starts_at` only, which would miss a multi-day event that began before the
   week.
3. **Publish week uses a batch endpoint**, `POST /api/schedule_events/publish`
   `{ids}`, mirroring `POST /api/shifts/publish`. The spec lists the single-event
   routes; this is the bulk twin Publish week needs.
4. **Read errors:** if the actor can't `:read` the event → **404** (A1: a hidden
   draft doesn't reveal it exists). If they can read it but can't do the action
   → **403** (S4).
5. **Copy last week and Delete week leave events alone.** Events are one-offs,
   and deleting a week's shifts shouldn't silently delete a party booking.
   **Matt: yes** (spec P1).
6. **Agenda filters:** events show when the department filter matches (or is
   empty). They're hidden when "Mine", "Open" or a position filter is on, since
   those are shift concepts. **Matt: yes** (spec P2).
7. **Add the `tz` library to the API** (`{:tz, "~> 0.28"}`, pure Elixir, no
   system dependency), with
   `config :elixir, :time_zone_database, Tz.TimeZoneDatabase` and a single
   business zone `"America/Denver"`, the zone `src/lib/datetime.ts` already
   uses. Series expansion needs real time-zone rules so 7 pm stays 7 pm across
   DST (spec §3.7). Expanding on the client instead was rejected: the server
   has to own the rule for Extend and "this and following".
8. **Series = a rule row + real event rows** (spec §3.7). Occurrences carry
   `series_id` and a `series_exception` flag, set by a *this event only* edit
   and shown in the dialog. A rule change with *this and following* **splits**
   the series: the old one's `until_date` becomes the day before, and a new
   series is created from the chosen date.

---

## PHASE A — Events API

### A.1 Migration + schema
**Files:** `priv/repo/migrations/<ts>_create_schedule_events.exs`, `lib/rockcut_api/scheduling/schedule_event.ex`

```elixir
create table(:schedule_events) do
  add :department_id, references(:departments, on_delete: :restrict), null: false
  add :title, :string, null: false
  add :notes, :text
  add :all_day, :boolean, null: false, default: false
  add :starts_at, :utc_datetime, null: false
  add :ends_at, :utc_datetime, null: false
  add :status, :string, null: false, default: "draft"
  add :created_by_id, references(:users, on_delete: :nilify_all)
  timestamps(type: :utc_datetime)
end
create index(:schedule_events, [:department_id])
create index(:schedule_events, [:starts_at])
```

`ScheduleEvent.changeset/2`:
- casts department_id, title, notes, all_day, starts_at, ends_at, status, created_by_id;
- requires department_id, title, starts_at, ends_at, status;
- title length ≤ 100, trimmed and non-blank;
- status in `draft`/`published`;
- end after start (reuse the shift pattern);
- FK constraints.

No assignee or position fields exist, so "never has an assignee" holds by construction.

### A.2 Context functions
**File:** `lib/rockcut_api/scheduling.ex` (keep events in `Scheduling`; there's no reason for a new context)

- `list_events(user, filters)`: same visibility as shifts
  (`Authz.scope(user, :schedule, :manage)`: `:all` / published only /
  published + managed departments), then `department_id` and the
  overlap-based `from`/`to` filters (decision 2), ordered by `starts_at`,
  preloading `:department`.
- `get_event/1`, `get_event!/1` (preload `:department`).
- `create_event(attrs, actor)`: puts `created_by_id`, defaults to `draft`.
- `update_event/2`, `delete_event/1`.
- `publish_event/1`, `unpublish_event/1`, `publish_events/1` (drafts only).
- **No `Notifications` calls anywhere.** Say so in the moduledoc.

### A.3 `Authz`
**File:** `lib/rockcut_api/authz.ex`

Add a `%ScheduleEvent{}` clause **after** the owner shortcut, next to the shift clause:

```elixir
# Schedule events (D32): published events are readable by everyone; drafts and
# every write belong to the department's managers (owners pass above).
def can?(%User{} = user, action, %ScheduleEvent{} = event) do
  manager? = role_in(user, event.department_id) == :manager

  case action do
    :read -> event.status == "published" or manager?
    a when a in [:create, :update, :delete, :publish, :unpublish] -> manager?
    _ -> false
  end
end
```

No `:claim` clause, so it falls through to `false`.

### A.4 Controller, routes, JSON
**Files:** `lib/rockcut_api_web/controllers/schedule_event_controller.ex`, `router.ex`, `json_helpers.ex`

Routes go in the `[:api, :authenticated]` scope:
```
get    "/schedule_events",             ScheduleEventController, :index
post   "/schedule_events",             ScheduleEventController, :create
post   "/schedule_events/publish",     ScheduleEventController, :publish_batch   # before /:id routes
get    "/schedule_events/:id",         ScheduleEventController, :show
patch  "/schedule_events/:id",         ScheduleEventController, :update
delete "/schedule_events/:id",         ScheduleEventController, :delete
post   "/schedule_events/:id/publish",   ScheduleEventController, :publish
post   "/schedule_events/:id/unpublish", ScheduleEventController, :unpublish
```

- **Controller:**
  - Mirror `ShiftController`, with `with_event/4` applying decision 4 (can't read → 404; else can't act → 403).
  - `create` authorizes against `%ScheduleEvent{department_id: params["department_id"], status: "draft"}`.
  - `update` also checks the destination department when `department_id` changes.
  - `publish_batch` filters ids with `Authz.can?(actor, :publish, e)`.
- **JSON:** `schedule_event/1` in `JSONHelpers`: id, department_id,
  `department` (via `maybe_render`), title, notes, all_day, starts_at, ends_at,
  status, created_by_id, timestamps.

### A.5 Tests (new files; the parity dir is not touched)
- `test/rockcut_api/scheduling/schedule_event_test.exs`:
  - changeset rules: title required and ≤ 100; end after start; status inclusion;
  - all-day round trip;
  - overlap filter: an event starting before `from` and ending inside the week is returned;
  - publish only moves drafts.
- `test/rockcut_api/authz_events_test.exs`: persona × decision matrix using
  `PersonaFixtures`. For owner, barMgr, dualMgr, splitRole, breweryMgr,
  bartender1, floater, noDept: read a published / draft Bar event; create /
  update / delete / publish / unpublish a Bar event; list visibility.
- `test/rockcut_api_web/controllers/schedule_event_controller_test.exs`:
  - status codes, including **404** on an employee reading a draft (S5) and
    **403** on an employee updating a published event (S4);
  - batch publish skips events the actor can't publish;
  - **no `Notification` rows are created** by create, update, publish, batch publish or delete.
- `mix test` all green. The parity files are unchanged
  (`git diff f0ecc07 -- rockcut_api/test/rockcut_api/authz_parity/` is empty).

---

## PHASE R — Recurring events API

### R.1 Dependency + zone
- `mix.exs`: `{:tz, "~> 0.28"}`; `mix deps.get`.
- `config/config.exs`: `config :elixir, :time_zone_database, Tz.TimeZoneDatabase`.
- `RockcutApi.Scheduling.Recurrence` module attribute `@zone "America/Denver"`.
- Confirm the Docker release build still works (it's pure Elixir, but check it
  on DEV; list it in LIMITATIONS).

### R.2 Migration + schema
**Files:** `<ts>_create_schedule_event_series.exs`, `scheduling/schedule_event_series.ex`

`schedule_event_series`:
- `department_id` (restrict), `title`, `notes`, `all_day`;
- `start_time` (`:time`, Colorado wall clock; null if all day), `duration_minutes` (timed) or `span_days` (all day, ≥ 1);
- `frequency` (`weekly` | `monthly_weekday`);
- `interval` (1 or 2; weekly only);
- `weekdays` (JSON list of 1–7; weekly), `week_of_month` (1–4 or −1 = last) + `weekday` (monthly);
- `start_date`, `until_date` (nullable), `count` (nullable), `generated_through` (date);
- `created_by_id`, timestamps.

`schedule_events` gets `series_id` (references, `on_delete: :nilify_all`) and
`series_exception` (boolean, default false) in the same migration. Changeset
validations follow R2: no day-of-month rule, interval ∈ {1, 2}, week_of_month
∈ {1, 2, 3, 4, −1}, exactly one of until_date / count or neither.

### R.3 Expansion (`RockcutApi.Scheduling.Recurrence`, pure functions)
- `dates(series, from_date, to_date) :: [Date.t()]`: weekly (weekdays ×
  interval, anchored on `start_date`'s week) and monthly_weekday (nth or last
  weekday), bounded by `until_date`, `count` and `to_date`.
- `occurrence_times(series, date) :: {starts_at_utc, ends_at_utc}`: builds
  `DateTime.new!(date, start_time, @zone)` and shifts it to UTC. All-day uses
  decision 1. A time that doesn't exist on the DST-forward day moves to the
  next valid time; an ambiguous time on the fall-back day uses the first one.
- The horizon is `min(start_date + 12 months, until_date)`; later, extend
  up to `today + 12 months`.

### R.4 Context functions (`Scheduling`)
- `create_series(attrs, actor)`: in one `Repo.transaction`, insert the series,
  then insert its draft occurrences up to the horizon and set `generated_through`.
- `extend_series(series)`: generates from `generated_through + 1` to the new
  horizon. It's idempotent: it skips dates that already have an occurrence,
  even a deleted one (see below).
- `update_event(event, attrs, scope: :this | :following)`:
  - `:this`: update the row and set `series_exception: true`.
  - `:following` with only content fields (title, notes, department, time):
    update the series row and every occurrence dated ≥ this one.
  - `:following` with a rule change: **split** (decision 8).
- `delete_event(event, scope)`:
  - `:this`: delete the row. The series remembers the skipped date so extend
    doesn't recreate it (a `skipped_dates` JSON list on the series).
  - `:following`: delete occurrences dated ≥ this one and set `until_date` to the day before.
- Never touch occurrences dated before today on `:following` operations
  unless the chosen event itself is earlier; then only from that date on.

### R.5 `Authz`, controller, routes
- `Authz`: a `%ScheduleEventSeries{}` clause next to the event clause.
  `:update`/`:delete`/`:extend` go to managers of `series.department_id`; there's
  no read of a series apart from its events. A `:following` edit that changes
  the department checks both departments, like shifts.
- `POST /api/schedule_events` with `repeat` params (`frequency`, `interval`,
  `weekdays`, `week_of_month`, `weekday`, `until_date` | `count`) → creates a
  series and returns the first occurrence plus `series_id`.
- `PATCH` / `DELETE /api/schedule_events/:id?scope=this|following`.
- `POST /api/schedule_event_series/:id/extend`.
- JSON: `series_id`, `series_exception`, and a `series` summary (frequency,
  interval, weekdays, week_of_month, weekday, until_date, count,
  generated_through) when preloaded.

### R.6 Tests
- `recurrence_test.exs` (pure):
  - every Tuesday; every other Tue + Thu; 3rd Sunday; last Friday;
  - a month with a 5th Sunday (the last Sunday is the 5th);
  - count vs until_date; the 12-month cap;
  - **DST:** a 7 pm series across 2026-11-01 and 2027-03-14 stays 19:00 local;
  - skipped dates aren't regenerated.
- Context/controller tests:
  - create, then 8 draft rows with the same `series_id`;
  - *this* edit sets the exception flag;
  - *following* content edit leaves earlier rows alone;
  - rule change splits the series;
  - delete *this* / *following*;
  - extend is idempotent;
  - permissions per persona (managers of the department + owners; breweryMgr 403; employee 403/404);
  - **no notifications** from any series operation.

---

## PHASE B — "Bar" → "Taproom" rename

### B.1 Data migration
**File:** `priv/repo/migrations/<ts>_rename_bar_department_to_taproom.exs`

Plain SQL; don't call app code:
```elixir
def up do
  execute "UPDATE departments SET name = 'Taproom' WHERE key = 'bar' AND name = 'Bar'"
  execute "UPDATE positions SET \"group\" = 'Taproom' WHERE \"group\" = 'Bar'"
end

def down do
  execute "UPDATE departments SET name = 'Bar' WHERE key = 'bar' AND name = 'Taproom'"
  execute "UPDATE positions SET \"group\" = 'Bar' WHERE \"group\" = 'Taproom'"
end
```
Check first how `positions.group` is quoted in existing migrations and queries; it's a reserved word.

### B.2 Seeds
**File:** `priv/repo/seeds.exs`
- The department tuple becomes `{"Taproom", "bar", …}`.
- `group_to_key`: `"Taproom" => "bar"`.
- The four position tuples' group `"Bar"` → `"Taproom"`. Position **names** are unchanged (Q5).

`Seeds.Synthetic` uses department keys and position names, so it should need no
change. Confirm `synthetic_test.exs` still passes.

### B.3 UI label from data
**File:** `rockcut-ui/src/App.tsx`
- `DEPT_META` keeps the icon and children per key. The **label** comes from
  `/api/departments` (`name` by `key`), falling back to the `DEPT_META` label
  only while loading.
- Add `useApiQuery<Department[]>(['departments'], '/api/departments')`. The
  query key is already shared with the Schedule page, so there's no extra fetch.
- Section sort stays alphabetical **by the displayed name**.

### B.4 Tests
- Grep for `'Bar'` / `"Bar"` in `rockcut-ui/tests` and `rockcut_api/test`:
  - update `tests/smoke/roles.spec.ts` (nav section names) to `Taproom`;
  - leave API test fixtures that create their own "Bar" department alone,
    because they don't depend on seeds;
  - **don't** touch the parity files.
- **S11 (the owner's rename is left alone):** verify manually on a scratch copy
  of the local dev DB:
  1. rename the department to "Bar HQ";
  2. `mix ecto.rollback --step 1`, then `mix ecto.migrate`;
  3. confirm it's still "Bar HQ";
  4. rename it back.

  Record the result in the PR.

---

## PHASE C — Events UI

### C.1 Types + data
**Files:** `src/lib/types.ts`, `pages/schedule/Schedule.tsx`
- `ScheduleEvent` type mirroring the JSON.
- In `Schedule.tsx`, load `useApiQuery<ScheduleEvent[]>(['schedule_events', eventParams], '/api/schedule_events', eventParams)`.
  `eventParams` is the week's `from`/`to` (grid) or the agenda filters, plus
  `department_id`. Apply decision 6.
- Every write invalidates `['schedule_events']`.

### C.2 Event dialog
**File:** `pages/schedule/EventFormDialog.tsx` (new; follow `ShiftFormDialog` and `FormDialog`)
- Fields: department (managed departments only, like shifts), title, notes,
  **All day** switch.
  - All day on: start date and end date pickers (end ≥ start).
  - All day off: start and end datetime inputs.
- Convert with `localInputToUtc` (decision 1). All day: start `T00:00`, end
  `(endDate + 1)T00:00`.
- Edit mode: Save, **Publish/Unpublish**, and **Delete** with a confirm step.
- Errors via `parseApiError` into the `FormDialog` `error` prop.
- `data-testid`s: `event-dialog`, `event-title`, `event-notes`,
  `event-all-day`, `event-save`, `event-publish`, `event-delete`.
- **Read-only mode** (a user who can't manage this department): title, time or
  "All day", department and notes; no inputs.
- **Repeat section** (create; and edit with *this and following*):
  - Does not repeat / Weekly (weekday checkboxes, "every week" or "every other week") / Monthly (1st–4th or last, plus a weekday);
  - Ends: never (12-month cap), on a date, or after N times;
  - a live summary line ("Every Tuesday, 7:00–9:00 PM, until Mar 30, 2027").
- **Repeating event, on Save or Delete:** a small follow-up choice, *This event
  only* / *This and all following* (`data-testid="series-scope-this|following"`).
  The following option's confirm text says it overwrites individually changed dates.
- **Extend:** a button on a repeating event ("Repeats through Sep 28, 2027 —
  Extend"), for managers.
- A "Changed from the series" note when `series_exception` is set.

### C.3 Scheduler grid Events row
**File:** `pages/schedule/WeekGrid.tsx`
- New first row, labeled **Events**, above the employee rows. For each day,
  chips for events overlapping that day. A multi-day event shows in each of its
  days.
- Chip:
  - department-colored outline and an event icon;
  - title, plus the time or "All day";
  - drafts look like draft shifts;
  - a small repeat icon when `series_id` is set;
  - `data-testid="event-chip-<id>"`.
- Clicking a chip opens `EventFormDialog` (edit or read-only).
- Clicking an empty Events cell, for a manager, opens Add event prefilled with
  that day. **No confirm prompt:** the employee-cell prompt exists to prevent
  accidental shifts and isn't needed here.
- Conflict detection (`lib/conflicts.ts`) is **not** given events (S9). Add a
  comment saying that's deliberate.

### C.4 Header actions + Publish week
**File:** `pages/schedule/Schedule.tsx`
- An **Add event** button next to Add shift, for managers only.
- `publishWeek`:
  - also collects draft events in the week that the user can manage;
  - calls `POST /api/schedule_events/publish` with their ids, after the shift
    batch;
  - returns early only if **both** lists are empty;
  - invalidates both query keys.
- Copy last week and Delete week are unchanged (decision 5).

### C.5 Agenda (View Schedule)
**File:** `pages/schedule/Schedule.tsx` (the `groups` memo and the agenda render)
- Group events by every Denver day they cover, alongside shifts. Within a day,
  **events come first**, styled apart (event icon, outlined card in the
  department color, title, time or "All day").
- Tapping one opens the read-only dialog (C.2).
- No claim, edit or delete controls for employees.
- `data-testid="agenda-event-<id>"`.

---

## PHASE D — 3940: dialogs default to the viewed week

**Files:** `src/lib/datetime.ts`, `pages/schedule/Schedule.tsx`, `ShiftFormDialog.tsx`, `EventFormDialog.tsx`
- Add `defaultDayKeyForWeek(mondayKey)` to `datetime.ts`: returns today's
  Denver key if it's within `mondayKey … mondayKey+6`, otherwise `mondayKey`.
- `openCreate`, and the new Add event handler, set
  `prefill = { dateKey: defaultDayKeyForWeek(mondayKey) }` in week view. The
  agenda keeps today.
- `ShiftFormDialog` already uses `prefill?.dateKey ?? today`, so no change there.
- **Regression spec** `tests/regression/scheduler/add_dialog_week.spec.ts`
  (`dualMgr`):
  1. go to next week;
  2. Add shift: the date is in that week;
  3. save a `[TEST-TEMP]` shift;
  4. reload: it's in that week;
  5. same for Add event (S12);
  6. clean up.
- **Revert-and-rerun:** stash the `openCreate` change, rerun (it must fail),
  restore, rerun (it must pass). Record both runs in the PR.

---

## PHASE E — Playwright + local gate + PR

### E.1 Specs
**Directory:** `tests/regression/scheduler/`. Each spec declares its persona with `authFile()`.

| Spec | Scenarios |
|---|---|
| `events_manager.spec.ts` | S1 timed event persists; S2 Publish week publishes events + shifts, persist-verified; S3 all-day two-day event shows "All day" on both days; S9 an overlapping shift has no conflict marker |
| `events_visibility.spec.ts` | S4 `bartender1` sees a published event read-only (+ API PATCH → 403); S5 a draft is hidden (+ API GET → 404); S6 `breweryMgr` can't edit a taproom event, can add a Brewery event; S7 `dualMgr` both departments; S8 `owner` any department |
| `taproom_rename.spec.ts` | S10 nav, channel list and Manage positions say "Taproom"; position names unchanged |
| `add_dialog_week.spec.ts` | S12 (Phase D) |
| `events_recurring.spec.ts` | S13 weekly series of 8 drafts; Publish week publishes one; S14 monthly 3rd Sunday, capped at 12 months, same local time across Nov 1; S15 *this only* vs *this and following* edits; S16 deletes; S17 extend; S18 other personas can't edit and see published occurrences read-only |

- For S2, "no notification": check the API side. Note `bartender1`'s
  `/api/notifications/unread_count` before and after publishing a week that
  contains **only** an event; it must not change.
- All created data is named `[TEST-TEMP] …`, and specs clean up after
  themselves. Waits use real signals; no `waitForTimeout`.
- Update `tests/COVERAGE.md` if it exists; create it if not (workflow §6).

### E.2 Local gate (workflow §3)
- [ ] `mix test` green. The count is 605 plus the new tests, and the parity dir is unchanged.
- [ ] `vite build` green. `tsc` errors ≤ 3 and lint problems ≤ 27, with none in D32 files.
- [ ] `npx playwright test` green locally, including the new specs.
- [ ] Revert-and-rerun recorded for 3940.
- [ ] Every write is persist-verified.
- [ ] S11 manual migration check recorded.

### E.3 PR
- PR `d32-schedule-events` → `d31-rbac-consolidation` (stacked, like #1–#3,
  until §2 is settled). Handoff note:
  - SHA;
  - scenarios S1–S18;
  - **migrations: yes, three** (create `schedule_events`; create `schedule_event_series` + event series columns; rename). All reversible;
  - **new dependency:** `tz`;
  - LIMITATIONS.
- Use `gh api -X PATCH …` to edit the body (`gh pr edit` fails on this repo).
- **LIMITATIONS to list:**
  - the rename migration has only run on local data (DEV is the first real run);
  - all-day events and repeating events across the MST/MDT change (Nov 1, 2026) are covered by unit tests and one Playwright check only;
  - the new `tz` dependency hasn't been through the Docker release build (DEV is its first);
  - series expansion volume: the largest locally tested series is about 104 weekly occurrences (two weekdays × 12 months);
  - the agenda was only tried at the ~761px mobile width locally, if that's the case.

### DEV gate
Same as D31, following the recipe in `stepwise_results/d31_rbac_consolidation_COMPLETE.md` (Notes):
1. Claim DEV in discussion 80.
2. Deploy the SHA from a clean worktree (API, then UI). The migrations run at boot.
3. `seed_synthetic()`.
4. Check `fly releases`.
5. `E2E_TARGET=dev npx playwright test`.
6. Independent pass with S1–S18 and the LIMITATIONS, logging in through storageState files only.
7. Verdict in the PR; release DEV.

Delete the tester's `[TEST-TEMP]` users and brands by hand until 3941 is fixed.

---

## Questions for Matt — answered 2026-09-29

1. Copy last week / Delete week leave events alone: **yes**.
2. Agenda hides events under "Mine", "Open" or a position filter: **yes**.

---

## Verification Checklist

- [ ] Phases A, R, B–E committed in order
- [ ] Parity files unchanged; boundary test green; no `Notifications` call in events code
- [ ] Three migrations (events; series + event columns; rename), all reversible; S11 recorded
- [ ] Recurrence DST tests green (Nov 1 2026, Mar 14 2027)
- [ ] 3940 revert-and-rerun recorded
- [ ] Local gate green (with the tsc/lint counts not increased)
- [ ] PR open with handoff note → DEV gate → verdict in the PR
- [ ] Close-out: `stepwise_results/d32_schedule_events_COMPLETE.md`, CLAUDE.md,
      backlog 3937 + 3940, **raise the deferred Q3/Q7 reminders** (events in
      calendar feeds; company-wide events), tell Rick
