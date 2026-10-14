# D42: Task board follow-ups + required password reset — Spec

**Status:** DRAFT (lead, 2026-10-14), from Matt's decisions of 2026-10-13/14
**Backlog:** PortableMind task 4260 (and 4117)
**Concept:** 10_brewery_tasks
**Amends:** `specs/d38_brewery_task_board_spec.md` and
`specs/d41_department_task_boards_spec.md`
**Ships:** in tonight's prod release with D38, D39, D41 and D40 (Matt,
2026-10-14: D42 and D40 today, release tonight). Keep it tight: nothing
beyond this list.

---

## 1. What changes

| # | Item | Source | Where |
|---|---|---|---|
| 1 | The API refuses everything but the reset flow while a password reset is required | 4117, D41 QA N1 | API |
| 2 | A move's `before_id` from another board → 404 | D41 QA G2 | API |
| 3 | Header key `no_brewers` → `no_one_scheduled` | D41 QA N3 | API + UI |
| 4 | Delete a retired Daily item that was never ticked | D39 QA O4 | API + UI |
| 5 | A notes-only change no longer makes an occurrence "changed on its own" | D39 QA O1 (pass 1) | API |
| 6 | An Ends-only change to a series moves the end, never a rule | D39 recheck 2 O1 | API + UI wording |
| 7 | Add and Restore greyed out at 12 active Daily items | D39 QA O2 | UI |
| 8 | 1 week / 2 weeks, Hide completed, phone view remembered **per board** | D41 QA G1 | UI |
| 9 | First day of the board: **Today**, **Sunday** or **Monday**; past days dimmed | Matt, 2026-10-14 | UI |
| 10 | "After N times" stays a count across a split (R2) | D39 recheck 2 R2 | API + UI (Ends shown) |

No new tables, no migrations, no secrets, no dependencies.

## 2. Behavior

### 2.1 Required password reset (item 1, task 4117)

While the signed-in person has `must_reset_password: true`, **every** API
route answers **403 `{"error": "password_reset_required"}`** except what the
reset flow needs:

- `GET /api/me`, `GET /api/session`, `DELETE /api/session` (sign out);
- `POST /api/session/password` (setting the new password).

Enforced in **one place**: a plug in the authenticated pipelines, after
`AuthPlug` (not per controller), so new routes are covered by default.
Devices never have the flag; device-only routes are unaffected. Both kinds
of people are covered: those created with a temporary password (`POST
/api/users`) and those whose password a manager reset
(`POST /api/users/:id/reset_password`).

**UI:** the "Set a new password" screen already blocks these people. If any
call still gets `password_reset_required` (for example a tab left open while
a manager resets the password), the UI goes to that screen rather than
showing an error.

### 2.2 Foreign `before_id` (item 2)

`POST /api/boards/<dept>/tasks/<id>/move` with a `before_id` that is a task
on another board answers **404** and changes nothing, as every other
cross-board id does. A `before_id` on the same board that is no longer in the
target list keeps D38's rule (the task goes last).

### 2.3 Header key (item 3)

The board header's `no_brewers` becomes `no_one_scheduled` (same meaning:
no people and no open shifts). The UI reads the new key. Nothing else
outside the board uses it.

### 2.4 Delete a retired Daily item (item 4)

In Edit Daily items' **Retired** section, an item that was **never ticked
on any day** gets **Delete** (with a confirm: "Delete <name>? It was never
ticked, so no day's Daily checks change."). An item with any tick has only
Restore, as now.

- `DELETE /api/boards/<dept>/daily_items/<id>`: managers of the board (and
  owners). The item must be retired and have no Daily checks; otherwise
  **422** `{"error": "not_retired"}` or `{"error": "has_ticks"}`. Another
  board's id → 404, as elsewhere.
- The retired list (`GET …/daily_items?include_retired=true`) marks each
  retired item `deletable: true|false`.
- History logs `item_deleted` with the name ("deleted the Daily item
  'Typo'").
- Its retire/restore History rows stay (History is never rewritten).

### 2.5 Notes-only change (item 5)

Today a "Just this one" edit of an occurrence's title, notes or assignee
marks it **changed on its own**, so later "This and all following" edits
skip it and remove-later offers to keep it. New rule:

- A "Just this one" edit that changes **only the notes** doesn't mark it
  changed on its own.
- A later "This and all following" edit that changes the **notes** skips
  any occurrence whose notes differ from the series' notes (its own notes
  stay); title and assignee changes still reach it.
- Title or assignee changes made with "Just this one" still mark it changed
  on its own, as now.

### 2.6 Ends-only change (item 6)

Edit series… (or a "following" edit) where only **Ends** changes (Never /
On a date / After N times):

- moves the end of the **whole chain** (every part of a split series),
  without changing any part's rule; occurrences are added or removed only
  at the end;
- the confirm says what happens: "Extends the series" (no removal), or
  "Removes N later occurrences" only when it really removes some;
- a series that isn't split behaves exactly as now except for that wording.

### 2.7 Daily cap (item 7)

With 12 active Daily items, **Add** and every **Restore** in Edit Daily
items are disabled, with the hint "Up to 12 Daily items. Retire one first."
The API's refusal stays.

### 2.8 Settings per board (item 8)

1 week / 2 weeks, Hide completed, the phone view (all days / one day) and
the new first day (§2.9) are remembered **per board, per browser**: one
value per department key and one for All departments (`all`). The first
time a board is opened after D42, it starts from the browser's current
shared value, so nobody loses their choice. The remembered board
(`rockcut.tasks.board`) is unchanged.

### 2.9 First day (item 9)

A control beside 1 week / 2 weeks: **Today** (default, as now), **Sunday**
or **Monday**.

- **Today:** unchanged: the range starts today.
- **Sunday / Monday:** the range is the calendar week holding today (2
  weeks: that week and the next). Days before today in that week are
  shown **dimmed**, and still work as now (tick, drag, open, add).
- Prev / Next move by the span (7 or 14 days) on that boundary; "Today"
  returns to the week holding today.
- A date range typed into the range picker is shown as typed. A card from
  All departments (`?day=`) moves the range to the week holding that day.
- **Phone:** the vertical all-days view starts at the week's first day and
  scrolls to today; the one-day view still opens on today.
- Every board and All departments; remembered per board, per browser (Matt:
  follows the browser, not the person). UI only, no API change.
- "Today" is Colorado's today, as everywhere on the board.

## 3. "After N times" across a split (item 10, R2; Matt, 2026-10-14)

Today a split converts a count end into the date of the last occurrence
(`Series.count_to_until/2`), so after a split every part shows "On a date"
and a later rule change from before the split keeps that date: weekly Wed
from 10/14 after 10 times, split to Thu at 11/18, then Wed → Fri from 10/28
gives 9, not 10.

New rule: **the chain's Ends is what the person set**, for counts as for
dates (D39 R1):

- a split part keeps a **count** (what's left after the earlier parts'
  dates, as `remaining_count/2` already works out), not a date;
- every part's dialog (`info/1` / `chain_ends`) shows the chain's total,
  "After 10 times";
- a later rule change or Ends-only change (§2.6) from any part keeps the
  total: the example above gives 10/14, 10/21 and 8 Fridays to 12/18;
- deleted occurrences still count, as now (`Recurrence.dates/2`).

No migration. Existing split parts already stored as dates keep working as
dates (DEV is reseeded; prod has no series).

## 4. Scenarios

| # | Persona | Path | Expected |
|---|---|---|---|
| S121 | `newhire` (reset required) | `GET /api/boards/bar/tasks`; `POST /api/beer_board`; `GET /api/me` | 403 `password_reset_required`, 403, 200 |
| S122 | a `[TEST-TEMP]` person after an owner resets their password | any write, then set a new password, then the write | 403, then 200 |
| S123 | `newhire` | sign in in the UI | "Set a new password"; after setting it, the board works |
| S124 | `floater` | move a Brewery task with a Taproom task's id as `before_id` | 404; nothing changes on either board |
| S125 | `bartender1` | Taproom board with no one scheduled | "No one scheduled" (from `no_one_scheduled`) |
| S126 | `barMgr` | add "[TEST-TEMP] Typo", retire it, Delete | Gone from Retired; History "deleted the Daily item"; no day's count changes |
| S127 | `breweryMgr` | a retired item ticked once | No Delete; API DELETE → 422 `has_ticks` |
| S128 | `breweryMgr` | API DELETE on an active item; on a Taproom item | 422 `not_retired`; 403 (not a Taproom manager) |
| S129 | `brewer1` | weekly series; "Just this one" notes on one; then "following" title + notes from earlier | That one gets the new title, keeps its own notes; the rest get both |
| S130 | `brewer1` | "Just this one" title on one; then "following" title | That one keeps its title (as now) |
| S131 | `breweryMgr` | split series (weekly, then monthly from a later date), Edit series… on the earlier part, Ends → Never | The monthly part stays monthly; the confirm doesn't say "Removes"; the chain runs ~12 months |
| S132 | `breweryMgr` | unsplit weekly series ending on a date → After 5 times (fewer) | "Removes N later occurrences"; 5 remain |
| S133 | `breweryMgr` | 12 active Daily items | Add and Restore disabled with the hint |
| S134 | `floater` | Brewery: 2 weeks + Hide completed; switch to Taproom | Taproom keeps its own (default) settings; back on Brewery, 2 weeks + Hide completed |
| S135 | `brewer1` (D41 settings in this browser) | open the board after D42 | Same span / Hide completed / phone view as before |
| S136 | `brewer1` | First day → Monday, on a Wednesday | Mon–Sun of this week; Mon and Tue dimmed and usable; Next → next Mon |
| S137 | `brewer1` | First day → Sunday, 2 weeks | This Sun through next Sat; "Today" returns there |
| S138 | `owner` | All departments, First day → Monday; Brewery stays Today | Each keeps its own; an All card for Tuesday opens Brewery with Tuesday in range |
| S139 | `brewer1` at 412×915 | First day → Monday, vertical view; one-day view | Starts Monday, scrolled to today; one-day opens today |
| S140 | `brewer1` | First day → Monday, then type a date range | The typed range shows as typed |
| S141 | `breweryMgr` | weekly Wed after 10 times; split to Thu at the 6th; then Wed → Fri from the 3rd | Every part shows "After 10 times"; 10 in total (2 Wed + 8 Fri) |
| S142 | `breweryMgr` | the same split, then Ends → After 12 times from the later part | 12 in total; the Thursday rule unchanged |

S117 (the D38/D39 sweep) and S101–S120 stay green.

## 5. Out of scope

4238, 4231, 4232, the D32 events split-gap check (4261), and anything from
D40.
