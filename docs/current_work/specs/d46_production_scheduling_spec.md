# D46–D49: Production Scheduling — Specification

**Status:** Draft, for Matt's review
**Created:** 2026-10-20
**Author:** Matt + CC
**Depends On:**
- D1/D2: `batches` and `brands` (the schedule builds on the existing `batches` table).
- D31: every authorization decision goes through `Authz`.
- D33/D37/D40: shared devices, staff codes and `StaffCodeActing` (the brewhouse tablet).
- D38/D41/D42: the department task boards (generated tasks land on the Brewery board).
- D43: the Hop Field theme and per-person color mode (the Gantt follows it).
- D30: synthetic personas and DEV.

**Process:** `docs/process/three_environment_workflow.md` (spec with persona scenarios → local gate → DEV gate → release)
**Split:** four deliverables, one spec. See "Delivery split" below.
**Concept:** new concept folder `11_production_scheduling` at close-out.
**Backlog:** PortableMind project 254: D46 = task 4629, D47 = 4630, D48 = 4631, D49 = 4632
**Branches:** one per deliverable, each cut from `develop` after the previous one merges: `d46-tanks-templates`, `d47-batch-schedule-gantt`, `d48-batch-changes`, `d49-schedule-task-list`
**Reference:** the clickable mockup, https://claude.ai/artifact/SU9STudcjNJZKf13hGQ3z8 (version 36, private to Matt). Its source and the design notes are in `docs/current_work/reference/` (git-excluded, local only). Everything decided there is restated in this spec; the spec is the source of truth.

---

## Delivery split

The feature is too large for one PR. Each deliverable runs the whole
three-environment workflow on its own branch.

| | **D46: Tanks, lists, templates** | **D47: Batch schedule and Gantt** | **D48: Changing a batch** | **D49: Task list linkage** |
|---|---|---|---|---|
| **What** | Tanks and out-of-service periods (§3.2); phases and step types, brewer-editable (§3.3); process templates and their editor (§3.4); Brewery → Production nav | Planning batches from a template; the Gantt (§3.6); moving steps with the move prompt (§3.7); checking steps off; P-numbers and the brew-day batch number (§3.5); tank status (§3.8); flags and sign-off (§3.9); standalone CIP & Sanitize (§3.10); assignee and notes on steps; the batch dialog without §3.11's actions | Add/remove steps (and Set temp ramps), add/remove transfers and filters, split and undo split, change a planned batch's template and brand, multi-select (§3.11) | Steps on the Brewery task board, two-way (§3.12); the Gantt's task list panel; planned-batch tasks and their toggle; the brewhouse tablet on the schedule (§3.13) |
| **Data** | `tanks`, `tank_outages`, `production_phases`, `production_step_types`, `process_templates`, `template_steps`, `template_links` | `batches` changes; `batch_vessels`, `production_steps`, `production_step_links`, `flag_signoffs` | (columns on D47's tables: `split_parent_id`, `part_number`, `ramp_group`) | `production_steps.task_id`; `tasks.production_step_id` |
| **Scenarios** | P1–P19 | P20–P64, P109, P111–P112 | P65–P89, P110, P113–P117 | P90–P108 |
| **DEV seed** | Tanks FV1–FV7, Serving 1–2; `[SEED]` templates; an outage | `[SEED]` batches in every state; a signed-off flag; assigned steps | A transferred and a split batch | Linked tasks on the Brewery board; `breweryDevice` writes |

- **Order:** D46 → D47 → D48 → D49, each branch cut from `develop` after the previous one merges.
- **Ahead of task 3994** (Matt, 2026-10-20): D46–D49 come before task 3994 (`decimal` advisories, + `bandit` if it folds in), even though 3994 is due 2026-10-30.
- **One prod release after D49** (Matt, 2026-10-20). D46, D47 and D48 each pass their DEV gate, merge to `develop` and wait; the whole feature goes to prod in the first release after D49 merges, so the brewhouse tablet and the task board linkage are there from day one. Each deliverable still gets its own PR and gates.
- **The prod data clean-up** (§3.14) runs with that release.

## 1. Problem Statement

The brewers plan fermentation in a Google Sheet Gantt: one row per tank,
coloured cells per day, steps typed into cells ("FDH", "Crash 48", "Keg").
The sheet is the official record, but it doesn't know a step depends on
another, so a late dry hop means re-typing the rest of the row by hand. It
can't warn that two batches overlap in a tank, that a tank is dirty or out of
service, or that a batch has no tank three days before brew day. The cellar
tasks are copied by hand onto the Brewery task board.

Production scheduling moves this into Rockcut:

- **Templates** describe a process once: steps with day offsets from brew
  day, which phase each starts, and which steps depend on which.
- Each **batch** gets its own editable copy and its tank(s). Moving a step
  asks once whether the steps after it move too.
- A **Gantt by tank** shows every batch with its phases, steps, who's
  assigned, and flags for conflicts.
- Steps marked for the task list **become Brewery board tasks**, and moving
  or checking one off in either place updates the other.

## 2. Decisions (Matt, 2026-10-20)

**Tanks**
- Mostly unitanks. Beer sometimes moves to another fermenter, or to a walk-in serving tank used as a brite. A transfer or filter can target either.
- Fields: name, type (unitank / fermenter / serving tank), capacity (bbl), location (brewhouse / walk-in), display order, notes, and **out-of-service periods**. The Gantt shows only the name (in display order) and out-of-service periods.
- **Out-of-service periods:** first day out, last day out **or "until further notice"**, optional reason. A tank can have several; they can't overlap; past ones stay as history. They end on their own. Anything planned in the tank during a period is flagged. No task is created.

**Phases** (Matt's list): Brew day → Lag → Fermentation → Diacetyl rest → Crash (stepped or a single drop) → optionally Lagering → optionally a second Crash → Conditioning (normally before any transfer) → Carbonating (in the first tank or after a transfer) → optionally Conditioning again → Packaging.
- Phases aren't a fixed sequence. A template puts them in order and a phase can appear more than once.
- A transfer or filter does **not** start a phase.
- Phases with no natural task (Lag, Fermentation, Lagering, Conditioning) start from a **phase marker**: a template entry on a day, not a task unless someone turns that on. A marker takes effect on its day once the steps before it are done.

**Step types** (Matt's list): Brew day, PDH (Primary Dry Hop), FDH (Final Dry Hop), Dry hop, Amylo (AMG), Set temp, Diacetyl test, Plug dump, Yeast harvest, Rouse, Addition, Fining, Gravity check, Carb, Transfer, **Filter** (behaves exactly like Transfer), Split (**Split - Transfer** or **Split - Filter**: how the parts that leave get out; Matt, 2026-10-21), CIP & Sanitize, Package (**Full** or **Partial**: "Package - Partial" packages some and leaves the rest in the tank; Matt, 2026-10-21). Plus a free-text custom step. "Hold" is not used. "Keg / Package" is "Package".
- **Names:** a step always keeps its type name; a brewer can **add to it** ("Dry hop - #2"). Set temp shows its temperature ("Set temp - 52°"). The addition is edited in the template, the step dialog (from the Gantt or the task list) and the batch dialog's step list.
- Brewers can **add phases and step types** later, and rename, recolor, reorder and retire them (§3.3).

**Templates**
- A library of templates; **none at launch** (Matt builds his own). Assigning templates to brands comes later.
- Steps are "day N after brew day", counted from the **end of the first brew day** (a brew can take two days to fill one tank).
- Each step: optional dependency links, a default move answer per link, and "add to task list" (default **on**). Each temperature in a ramp is its own step. Template steps can carry **notes** that copy into every batch.
- A template says *that* beer moves (Transfer/Filter), never *which* tank.

**Batches**
- Planned from the Gantt (brand + template + brew day + tanks + volume) or with **Plan batch**. Each gets its own copy of the template's steps. Tanks may stay **unassigned**.
- **Planned (not yet brewed) batches are P1, P2, P3…** in brew-day order and renumber as plans change; on the same brew day, the batch planned first keeps the lower number.
- **Checking off brew day asks for the batch number.** The suggestion is one more than the highest plain-number brewed batch; any text is accepted ("44B"); a non-numeric number gets a note but is allowed; duplicates are refused ignoring case. Un-checking brew day makes the batch planned again and frees its number. Split parts add .1/.2.
- A planned batch's brand and template can change; a brewed batch's number can be edited (still unique).
- Batch-level changes (D48): add steps, remove unfinished steps, add/remove transfers and filters, split into numbered parts.

**Moving**
- Any date change, drag, or a check-off on a different day than planned asks **one** question: **move all following steps** by the same amount, or **move only this step**. The link's template default pre-selects the answer. Finished steps never move. Anything pushed out of order is flagged.
- Moving a whole batch shifts all its unfinished steps with no prompt (a planned batch moves entirely). Dragging a batch to another tank (or Unassigned) changes only that part's tank.

**Flags:** tank overlap, batch bigger than tank, filling a dirty tank, dirty with no CIP planned, steps out of order, no tank assigned within 3 days of the fill/transfer, tank out of service, CIP while beer is in the tank. A brewer can **sign off** a flag (who, when, optional note); it shows muted and **comes back** if the dates, tank or volume involved change.

**CIP & Sanitize** after every emptying (usually the same day, movable). Also a **standalone CIP** (no batch) that marks the tank clean and clears dirty-tank flags. No sanitation shelf life.

**Gantt:** collapsed tank rows (one bar per batch part, phase colors, step dots, initials, flag badge) with a per-tank caret to expand into step rows; stacking instead of overlap; a status line per tank ("Day 6 · Fermentation · 68°", "Empty · dirty 3 days", "Sani 6 days"); the current set temperature changes only when a Set temp step is checked off; a collapsible left column (names only); date range back/forward; zoom.

**Task list:** steps marked for the task list are Brewery board tasks, **unassigned** at creation, worded "FV3 · Galactic #33 · Set temp - 48°". Tasks from planned batches show marked "Planned batch", with a per-person toggle to hide them. **Notes and assignee** are one field shared by the step and its task. Assigning works from the Gantt too, and the Gantt shows the assignee's **initials above the step's dot**.

**Access:** **Brewers and owners** only (not other departments' managers). The **brewhouse tablet** works the schedule fully with a staff code; the setup pages (tanks, templates, lists) are read-only there.

**Data:** nobody uses the app's Batches page; the Google Sheet is the record. Existing batches are removed at the first release (§3.14). Matt enters the batches already in tanks himself.

## 3. Requirements

### 3.1 Where it lives

- Nav: **Brewery → Production** (`/brewery/production`), the Gantt. Settings pages under it: **Tanks** (`/brewery/production/tanks`), **Templates** (`/brewery/production/templates`), **Phases & steps** (`/brewery/production/lists`). Reached from a "Set up" menu on the Gantt toolbar.
- The old **Batches** nav entry is removed in D47; the page itself is deleted later (Matt, 2026-10-20). Its routes stay until then. The Brewery Dashboard is unchanged.
- The page follows the user's color mode (D43). The mockup's own Light/Dark switch is not built.

### 3.2 Tanks and out-of-service periods (D46)

**`tanks`** (new)

| Column | Type | Notes |
|---|---|---|
| `name` | string, required, unique (case-insensitive) | "FV1", "Serving 2" |
| `kind` | string | `unitank` / `fermenter` / `serving` |
| `capacity_bbl` | decimal, required, > 0 | feeds "Batch bigger than tank" |
| `location` | string | `brewhouse` / `walk_in` |
| `position` | integer | display order |
| `notes` | text | |
| `retired_at` | utc_datetime | retired tanks leave the Gantt and the pickers; history keeps them |

**`tank_outages`** (new): `tank_id`, `starts_on` (date, required), `ends_on` (date, null = until further notice), `reason` (string ≤ 80), `created_by_id`, timestamps.
- `ends_on` ≥ `starts_on`. Periods on one tank can't overlap (422 `outage_overlap`, naming the other period).
- **Back in service today**: sets `ends_on` to yesterday; a period that starts today is deleted instead.

**Tanks page:** a list in display order (drag or arrows to reorder) with name, type, capacity, location, and the current or next out-of-service period. Add / edit dialog with every field. Retire (with "Retire FV7? It leaves the schedule. Batches that used it keep its name."); a retired list with Restore. A tank with an unfinished step planned in it can't be retired (422, listing the batches).

**From the Gantt:**
- Each tank's name has a **⋯** button: a panel with type, capacity, the out-of-service periods (Now / Coming up / Past, each with Change) and **Mark out of service…**.
- Tapping an empty spot in a tank's row offers **Mark out of service**, starting that day.
- The **hatched red band** and the red **"Out Oct 27–Nov 2"** tag (current or next period; "+1" when more) open the period: edit dates/reason, **Back in service today** (only while it's current), **Delete**.
- The dialog previews what will be flagged ("Will be flagged: Altruism P1 · Thu Oct 22 – Fri Nov 13").
- An open-ended band runs to the end of the view with no right edge. While a tank is out, its status line is "Out of service · \<reason\>" (or "… through Oct 30").

### 3.3 Phases and step types (D46)

**`production_phases`** (new): `name` (unique, case-insensitive), `color` (a token from a fixed palette of 12, each defined for light and dark), `position`, `retired_at`.
Seeded (a migration, on every environment): Brew day, Lag, Fermentation, Diacetyl rest, Crash, Lagering, Conditioning, Carbonating, Packaging, with the mockup's colors.

**`production_step_types`** (new)

| Column | Notes |
|---|---|
| `name` | unique (case-insensitive), ≤ 30: the fixed part of a step's name |
| `full_name` | optional ("Primary Dry Hop"), shown as a subtitle |
| `behavior` | `plain`, `brew`, `set_temp`, `transfer`, `split`, `cip`, `package` |
| `starts_phase_id` | optional default phase this step starts (Carb → Carbonating, Package → Packaging) |
| `on_task_list` | default for new template steps (true) |
| `position`, `retired_at`, `built_in` | |

Seeded: Brew day (`brew`), PDH, FDH, Dry hop, Amylo, Set temp (`set_temp`), Diacetyl test, Plug dump, Yeast harvest, Rouse, Addition, Fining, Gravity check, Carb (`plain`, starts Carbonating), Transfer and Filter (`transfer`), Split (`split`), CIP & Sanitize (`cip`), Package (`package`, starts Packaging).
- **Built-in** types (the seven with a behavior other than `plain`) can be renamed but not retired; the app relies on them.
- Brewer-added types are always `plain`: they can start a phase and go on the task list, but don't move beer or change tank status.

**Phases & steps page:** two lists with Add, rename, reorder, recolor (phases), retire/restore. Retiring hides it from pickers; existing templates and batches keep it.

### 3.4 Process templates (D46)

**`process_templates`**: `name` (unique), `notes`, `position`, `retired_at`.

**`template_steps`**:

| Column | Notes |
|---|---|
| `template_id` | |
| `step_type_id` | null for a **phase marker** |
| `phase_id` | the phase this entry starts (required for a marker; optional for a step, defaulting to the type's `starts_phase_id`) |
| `day_offset` | integer ≥ 0: days after the end of the first brew day |
| `vessel_index` | 0 = first tank, 1 = after the first Transfer/Filter, … |
| `detail` | the added part of the name, ≤ 40 |
| `temperature` | integer °F 28–80, Set temp only (required there) |
| `split_method` | `transfer` / `filter`, Split only (required there, default `transfer`); the name shows "Split - Transfer" / "Split - Filter" before any addition ("Split - Filter - #2") (D47, Matt 2026-10-21) |
| `package_partial` | boolean, Package only (default false). A partial Package shows "Package - Partial" before any addition ("Package - Partial - kegs"); it isn't the tank's exit (D47, Matt 2026-10-21) |
| `notes` | text ≤ 2000 |
| `on_task_list` | default from the type; markers default off |
| `position` | ordering within a day |

**`template_links`**: `from_step_id`, `to_step_id`, `default_answer` (`move_all` / `move_only`). No cycles (422 `link_cycle`). The "to" step's offset must be ≥ the "from" step's.

**Rules**
- Exactly one Brew day at offset 0. A Transfer/Filter starts each `vessel_index` > 0, and the vessel it leaves gets a CIP & Sanitize the same day (added automatically, removable).
- Every vessel's last step is a Package, Split, or the next Transfer/Filter (422 `vessel_has_no_exit` otherwise). A **partial** Package doesn't count: a tank can have several, and still needs a full Package, Split or Transfer/Filter after them.

**Template editor** (a page per template):
- A list of entries in day order: day, name (type + addition, or the temperature), phase started, tank (First tank / After transfer 1 …), task-list switch, notes icon, links ("after FDH · moves with it"), Remove.
- **Add step:** type, addition, temperature (Set temp), Transfer / Filter (Split), Full / Partial (Package), day, tank, "comes after" / "leads to" (slots it into a chain when both are set), default answer for each link, task list, notes.
- **Add phase start:** phase, day, tank, comes after.
- **Add a ramp:** start temperature, target, change per day (5–10° typical), first day, comes after → one Set temp step per temperature, chained with "move all" links (`ramp_group` shared). The last step links to whatever the ramp's "leads to" names.
- **Preview:** a small one-batch Gantt of the template from a sample brew day, using phase colors.
- Duplicate, rename, retire/restore. Editing a template never changes existing batches.

### 3.5 Batches (D47)

**`batches`** (changed)
- `batch_number` becomes **nullable** (null while planned). The unique index on `batch_number` is replaced by a unique index on `lower(batch_number)`.
- New: `volume_bbl` (decimal, required for scheduled batches), `template_id`, `brew_two_days` (boolean).
- `status` is set by the schedule: `planned` until brew day is done, `fermenting` after, `completed` when Package is done; `dumped` stays a manual value (out of scope here). The old fields (`ferm_start_date` …) are left alone.

**`batch_vessels`** (new): `batch_id`, `vessel_index`, `tank_id` (nullable = Unassigned). One row per tank the batch occupies.

**`production_steps`** (new)

| Column | Notes |
|---|---|
| `batch_id` | null for a standalone CIP (§3.10) |
| `tank_id` | standalone CIP only |
| `step_type_id` | null for a phase marker |
| `name` | only for a custom ("Something else") step. A typed step's fixed name always comes from its type, so **renaming a type renames it on every batch, past ones included** (Matt, 2026-10-20), and D49 retitles the linked board tasks in the same transaction |
| `phase_id`, `vessel_index`, `detail`, `temperature`, `split_method`, `package_partial`, `notes`, `on_task_list`, `position` | as in templates |
| `due_on` | date |
| `done_on`, `done_by_id`, `completed_at` | null until checked off |
| `assignee_id` | Brewery member, nullable |
| `added` | true when not from the template |
| `template_step_id` | |

**`production_step_links`**: `from_step_id`, `to_step_id`, `default_answer`.

**Planning a batch** (**Plan batch**, or tap an empty spot in a row → Plan a batch):
- Brand (active brands), template, brew day, volume (bbl), "Brew over two days", the first tank (preselected from the row tapped), and a "Transfer to" tank per later vessel. All tanks may be Unassigned.
- Steps are copied with `due_on` = brew day + offset. A two-day brew adds "Brew day - 2 of 2" the next day; the first is "Brew day - 1 of 2".
- It gets its P-number (below).

**P-numbers:** computed, never stored. Planned top-level batches sorted by first brew day, then by `id`; numbered P1, P2, …. Shown everywhere a batch number shows: "Galactic P2". When numbers change because of a move, the confirmation lists them ("Batch numbers updated: Enos P2 → P1").

**Brew-day number prompt:** checking off the first Brew day of a planned batch (from anywhere: the Gantt, the step dialog, the batch dialog, the task board, the tablet) first asks "Brew day for Altruism P1 — Batch number [44]".
- Suggestion: one more than the highest **plain-number** brewed batch. Any text ≤ 20 characters is accepted; a non-numeric one shows "Not a plain number; the next suggestion still counts from #43."
- A duplicate (ignoring case) is refused: "#40 is already Galactic #40."
- Cancel leaves it planned. Then the usual off-plan move prompt follows if brew day was early or late.
- The API refuses to complete a planned batch's brew day without `batch_number` (422 `batch_number_required`).
- Un-checking brew day: the batch is planned again, its number is cleared, and the message says so.

**Batch dialog** (click a bar):
- Header: "Galactic #40", template · volume · brew day · "planned".
- Planned: template (D48), brand (D48), "P2 · the real number is set when brew day is checked off". Brewed: editable batch number (same rules).
- A tank picker per vessel ("Ferment in", "Transfer to"), listing capacity and any out-of-service period.
- Volume.
- The batch's flags with sign-off (§3.9).
- **Steps:** every step in date order with an editable date (runs the move prompt), "day N", the fixed name with an inline "add to name" box and, for Set temp, a temperature box, a **+ Note / Note ✎** button (opens the step and returns here), "✓ done" or "late", and Remove (D48).
- **Delete planned batch** (planned only; confirm). D48 adds Split, Undo split, Add transfer / filter, Add step.

**Step dialog** (click a step):
- Name and subtitle, batch · tank · template; date and "day N"; status (Planned / Due today / Late (planned …) / Done …); set temperature; "After this" (each link with "Moves with it by default" / "Stays by default"); "Before this".
- Edit: temperature (Set temp), Full / Partial (an unfinished Package), "Add to the name (“FDH” stays)", **Assigned to** (Brewery members), **Notes**, "Show on the Brewery task list".
- Open steps: **Done on** (default today) + **Check off**; **Or move to** + **Move**; Remove step (D48). Done steps: **Mark not done**.
- Typed notes are kept when the dialog closes or a button is pressed.

### 3.6 The Gantt (D47)

**Toolbar:** zoom (2 / 6 / 12 weeks), Today, ‹ 4 wks · From – To · 4 wks › (any range 7–730 days, remembered per person), Expand all / Collapse all, flag chip ("6 flags · 1 signed off", opens the Flags list), Task list (D49), Add CIP & Sanitize, Plan batch, Set up ▾ (Tanks, Templates, Phases & steps).

**Grid:** a sticky tank column and a sticky date header (months, day numbers, weekday initials when wide enough). Weekends shaded, a today line, day gridlines.

**Rows:** one per active tank in display order, then **Unassigned** (amber header: "2 parts with no tank" / "Drag a batch here to unassign it").

**Tank header:** caret, name, the current batch ("FV4 · Crusher #42"), the "Out …" tag, ⋯ menu, and the status line (§3.8).
- The **«** button above the tank names collapses the column to names only (status on hover); **»** restores it. Remembered per person.

**Collapsed tank row:**
- One bar per batch part in the tank, from its first step to its CIP, colored by phase over time; the CIP day hatched.
- Label "Galactic #40 · 20 bbl" ("· after transfer" for a later vessel; "‹" when it starts before the view).
- **Planned** batches are ghosted (faded, dashed outline).
- A dot under the bar for each step on the task list and each CIP: hollow = planned, filled = done, red = late, ringed = today. Steps on the same day sit side by side.
- The assignee's **initials above the dot** (hidden below 14 px per day).
- A flag badge at the bar's end: red "!" / "!3" for open flags, a muted ✓ when all are signed off.
- Overlapping parts in one row **stack** on separate tracks; the row grows. Nothing draws on top of anything else.
- Standalone CIPs show as hatched day blocks.
- A dashed green arrow joins a transfer's two parts; a dashed gold arrow joins a split's parent and parts.

**Expanded tank (caret):** under the row, one row per step (every step, including markers and steps not on the task list), labelled with the step name (and the batch when it isn't obvious; when several batches share a track, a "Label by" picker on the first row). Each step is a diamond with its name, " · late", and the assignee's initials. Dependency links are drawn: solid = "move all" default, dashed = "move only". Expanded state is remembered per person.

**Interactions:**

| Gesture | Result |
|---|---|
| Click / tap a dot or diamond | Step dialog |
| Drag a dot or diamond sideways | Move by whole days → move prompt (§3.7) |
| Click / tap a bar | Batch dialog |
| Drag a bar sideways | Moves the batch in time: all unfinished steps (a planned batch: all steps). No prompt. |
| Drag a bar up/down | That part to another tank or Unassigned (drop row highlighted) |
| Ctrl/Cmd-click steps; Shift-click for a range in one tank | Selection; the selection bar says "3 steps selected", **Assign to …**, **Done selecting**; dragging any selected step moves them together, and the prompt runs from the first unselected step that depends on a moved one (D48) |
| Long-press a step (touch) | Starts selection mode; taps add/remove; drag moves (D48) |
| Shift-drag a step (mouse) | Moves only that step (and any selected ones): no prompt, the same as answering "Move only". The message says so and offers Undo (D48; from Bryntum's "pin successors during drag", Matt 2026-10-21) |
| Tap an empty spot in a row | "FV3 · Thu Oct 22": Plan a batch / Add CIP & Sanitize / Mark out of service |
| Flag badge | Batch dialog scrolled to its flags |
| Keyboard | Every dot, diamond, bar and band is focusable; Enter opens it. Moves by keyboard go through the dialogs' date fields. |

Touch: a normal swipe scrolls the grid; a drag needs a long-press (450 ms) on touch, as on the task board.

**Undo:** every change shows a message with **Undo** for 6 seconds (restores the state before the change, server-side, as one request).

**Legend** under the grid: the phases with their colors, CIP, planned, link styles, transfer and split arrows, out of service.

### 3.7 Moving and checking off (D47)

**The move prompt** (one question per change):
- "FDH moved 2 days later" / "Brew day done 2 days early" / "3 steps moved 1 day earlier", then "Galactic #40 · now Fri Oct 23".
- **Move all following steps 2 days later** — lists them with their new dates.
- **Move only FDH** — "The 4 following steps keep their dates." plus, if it applies, "Some of them would then come before the step they follow. They'll be flagged."
- Default: "only" when every link out of the first moved step is `move_only`, otherwise "all". **Default** pill on it.
- **Undo** puts everything back; **Apply**. No prompt when nothing follows.
- "Following" = every unfinished step reachable through links from the moved step(s). Finished steps never move.

**Checking off:**
- On the planned day: done, no prompt (except the brew-day number).
- On another day: the step moves to the day it was done, then the move prompt.
- A **Set temp** step, when done, sets the tank's set temperature (§3.8).
- A **Transfer/Filter** done: the beer is in the new tank from that day; the old tank is emptied (dirty) unless its CIP is done.
- **Package** done: the batch is `completed`; the tank is emptied. A **partial** Package done changes nothing about the tank or the batch: the beer stays, there's no CIP, the status line goes on.

**API rule:** the server recomputes "following" and applies the answer in one transaction; the client's preview is only a preview.

### 3.8 Tank status (D47)

The status line, computed server-side for "today" (Colorado):

| State | Line |
|---|---|
| Out of service now | "Out of service · Gasket" / "… through Oct 30" |
| Beer in it (a part whose first step is done and whose exit isn't) | "Day 6 · Fermentation · 68°", day counted from the end of the first brew day; phase = the latest started phase; temperature = the last **checked-off** Set temp (or the brew day's starting temperature). A Set temp due today and not done: "· set to 48° today"; one overdue: "· 48° change late" (red). |
| Emptied, cleaned since | "Sani 6 days" |
| Emptied, not cleaned | "Empty · dirty 3 days", plus "· no CIP planned" (red) when no CIP is planned |
| Never used | "Empty · clean" |

The tank header also shows the current batch ("FV4 · Crusher #42").

**Marking a tank clean or dirty (D48; Matt, 2026-10-21).** The tank's ⋯ menu, next to "Mark out of service…", offers **Mark clean…** when the tank is empty and dirty, and **Mark dirty…** when it's empty and clean. Neither is offered while a part is in the tank, whose state comes from the batch.
- **Dialog:** Date (default today; earlier days allowed, never in the future or before the tank's last exit) and an optional Note (≤ 500).
- **`tank_condition_marks`** (new): `tank_id`, `state` (`clean` / `dirty`), `marked_on`, `user_id`, `note`. **Not a step and not a task:** nothing reaches the Brewery board in D49, and no CIP block is drawn.
- **Effect:** the tank's empty-state is the **latest** of its done exits (dirty), done CIPs (clean) and marks, by date, with ties going to the later-recorded one. Mark clean → "Sani N days", and it clears "Filling a dirty tank" and "Dirty, no CIP planned" for what follows. Mark dirty → "Empty · dirty N days", "· no CIP planned" (red) until a CIP is planned, and a later fill raises "Filling a dirty tank".
- **On the Gantt:** a small marker on that day in the tank's row; its tooltip shows "Marked clean by Jake Brewer · Wed Oct 21 · “note”". The ⋯ panel lists the marks under History, each with **Remove**. Every change offers **Undo** (§3.6).
- **API:** `POST /tanks/:id/condition` (`state`, `marked_on`, `note`) and `DELETE /condition_marks/:id`; 422 `tank_in_use` while a part is in the tank, `date_invalid` for a future date or one before the last exit.

### 3.9 Flags and sign-off (D47)

Computed server-side by one function, returned with the schedule.

| Flag | When |
|---|---|
| Tank overlap | two parts in one tank overlap (from first step to CIP) |
| Batch bigger than tank | volume > capacity, for a part that isn't finished |
| Filling a dirty tank | a planned fill/transfer into a tank whose previous batch's CIP is after it, or missing, and no standalone CIP in between |
| Dirty, no CIP planned | a tank was emptied and has no CIP after it |
| Steps out of order | a step is dated before a step it follows |
| No tank assigned | a part with no tank, ≤ 3 days before it fills |
| Tank out of service | a part or a standalone CIP falls in an out-of-service period (flagged only; nothing is moved or offered — Matt, 2026-10-20) |
| CIP while beer is in the tank | a standalone CIP dated while a batch is in the tank |

- Each flag has a stable key (kind + ids) and a **signature** (the dates, tank and volume involved).
- **`flag_signoffs`**: `flag_key`, `signature`, `user_id`, `note` (≤ 500), `signed_at`. A flag is signed off when a sign-off exists with the current signature. When the signature changes, it's open again and shows "Was signed off by Matt, but something changed since."
- **Flags list** (the toolbar chip): open flags first, each with its text, a note box and **Mark OK**; signed-off flags muted with "Signed off by Matt · Mon Oct 19 · “Tank decided on brew morning.”" and **Remove sign-off**.

### 3.10 Standalone CIP & Sanitize (D47)

- **Add CIP & Sanitize** (toolbar, or tap an empty spot): tank, date, "Already done (records it instead of adding a task)".
- Opening one: date, status, assignee, notes, Done on + Check off, Or move to + Move, Delete; done ones: Mark not done, Delete.
- Drag it sideways to move it (no prompt).
- When done: the tank is "Sani N days", and it clears "Filling a dirty tank" and "Dirty, no CIP planned" for what follows.

### 3.11 Changing a batch (D48)

- **Add step:** type (or "Something else" with a free name), addition, temperature (Set temp), date, tank (when the batch has several), "comes after" / "leads to" (both = slot it in between, replacing the direct link), task list (default on), assignee, notes. Marked **Added**. Never changes the template.
- **Add a ramp** (Set temp): as in templates (§3.4).
- **Edit a ramp:** on a ramp step, "Change ramp…": new target and/or change per day → the unfinished steps of that ramp are regenerated; finished ones stay.
- **Remove step:** unfinished, not Brew day or a split part's fill. Links pass through to the steps after it.
- **Add transfer / filter:** Transfer or Filter, date, destination tank (or Unassigned). Unfinished steps from that date move to the new vessel; the tank left behind gets a CIP & Sanitize that day. Refused if a step after the date is done. A batch can have several.
- **Remove transfer / filter** (unfinished): the beer stays in the earlier tank; the CIP it set up is removed.
- **Split:** date, **Transfer or Filter** (one choice for the whole split, default Transfer; Matt, 2026-10-21: it applies to every part that leaves; it behaves the same either way and names the step "Split - Transfer" / "Split - Filter"), two or more parts (add/remove), each with a tank (one may stay in the current tank, marked "(stays here)") and a volume.
  - Volumes must add up to the batch's. Two parts can't share a tank.
  - The parent keeps its history up to the split. Each part is its own batch (`split_parent_id`, `part_number`) with its own copy of the remaining steps; numbered #40.1, #40.2 (P2.1 while planned), following the parent's number.
  - If no part stays, the tank left behind gets a CIP that day. Checking off the split fills each part.
  - **Undo split** merges back (beer stays in the parent's tank, part 1's schedule kept) unless a part has finished steps.
  - Splitting a part again and blending are out of scope.
- **Change template** (planned, not split): rebuilds the steps from the new template, keeping brew day, two-day brew, tanks and added steps (added transfers aren't kept). Switching to a template with a transfer adds an Unassigned later vessel; switching away drops it.
- **Change brand** (planned): parts follow.
- **Multi-select:** §3.6.

### 3.12 Task list linkage (D49)

- **One task per step** with `on_task_list` (including phase markers turned on, and standalone CIPs), on the **Brewery** board. `production_steps.task_id` and `tasks.production_step_id` link them.
- **The step is the source**, and the task row is kept in sync **in the same transaction** for every change from either side:
  - **Title:** "FV3 · Galactic #33 · Set temp - 48°" ("FV6 · CIP & Sanitize" for a standalone CIP; "No tank · …" when unassigned). Recomputed when the tank, batch number, P-number, name or temperature changes. **Not editable on the board**; the board's Edit shows "This task comes from the production schedule" with **Open in schedule**.
  - **Due date:** moving the task on the board (drag or Change day) moves the step **and runs the move prompt** on the board. Reordering within a day is board-only.
  - **Done:** checking it off on the board checks off the step (brew-day number prompt and off-plan move prompt included). The board's "where should it show" dialog is skipped: a linked task shows on the day it was done. Un-checking un-checks the step.
  - **Notes and assignee:** one value; editing either side updates both. New tasks are unassigned unless the step already has an assignee.
  - **Delete on the board:** "Take this off the task list? It stays on the production schedule." → `on_task_list` off; the step is kept (Matt, 2026-10-20).
- Turning "Show on the Brewery task list" off deletes the task; on creates it.
- **Planned batches:** their tasks show with a **Planned batch** pill. A per-person toggle on the Brewery board, "Show planned batches", hides them (remembered on the server with the other board settings).
- **Recurring tasks** don't apply to linked tasks.
- **Task list panel** on the Gantt (toolbar **Task list**): today through the next 6 days of linked tasks, grouped Late / Today / each day. Each has a checkbox, the title, notes (two lines), "Move to [date]", an assignee picker, and **Open** (the step dialog). Same rules as the board.

### 3.13 Who can do what (`Authz`) and the brewhouse tablet

| Action | Who |
|---|---|
| View the Gantt, tanks, templates, lists | Brewery members (any role), owners, the brewhouse tablet |
| Everything on the schedule: plan, move, check off, assign, notes, flags, CIPs, out-of-service periods, batch changes | Brewery members and owners; the brewhouse tablet with a staff code |
| Tanks, templates, phases & step types (add/edit/retire) | Brewery members and owners (Matt: all brewers). **Not the tablet** (Matt, 2026-10-20: the tablet works the schedule only; it sees the setup pages read-only). |

- New areas in `Authz.can?/3`: `{:production, :read}`, `{:production, :write}`, `{:production, :setup}`. Nothing checks owner or role directly (D31's boundary test).
- Other departments' managers and members: no nav entry, 403 from the API, a typed URL goes Home.
- **The tablet:** `Authz.Device` gains read and write on production for a device whose home department is the Brewery. Writes need a staff code and are decided for that person (`StaffCodeActing`, D40); the 5-minute "Acting as" window is shared with the board. The Taproom tablet gets 403. The production routes join a `device_allowed` scope.

### 3.14 Prod data clean-up (the release after D49)

- Before the release: a read-only count on prod (`batches`, `brew_turns`, `batch_log_entries`) reported to Matt. Agents never run prod writes without Matt's go.
- With Matt's go: a one-off release task deletes all existing batches with their brew turns and log entries. Logged in the release record.
- Prod gets the seeded phases and step types (migration); no tanks and no templates.

### 3.15 API (sketch; final shapes in planning)

All under `/api/production`, JSON, flat params (CLAUDE.md).
- `GET /schedule?from&to` → tanks (with outages), phases, step types, batches in range (vessels, steps, links, P-numbers), standalone CIPs, tank statuses, flags (with sign-off state), today.
- Tanks: `GET/POST /tanks`, `PATCH/DELETE /tanks/:id` (delete = retire), `POST /tanks/:id/restore`, `POST /tanks/reorder`; outages: `POST /tanks/:id/outages`, `PATCH/DELETE /outages/:id`, `POST /outages/:id/end_today`.
- Lists: `/phases`, `/step_types` (CRUD + reorder + retire/restore).
- Templates: `/templates` CRUD, `/templates/:id/duplicate`, `/templates/:id/steps` CRUD, `/templates/:id/links` CRUD, `/templates/:id/ramp`.
- Batches: `POST /batches` (plan), `PATCH /batches/:id` (brand, volume, batch_number, template), `DELETE /batches/:id` (planned only), `POST /batches/:id/shift` (`days`, unfinished steps), `PATCH /batches/:id/vessels/:index` (`tank_id`).
- Steps: `POST /steps/move` (`ids[]`, `days`, `answer`), `POST /steps/:id/complete` (`done_on`, `batch_number` when needed, `answer` when off-plan), `POST /steps/:id/uncomplete`, `PATCH /steps/:id` (detail, temperature, notes, assignee_id, on_task_list), `POST /steps/assign` (`ids[]`, `assignee_id`).
- D48: `POST /batches/:id/steps`, `DELETE /steps/:id`, `POST /batches/:id/transfers`, `POST /batches/:id/split`, `DELETE /batches/:id/split`, `POST /steps/:id/ramp`.
- CIPs: `POST /cips`, `PATCH/DELETE /cips/:id`, complete/uncomplete.
- Flags: `POST /flags/signoff` (`key`, `signature`, `note`), `DELETE /flags/signoff/:key`.
- `POST /undo/:token`: every write returns an undo token valid for 2 minutes, restoring the rows it changed if nothing else has changed them since (409 `undo_stale` otherwise).
- Errors: 422 with a code and a message (`batch_number_required`, `batch_number_taken`, `outage_overlap`, `volumes_must_add_up`, `step_done`, …); 403; 404.

### Non-functional
- **Performance:** a 12-week view with ~10 tanks and ~30 batches loads in one request under 300 ms on DEV; moves round-trip under 500 ms.
- **Freshness:** refetch on window focus and every 60 seconds (as the board); last write wins.
- **Time zone:** "today" and every date are Colorado dates (`Tasks.today/0`).
- **SQLite:** every multi-row change in one transaction.
- **Tablet:** usable on the Samsung landscape tablet (Chrome PWA); touch targets ≥ 32 px; long-press to drag.
- **Phone:** viewable and every dialog works; drag needs long-press; the left column defaults to names only below 560 px.

## 4. Persona scenarios

Personas from `tests/config/test-env.ts`. "Today" in DEV seed terms; `[SEED]` tanks FV1–FV7, Serving 1–2.

**D46: tanks, out of service, lists, templates**

| # | Persona | Entry point | Mode / state | Expected |
|---|---|---|---|---|
| P1 | `brewer1` | Brewery → Production → Set up → Tanks → Add "FV8", unitank, 30 bbl, brewhouse | | Listed last; after a reload it's there and on the Gantt as the last tank row before Unassigned. |
| P2 | `brewer1` | Tanks → drag FV8 above FV1 | | Gantt row order follows after a reload, for `brewer2` too. |
| P3 | `brewer1` | Tanks → Add "fv1" | FV1 exists | Inline error "A tank named FV1 already exists." |
| P4 | `brewer2` | Tanks → Retire FV7 | an unfinished step is planned in FV7 | Refused, listing the batch. |
| P5 | `brewer2` | Tanks → Retire FV8 | empty | Gone from the Gantt and pickers; Retired list shows it; Restore brings it back. |
| P6 | `brewer1` | Gantt → Serving 2's ⋯ → Mark out of service… → Oct 27–Nov 2, "Replace door gasket" | a batch is planned in Serving 2 Oct 26–Nov 2 | Preview names that batch. After Save: hatched band, "Out Oct 27–Nov 2" tag, the batch's flag badge; all persist after a reload. |
| P7 | `brewer1` | tap an empty spot in FV3's row → Mark out of service → Until further notice, "Valve repair" | today | FV3's status: "Out of service · Valve repair"; tag "Out from Oct 20"; the band runs to the end of the view. |
| P8 | `brewer1` | click FV3's band → Back in service today | P7 | Yesterday becomes the last day out; status returns to normal; the period shows under Past in the ⋯ panel. |
| P9 | `brewer1` | Serving 2's ⋯ → Mark out of service overlapping the existing period | | "That overlaps another period (Tue Oct 27 – Mon Nov 2). Change that one instead." Nothing saved. |
| P10 | `brewer1` | click a band → Delete | | Gone; its flags clear. Undo restores it. |
| P11 | `brewer1` | Set up → Phases & steps → Add step type "Hop stand check", starts no phase | | Appears in Add step and the template editor pickers. |
| P12 | `brewer1` | Phases & steps → retire "Fining" | used by a template | Hidden from pickers; the template still shows its Fining step. |
| P13 | `brewer1` | Phases & steps → try to retire "Transfer" | built-in | No Retire action; Rename only. |
| P14 | `brewer1` | Set up → Templates → New "Lager with transfer": Brew day 0; Lag marker 1; Fermentation marker 2; Set temp 65° day 12 (starts Diacetyl rest); Diacetyl test 15 with notes; Set temp 40° 16 (Crash); Lagering marker 17; Set temp 30° 31 (Crash); Conditioning marker 33; Transfer 35; Carb 36; Conditioning marker 38; Package 40 | | Saved after a reload, entries in day order; the Transfer added a CIP & Sanitize for the first tank on day 35; the preview shows the phases in color. |
| P15 | `brewer1` | template editor → Add a ramp 58° → 32°, 10° per day, from day 18 after FDH | | Set temp 58°, 48°, 38°, 32° on days 18–21, chained; the last links to the next step chosen. |
| P16 | `brewer1` | template editor → a link from Carb to Package, default "move only" | | The link shows "stays by default". |
| P17 | `brewer1` | template editor → remove the Package from a template | | Save refused: "The last tank has no Package, Split or Transfer." |
| P18 | `brewer2` | Templates → Duplicate "Standard ale" → rename | | An independent copy; editing it doesn't change the original. |
| P19 | `bartender1` / `barMgr` / `breweryDevice` | typed URL `/brewery/production/templates` | | `bartender1` and `barMgr` go Home (API 403). The tablet sees the templates read-only (no Add/Edit). |

**D47: planning, the Gantt, moving, numbers, status, flags, CIP**

| # | Persona | Entry point | Mode / state | Expected |
|---|---|---|---|---|
| P20 | `brewer1` | Gantt | | Rows in display order + Unassigned; today line; 6 weeks zoom by default; each tank's status line. |
| P21 | `brewer1` | Plan batch: Galactic, "Standard ale", brew Thu Oct 22, 20 bbl, FV3 | two planned batches already later | "Galactic P1" ghosted in FV3; later planned batches renumber (message lists them). Persisted. |
| P22 | `brewer1` | tap FV6 on Nov 6 → Plan a batch, "Lager with transfer", transfer tank Unassigned | | A bar in FV6 and an "after transfer" bar in Unassigned; green arrow between them. |
| P23 | `brewer1` | Plan two batches on the same brew day | | The first planned keeps the lower P-number. |
| P24 | `brewer1` | Plan batch with "Brew over two days" | | "Brew day - 1 of 2" and "Brew day - 2 of 2"; day counts start from the first. |
| P25 | `brewer1` | drag Galactic P1's FDH dot 2 days later | its FDH links to the crash ramp ("move all") | Prompt with "Move all following steps 2 days later" preselected (Default), listing the ramp, Conditioning, Carb, Package, CIP with new dates. Apply → all moved; persisted. |
| P26 | `brewer1` | same, choose "Move only FDH" so FDH lands after the first ramp step | | Warning shown; after Apply a "Steps out of order" flag appears. |
| P27 | `brewer1` | drag Carb (link to Package is "move only") | | "Move only Carb" preselected. |
| P28 | `brewer1` | in the prompt, Undo | | Everything back where it was. |
| P29 | `brewer1` | batch dialog → change a step's date | | Same prompt; the dialog reopens after. |
| P30 | `brewer1` | drag a planned bar 3 days later | | Every step moves; no prompt; message with Undo. |
| P31 | `brewer1` | drag a brewed batch's bar 2 days later | some steps done | Only unfinished steps move: "9 unfinished steps 2 days later (finished steps keep their dates)". |
| P32 | `brewer1` | drag Fest #38's after-transfer bar from Serving 2 to Serving 1 | | Only that part changes tank; the first part stays in FV7. |
| P33 | `brewer1` | drag a bar to Unassigned | | It moves to the Unassigned row; within 3 days of filling, a "No tank assigned" flag. |
| P34 | `brewer1` | check off Crusher #42's "Set temp - 58°" today | due today | FV4's line changes from "68° · set to 58° today" to "58°". |
| P35 | `brewer1` | check off FDH 2 days late | | The step moves to today and the prompt asks about the following steps ("FDH done 2 days late"). |
| P36 | `brewer1` | Step dialog → Check off brew day of "Altruism P1" | planned; highest brewed #43 | Batch number prompt suggests 44. Enter "40" → "#40 is already Galactic #40." Enter "44b" → note shown, accepted. Altruism becomes "#44b"; other planned batches renumber. |
| P37 | `brewer1` | check off the next planned brew day | after P36 | Suggestion is still 44; "44B" is refused as a duplicate. |
| P38 | `brewer1` | Step dialog on that brew day → Mark not done | | "Altruism #44b is planned again; its number is freed." It's a P-number again. |
| P39 | API | `POST /steps/:id/complete` on a planned brew day without `batch_number` | | 422 `batch_number_required`. |
| P40 | `brewer1` | batch dialog of a brewed batch → change number to "45" | | Saved; title everywhere updates. Changing to an existing number is refused. |
| P41 | `brewer1` | Step dialog → "Add to the name" = "#2" on Dry hop | | "Dry hop - #2" on the Gantt, the step rows and the batch dialog. |
| P42 | `brewer1` | Step dialog → Set temp → temperature 52 | | "Set temp - 52°" everywhere. |
| P43 | `brewer1` | Step dialog → Assigned to `brewer2` | | "RW" initials above the dot and after the step's name when expanded; tooltip "Riley Wort". |
| P44 | `brewer1` | Step dialog → Notes "Watch the glycol on FV4" | | Persisted; shown in the dot's tooltip. |
| P45 | `brewer1` | batch dialog → a step's + Note | | The step dialog opens; closing returns to the batch dialog, now showing Note ✎. |
| P46 | `brewer1` | Gantt → FV4 caret | | Step rows with diamonds, names, links (solid/dashed), initials; expanded after a reload. Expand all / Collapse all work. |
| P47 | `brewer1` | « above the tank names | | Names only; hover shows status; remembered after a reload. |
| P48 | `brewer1` | zoom 12 weeks; ‹ 4 wks; From/To dates | | The view changes; the range is remembered. |
| P49 | `brewer1` | FV4 | Crusher #42 brewed 18 days ago, Fermentation, 68°, Set temp 58° due today | "FV4 · Crusher #42"; "Day 18 · Fermentation · 68° · set to 58° today". |
| P50 | `brewer1` | FV5 | its 32° step is a day late | "… · 32° change late" in red. |
| P51 | `brewer1` | Serving 1 | emptied 8 days ago, no CIP | "Empty · dirty 8 days · no CIP planned"; a "Dirty, no CIP planned" flag. |
| P52 | `brewer1` | Add CIP & Sanitize → Serving 1, today, Already done | P51 | "Sani 0 days"; the flags clear. |
| P53 | `brewer1` | Plan a batch into FV2 the day before Galactic #40's CIP | | "Tank overlap" and "Filling a dirty tank" flags; badge "!2" on the bar. |
| P54 | `brewer1` | Plan a 30 bbl batch into a 20 bbl tank | | "Batch bigger than tank". |
| P55 | `brewer1` | Flags → "No tank assigned" → note "Tank decided on brew morning." → Mark OK | | Muted with "Signed off by Jake Brewer · …"; the chip counts it as signed off. |
| P56 | `brewer1` | move that batch's brew day 1 day | P55 | The flag is open again with "Was signed off by Jake Brewer, but something changed since." |
| P57 | `brewer1` | Flags → Remove sign-off | | Open again. |
| P58 | `brewer1` | Add CIP & Sanitize in FV4 while Crusher #42 is in it | | "CIP while beer is in the tank" flag. |
| P59 | `brewer1` | drag a standalone CIP 2 days | | Moves, no prompt; Undo works. |
| P60 | `brewer1` | Delete planned batch | | Gone; P-numbers renumber. |
| P61 | `brewer1` + `brewer2` | both move steps in one batch at once | | Both succeed; last write wins; both screens agree within a minute. |
| P62 | `owner` | Gantt | not a Brewery member | Full access. |
| P63 | `bartender1`, `barMgr`, `office1` | Brewery nav / typed URL `/brewery/production` | | No nav entry; redirected Home; API 403. |
| P64 | `floater` (Bar + Brewery employee) | Gantt | | Full brewer access. |
| P111 | `brewer1` | template editor → Add step → Package, Partial, day 30, before the full Package on day 40 | | "Package - Partial" listed; no CIP added for it; no issues banner. Remove the full Package → the banner says the tank has no exit. |
| P112 | `brewer1` | check off a batch's "Package - Partial" | the batch is in FV4 | FV4 still shows the batch and its status line; the batch isn't completed; no dirty-tank flag. Switching an unfinished Package to Partial in the step dialog renames it. |
| P109 | `brewer1` | template editor → Add step → Split, Filter | | "Split - Filter" in the entries and the preview; it counts as the tank's exit; Edit switches it to Split - Transfer. Existing template Splits show "Split - Transfer". Plan batch copies the method. |

**D48: changing a batch**

| # | Persona | Entry point | Mode / state | Expected |
|---|---|---|---|---|
| P65 | `brewer1` | batch dialog → Add step → Addition "raspberry puree", Oct 30, comes after FDH | | "Addition - raspberry puree" marked Added; moving FDH offers to move it. The template is unchanged. |
| P66 | `brewer1` | Add step with both "comes after FDH" and "leads to Set temp 58°" | | Slotted between them; the direct FDH → 58° link is replaced. |
| P67 | `brewer1` | Add step → Something else, empty name | | "Give the step a name." |
| P68 | `brewer1` | Add step → Set temp ramp 60° → 40°, 10°/day | | Three chained Set temp steps. |
| P69 | `brewer1` | a ramp step → Change ramp… → target 34°, 7°/day | one ramp step done | Only unfinished steps are regenerated. |
| P70 | `brewer1` | Remove Amylo | Amylo links on to FDH | Gone; its predecessor now links to FDH. |
| P71 | `brewer1` | try to remove Brew day | | No Remove action. |
| P72 | `brewer1` | Add transfer / filter → Filter, Nov 5, Serving 1 | | Steps from Nov 5 move to a Serving 1 part; the first tank gets a CIP on Nov 5; arrow between them. |
| P73 | `brewer1` | Add transfer on a date after a finished step | | "Some steps after that date are already done. Pick a later date." |
| P74 | `brewer1` | remove that filter (step dialog → Remove step) | | The beer stays in the first tank; the CIP it added is gone. |
| P75 | `brewer1` | Split - Transfer Galactic #40 (20 bbl) on Nov 3: #40.1 12 bbl → stays in FV2; #40.2 8 bbl → FV6 | | Two parts with their own steps; gold arrow; no CIP for FV2 (a part stays). |
| P76 | `brewer1` | Split with volumes 12 + 6 | | "The parts add up to 18 bbl, but Galactic #40 is 20 bbl." |
| P77 | `brewer1` | Split with both parts → FV6 | | "Two parts can’t go into the same tank." |
| P78 | `brewer1` | Split with no part staying | | A CIP for FV2 on the split day. |
| P79 | `brewer1` | change #40.2's step dates | | #40.1 unchanged. |
| P80 | `brewer1` | Undo split | no part step done | Merged; the beer stays in FV2 with part 1's schedule. |
| P81 | `brewer1` | Undo split | a part step done | Refused: "Some steps on the parts are already done…" |
| P82 | `brewer1` | Split a planned batch | | Parts are "P2.1", "P2.2"; after brew day they become "#45.1", "#45.2". |
| P83 | `brewer1` | planned batch → template "Standard ale" → "Lager with transfer" | has an added step | Steps rebuilt; added step kept; an Unassigned after-transfer part appears. Message: "Standard ale → Lager with transfer. Kept 1 added step." |
| P84 | `brewer1` | planned batch → brand Enos | | Label and tasks update. |
| P85 | `brewer1` | Ctrl-click three steps in FV4, drag one 1 day | | All three move; the prompt is about the steps that follow them. |
| P86 | `brewer1` | select four ramp steps → Assign to `brewer2` | | "4 steps assigned to Riley Wort." |
| P87 | `brewer1` | Pixel: long-press a step, tap two more, drag | | Moves all three. A normal swipe still scrolls. |
| P88 | `brewer1` | Shift-click two steps in one tank | | Everything between them in that tank is selected. |
| P89 | `brewer1` | Undo after a split | | The split is undone. |
| P113 | `brewer1` | Shift-drag FDH 1 day later | FDH links on to the ramp ("move all") | No prompt; only FDH moves; message "FDH moved 1 day later (only this step)" with Undo; any out-of-order step is flagged. |
| P114 | `brewer1` | Serving 1 ("Empty · dirty 8 days · no CIP planned") → ⋯ → Mark clean…, today, note "Hosed and sanitized after the gasket job" | | "Sani 0 days"; the dirty flags clear; a marker on today with the note in its tooltip; no CIP block and no task. Undo puts it back. |
| P115 | `brewer1` | a clean empty tank → ⋯ → Mark dirty…, yesterday | a batch planned into it next week | "Empty · dirty 1 day · no CIP planned"; the planned batch gets "Filling a dirty tank". Planning a CIP before the fill clears both. |
| P116 | `brewer1` | ⋯ on a tank with beer in it | | No Mark clean / Mark dirty. The API refuses with 422 `tank_in_use`. |
| P117 | `brewer1` | ⋯ panel → History → Remove a mark | | The mark is gone and the status goes back to what the exits and CIPs say. |
| P110 | `brewer1` | Split - Filter Galactic #40 on Nov 3: #40.1 12 bbl stays in FV2; #40.2 8 bbl → Serving 1 | | "Split - Filter" on the schedule; FV2 keeps #40.1 (no CIP); Serving 1 fills with #40.2. |

**D49: task list linkage and the tablet**

| # | Persona | Entry point | Mode / state | Expected |
|---|---|---|---|---|
| P90 | `brewer1` | Plan a batch, then Tasks → Brewery | | Each task-list step is a task on its day, titled "FV3 · Galactic P1 · FDH", with a Planned batch pill; markers aren't there. |
| P91 | `brewer1` | Brewery board → "Show planned batches" off | | Planned-batch tasks hidden; still off after a reload; `brewer2`'s board unaffected. |
| P92 | `brewer1` | Board → drag "FV4 · Crusher #42 · FDH" 2 days later | | The board asks the move prompt; Apply → the Gantt shows FDH and (if chosen) the following steps moved. |
| P93 | `brewer1` | Board → check off "Set temp - 58°" | due today | Done on the Gantt; FV4's set temperature is 58°. No "where should it show" dialog. |
| P94 | `brewer1` | Board → check off FDH planned 2 days ago | | It moves to today, and the move prompt runs. |
| P95 | `brewer1` | Board → check off a planned batch's brew day | | The batch number prompt, on the board. |
| P96 | `brewer1` | Board → Edit a linked task | | "This task comes from the production schedule" + Open in schedule; notes and assignee editable there. |
| P97 | `brewer1` | Board → assign a linked task to `brewer2` | | Initials appear above the dot on the Gantt. |
| P98 | `brewer1` | Gantt → change the step's notes | | The board task shows the same notes. |
| P99 | `brewer1` | Board → Delete a linked task → confirm | | Off the board; on the Gantt the step stays, "Show on the Brewery task list" off. |
| P100 | `brewer1` | Step dialog → turn "Show on the Brewery task list" on | | The task reappears on its day. |
| P101 | `brewer1` | drag a batch to another tank / enter its batch number | | Task titles update ("FV6 · …", "#44"). |
| P102 | `brewer1` | Gantt → Task list panel | | Late / Today / next 6 days; check off, move, assign and Open all work. |
| P103 | `brewer1` | Standalone CIP | | "FV6 · CIP & Sanitize" on the board; checking it off there marks the tank sanitized. |
| P104 | `breweryDevice` | Brewery → Production | no active code | The Gantt shows; opening a step works; Check off asks for a staff code. |
| P105 | `breweryDevice` | enter `brewer1`'s code → drag a step | | The move is recorded as `brewer1`; "Acting as Jake Brewer" for 5 minutes. |
| P106 | `breweryDevice` | Set up menu | | No Tanks / Templates / Phases & steps editing. |
| P107 | `taproomDevice` | typed `/brewery/production` | | Not available; API 403. |
| P108 | `brewer1` | Board → recurring options on a linked task | | Not offered. |

## 5. Out of Scope

- Assigning templates to brands (later).
- Blending; splitting a split part again.
- Measured readings (gravity, temperature logs) and the old batch fields (OG/FG, tasting).
- Packaging inventory or quantities.
- A schedule change log / History (Matt, 2026-10-20: not now).
- Notifications for schedule changes or late steps (the board's shift-end reminder already covers linked tasks in D49).
- Importing from the Google Sheet.
- Sanitation shelf life.
- Calendar feeds for production steps.

## 6. Open Questions

1. ~~Releases~~ — **decided** (Matt, 2026-10-20): one prod release after D49.
2. ~~Tablet setup~~ — **decided** (Matt, 2026-10-20): the tablet works the schedule only; setup pages are read-only there.
3. ~~Old Batches page~~ — **decided**: remove the nav entry in D47, delete the page later.
4. ~~History~~ — **decided**: not now.
5. ~~Deleting a linked task on the board~~ — **decided**: it comes off the task list; the step is kept.
6. ~~Renaming a step type~~ — **decided**: existing batch steps take the new name too (and their board tasks are retitled).
7. ~~Out of service vs. moves~~ — **decided**: flagged only.

No open questions as of 2026-10-20.
