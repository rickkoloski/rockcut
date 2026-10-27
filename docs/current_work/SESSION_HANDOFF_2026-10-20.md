# Session Handoff — 2026-10-20

Supersedes `SESSION_HANDOFF_2026-10-16b.md` (still accurate for prod, DEV and
the backlog). This session was **design only**: a new feature, production
scheduling (tanks, process templates, batch Gantt), shaped with Matt through
discussion and a clickable mockup. **No app code changed. Nothing deployed.**

## Where things are

| | State |
|---|---|
| **Prod** | Unchanged: `v2026.10.16` (UI v23 / API v27). |
| **DEV** | Free. Runs `develop`. |
| **develop** | `24d89dc` (handoff 2026-10-16b). This handoff is uncommitted. |
| **Local** | Checkout on `develop`, clean apart from this file and the pre-existing untracked `.playwright-mcp/`. |

## The new feature: production scheduling

Matt's idea: a Brewery page that defines the process from brew day to
package as **templates** of steps with timeframes and dependencies; each
**batch** gets its own editable copy; steps can generate **Brewery task list**
tasks (moving a task moves the schedule and vice versa); batches show on a
**Gantt by tank**.

**Everything decided so far is in the working notes — read them first:**
`docs/current_work/reference/production_scheduling_notes.md`

Also in `docs/current_work/reference/` (the folder is excluded from git via
`.git/info/exclude`, so it is **local only** — not committed, not on any other
machine):

- `tank_schedule_mockup.html` — the mockup source (vanilla JS, sample data,
  "today" fixed at Tue Oct 20 2026). Published, private to Matt:
  **https://claude.ai/artifact/SU9STudcjNJZKf13hGQ3z8** (version 25). To change
  it, edit the local file and republish to the same artifact.
- `Basic Gantt Chart - existing.png` — Matt's current Google Sheets Gantt
  (context for the steps only; Matt said not to copy its layout).

### Headline decisions (details in the notes)

- **Tanks:** mostly unitanks; beer sometimes moves to another fermenter or a
  walk-in serving tank used as a brite. Fields: name, type, capacity,
  location, display order, out of service, notes. Only name and out of
  service show on the Gantt.
- **Templates** (library; brand defaults later). Steps anchored "day N after
  brew day" (counted from the end of the first brew day; brew can span two
  days). Each step: optional dependency link, default move behavior, and an
  "add to task list" toggle (default on). Temperature ramps (step crash 5–10°
  a day): **each temperature is its own task**.
- **Move prompt (simplified by Matt):** any date change, late/early check-off
  or drag asks once: **move all following steps** or **move only this step**.
  The template link default just pre-selects the answer.
- **Batches:** editable per batch — add steps (comes after / leads to), remove
  unfinished steps, add/remove transfers, **split** into numbered parts
  (#40 → #40.1 / #40.2, one part may stay in the tank), change template and
  brand while planned. Planned batch numbers are **automatic by brew day**
  (tie on the same day: most recently edited gets the later number —
  *assumption, not confirmed*).
- **CIP & Sanitize** after every emptying; also a **standalone CIP** task (no
  batch) that marks a tank clean and clears dirty-tank flags.
- **Flags** (all six + CIP-while-full), each can be **signed off** with an
  optional note; comes back if dates/tank/volume change; "no tank" flags 3
  days ahead.
- **Gantt:** collapsed tank rows (bars, status line "Day 6 · Primary ferment ·
  68°" / "Empty · dirty 3 days" / "Sani 6 days", current set temperature
  changes only when a temperature task is checked off) and per-tank caret to
  expand into step rows; stacking instead of overlap; drag batches between
  tanks and in time; multi-select; date range back/forward; light/dark.
- **Access:** brewers and owners only (not other departments' managers);
  brewhouse tablet fully usable with a staff code.
- **Order:** Matt wants this **before** the security deliverable, and is OK
  with however Claude splits it into deliverables (proposal in the notes:
  D46 tanks + templates, D47 schedules + Gantt, D48 task-list linkage — to
  revisit now that scope has grown: splits, transfers, standalone CIP).

## Next steps

1. Matt keeps reviewing the mockup; iterate on feedback.
2. Then write the spec (new concept folder, e.g. production scheduling) with
   persona scenarios, and settle the deliverable split. D46 is the next free
   ID. Move the decisions from the notes into the spec (the notes file is
   local only).
3. **Watch the dates:** 3994 (`decimal` advisories, + `bandit` fold-in still
   unconfirmed) is due **Oct 30**; 4058 (pre-D34 token path) **Nov 4**. Matt
   put scheduling first; raise these again when planning — 3994 is small
   enough to fit alongside.

## Still open from earlier

- D44 (time off dialogs in the Scheduler) remains a draft with deferred
  questions.
- Pair the brewhouse tablet on prod; tablet themes in Shared devices.
- OK to delete `~/src/rockcut-d4*-qa/`, `~/src/rockcut-d43-scratch/`, local
  branch `local/theme-preview` (unanswered).
