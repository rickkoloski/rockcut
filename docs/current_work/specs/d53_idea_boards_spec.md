# D53: Idea Boards + multiple assignees on tasks — Spec

**Status:** APPROVED by Matt 2026-11-06. Part 1 in progress.
**Backlog:** PortableMind project 254, task 5063
**Builds on:** D41 (department task boards), D42, D40 (staff codes on boards),
D49 (production-linked tasks)
**Release:** both parts ship together in one release, with **two DEV gates**
(Decision 15). Part 1 lands first on the branch and passes DEV on its own, so
Part 2's "Send to task list" builds on a checked Part 1.

## 1. Problem

The task boards hold dated work. Ideas and longer projects ("a new
canning line", "fall releases", "taproom remodel") have nowhere to live:
they sit in heads, on paper or in Trello. Separately, a task can have only
one person, though real jobs are often shared.

## 2. Decisions (Matt, 2026-11-02)

1. **Name:** Idea Boards.
2. **One board per department** (Brewery, Taproom, Office, Sales) **plus
   one Company board.** Boards are fixed, like the task boards: nobody
   creates or deletes a board. "Other" gets none.
3. **Lists and cards:** each board holds any number of **lists** (shown side
   by side as columns) that its people create, and each list holds
   **cards**.
4. **Who sees what:** your own departments' boards plus the Company board.
   No read-only view of other departments' boards. Owners see every board.
5. **Anybody can do anything** on a board they can see: create, rename,
   reorder and archive lists; add, edit, move and archive cards.
6. **Manager lock:** any manager of the board's department (and owners) can
   lock or unlock a **list** or a **card**. A lock makes it read-only for
   **non-managers**; managers keep editing it without unlocking (§4.5). On
   the Company board only **owners** lock and unlock.
7. **Cards hold:** title, a **description** (one editable block saying what the
   idea is), **assignees** (several), **due date**, **labels**, a **checklist**
   and **notes** (a timeline of entries, each showing who wrote it and when,
   newest first, like Trello).
8. **Send to task list:** a card can become task(s) on a department's task
   board (§4.7). The dialog asks each time whether the checklist becomes the
   task's notes (default) or one task per item.
9. **Tasks get multiple assignees** (Part 1), shipped in the same release.
10. **Watch (cards only):** each person turns Watch on or off for a card,
    for themselves; while it's on they're notified of any change to it. No
    other Idea Board notifications (§4.6).
11. **Everyone has the Company board,** including people with no
    department.
12. **Shared tablets** see their home department's Idea Board and the
    Company board, **view only**.
13. **History:** that department's managers and owners; on the Company board,
    owners only.
14. **Notes stay open on locked things.** A lock stops changes, not
    discussion (§4.5).
15. **Two DEV gates, one release:** Part 1 passes DEV (full suite and an
    independent pass) before Part 2 starts; Part 2 then passes its own gate.
16. **Labels:** anyone creates them; only managers and owners rename or delete
    them (owners only on the Company board).

## 3. Requirements: Part 1, multiple assignees on tasks

### 3.1 Data

- New join table `task_assignees` (`task_id`, `user_id`, `inserted_at`;
  unique on the pair; cascade on task delete). Same for repeats:
  `task_series_assignees`.
- Migration backfills one row from each `tasks.assignee_id` and
  `task_series.assignee_id`. The old columns **stay** and are kept set to
  the first assignee (so a rolled-back API image still shows one person),
  and are dropped in a later release, the same way as task 4963.
- Every assignee must be an active member of the task's department or an
  owner (the D41 rule, per person). A device is never an assignee.
- **Linked tasks (D49)** keep exactly the production step's one assignee
  (or none). Production steps stay single-assignee; `TaskLink` writes the
  list as `[step.assignee]`. Their dialog keeps its single picker, and a change
  there still goes to the step (D49). More than one person on a linked task is
  refused with 422.

### 3.2 Everything that used the one assignee

| Where | Change |
|---|---|
| Task dialog | "Assigned to" becomes a multi-select of the board's members (chips). Empty = unassigned. |
| Task card | Up to three avatars/initials, then "+N". |
| View filter | **My tasks** = I'm one of the assignees. **Unassigned** = nobody. |
| Repeats | A series carries the list; new occurrences copy it. "This / following" edits work as today. |
| Leaving a department (D41 S112) | Removes that person from the open tasks and series on that board; others stay assigned. |
| Brewery shift-end push (D40) | Each assignee hears about their open work, as today. |
| Dashboard Today's tasks card, All departments view | Show all assignees. |
| History / change log | "Assigned Sam Pour, Jake Brewer" / "Removed Jake Brewer"; old single-assignee events still read correctly. |
| Tablet with a staff code (D40) | Can set several assignees, decided for the acting person as today. |
| Sorting "mine first" (`Tasks.open_work`) | Mine = I'm in the list. |

### 3.3 API

- Task JSON gains `assignees: [{id, name}]`. `assignee_id` and `assignee_name`
  stay for one release, set to the first assignee, so a UI tab still on the old
  version keeps showing someone (this matches the rollback plan in §3.1).
  Writes take `assignee_ids: [..]`; a lone `assignee_id` is still accepted for
  one release and means `[id]`.
- 422 names the person who can't be assigned.

## 4. Requirements: Part 2, Idea Boards

### 4.1 Data

| Table | Columns |
|---|---|
| `idea_lists` | `board` (department key or `company`), `name` (≤ 80), `position`, `locked_at`, `locked_by_id`, `archived_at`, timestamps |
| `idea_cards` | `list_id`, `title` (≤ 200), `description` (≤ 10,000), `due_on` (date, nullable), `position`, `locked_at`, `locked_by_id`, `archived_at`, `created_by_id`, timestamps |
| `idea_card_assignees` | `card_id`, `user_id` |
| `idea_labels` | `board`, `name` (≤ 30), `color` (from a fixed palette), `position` |
| `idea_card_labels` | `card_id`, `label_id` |
| `idea_checklist_items` | `card_id`, `text` (≤ 200), `done_at`, `done_by_id`, `position` |
| `idea_notes` | `card_id`, `author_id`, `body` (≤ 2,000), `edited_at`, timestamps |
| `idea_card_tasks` | `card_id`, `task_id` (nulled if the task is deleted), `task_series_id` (nullable), `department_id`, `task_title`, `removed_at` (§4.7) |
| `idea_events` | per-board change log, like `task_events` |

- A board is a key, not a table: `brewery`, `bar`, `office`, `sales`,
  `company`. Each board starts with lists **Ideas, Planned, Doing, Done**,
  created by a migration for all five boards (20 rows; created on first open
  could race and make duplicates).
- Labels belong to a board. Deleting a label strips it from every card,
  locked ones included. Assignees: members of that department (or owners); on
  the Company board, any active employee. As on the task boards, pickers don't
  offer owners on a department board, though the API accepts one.
- **People leaving:** leaving a department removes you as an assignee on that
  department's open cards. Deactivation removes you from all cards and drops
  your watches. Your notes stay, under your name.
- Archive, don't delete: archived lists and cards can be restored from
  "Archived" in the board's ⋮ menu. Managers and owners can delete an
  archived card or list for good, which also deletes its notes, checklist
  and watches. Tasks already sent stay.

### 4.2 Who can do what (`Authz`)

| Action | Who |
|---|---|
| Open a department board; everything in §4.4 on it | members of that department (any role), owners |
| Open the Company board; everything in §4.4 on it | every active employee |
| Lock / unlock a list or card; change locked things; delete archived things | that department's managers, owners. **Company board:** owners only |
| Edit or delete a note | its author (an edited note is marked "edited"); managers/owners may delete any |
| Rename or delete a label | that department's managers, owners. **Company board:** owners only |
| View History | that department's managers, owners. **Company board:** owners only |

- New area `{:idea_board, key}` in `Authz.can?/3`; D31's boundary test and
  parity suite get the new rows. Access is checked before ids (a list or
  card id from another board → 404, a board you can't open → 403).
- **`noDept`:** sees the Company board only.
- **Shared tablets:** read their home department's board and the Company
  board, view only (no staff-code writes, no Watch). Every write route
  answers 403 for a device; other boards 403.

### 4.3 API

`/api/idea_boards` (the boards I can open, with `manage`), and under
`/api/idea_boards/:board/`: `lists` (CRUD, reorder, lock, archive,
restore), `cards` (CRUD, move, reorder, lock, archive, restore),
`cards/:id/notes`, `cards/:id/checklist`, `labels`,
`cards/:id/send_to_tasks`, `history`, `archived`, and `cards/:id/watch` (`PUT` /
`DELETE`). `/api/me` gains
`idea_boards`.

### 4.4 Board UI

- **Nav:** top-level **Idea Boards** after Tasks, at `/ideas/:board`
  (`/ideas/brewery`, `/ideas/company`, …). `/ideas` opens the remembered
  board. A switcher like the task boards' lists your boards with Company
  last.
- **Layout:** lists side by side, scrolling sideways; "+ Add a list" at
  the end. Each list: name (click to rename), card count, ⋮ (rename,
  lock/unlock, archive), "+ Add a card" at the bottom.
- **Drag** (the shared `@dnd-kit` layer): cards within and between lists,
  lists left/right. Phone width: one list at a time with list tabs;
  long-press to drag, the same as the phone task board.
- **Card face:** labels (color bars), title, due date (red when past),
  checklist count "2/5", note count, assignee initials, lock icon,
  "On the task list" chip after Send.
- **Card dialog:** title, description, assignees, due date, labels (pick or
  create), checklist (add, tick, reorder, remove), notes, and its Send / Lock / Archive actions. Opening a card puts it in the URL
  (`/ideas/bar/cards/42`) so it can be shared in Messages.
- **Notes timeline:** the add box on top, then entries **newest first**, each
  with the author and time ("Casey Tap · Nov 6, 2:14 PM"). Only notes: card
  changes such as moves stay in History, not in this timeline.
- **Filter:** All / My cards / Watching / by label; Show archived is in ⋮.
- **Watch:** an eye toggle in the card dialog; a small eye on the card
  face when you watch it.
- **Tablet:** the same board without any add, edit, drag, lock, Watch or
  Send controls; tapping a card opens it read-only.
- **Freshness:** boards refetch when you come back to the tab, as the task
  boards do. No live updates; when two people drag at once, the last write wins.

### 4.5 Locks

A lock binds **non-managers** only. Whoever can lock on that board
(its department's managers and owners; owners only on Company) keeps full
edit rights on locked things without unlocking.

- **Locked list:** for non-managers it can't be renamed, moved or archived;
  no cards added, edited, moved in or out, or archived in it. Checklist ticks
  inside it are also frozen. Other lists can still be reordered around it.
- **Locked card:** read-only for non-managers and can't be moved by them,
  even in an unlocked list.
- **Notes stay open** on locked lists and cards, for anyone who can see the
  board; watchers are notified of them.
- A non-manager can't archive an unlocked list that holds a locked card, since
  that would hide the locked card.
- A lock icon and "Locked by Casey · Nov 2" show on the list or card. The
  API refuses a non-manager's write with 423 `locked` ("Locked by a
  manager"); the UI hides or disables the controls rather than letting the
  request fail.
- Watching, reading and adding notes are never blocked by a lock.

### 4.6 Watch and notifications

Notifications come **only** from Watch: nobody is notified just for being
assigned or mentioned.

- **Cards only:** Watch is a per-person flag on a card (`idea_watches`:
  `user_id`, `card_id`, unique on the pair). No list or board watching.
- **Nothing is watched automatically.** Creating or being assigned to a
  card doesn't turn Watch on.
- **Any change counts:** title, description, due date, labels, assignees,
  checklist (add, tick, remove), notes, moves between lists, lock and
  unlock, archive and restore, Send to task list.
- **Never about your own change.**
- **Batched:** the first change starts a 10-minute window, and one notification
  goes out when it closes ("Casey changed *Taproom remodel*: moved to Doing, 2
  notes"). A small pending-changes ledger, flushed by the existing D22 scanner (every 5
  minutes), so a notification arrives **10–15 minutes** after the first change (Matt, 2026-11-08:
  keep one background job). Tapping it opens the card.
- **Delivery:** one new event type `idea_card_changed`. Defaults: in-app on,
  push on, email off, like `task_shift_end`; it gets a row in the Notification
  preferences dialog, and the UI's `EVENT_DEFAULTS` must match.
- Losing access to the board (leaving the department) drops your watches
  on it.
- No due-date reminders in D53.

### 4.7 Send to task list

From the card dialog, **Send to task list** opens a dialog:

| Field | Default |
|---|---|
| Task board | The card's department. **Company cards:** pick from the departments the person can use (owners: all four). |
| Assignees | The card's assignees who are members of that department; others listed as "not in Taproom, left off". Editable. |
| Day | The card's due date, else Future. A due date already past defaults to Today. |
| Repeat | None; the task dialog's repeat options. Offered only in "one task" mode. |
| Checklist | **"One task; checklist goes in its notes"** (default) or **"One task per checklist item"**. Shown only when the card has a checklist. |
| Then | Leave the card where it is (default), move it to a list (e.g. Done), or archive it. |

- One task: the card's title becomes the task's title, and its description
  goes in the task's notes; open checklist items appended as
  `☐ item` lines (ticked ones as `☑`). Over 2,000 characters, the description
  is cut with "… see the Idea Board card" so the checklist lines survive (and
  the checklist itself is cut only if it alone exceeds the limit).
- **Link back:** task notes are plain text, so the link isn't in them. The task
  dialog shows **"From idea: Taproom remodel"**, driven by `idea_card_tasks`.
  Someone who can't open that board sees the title without a link.
- One task per item: each **open** item becomes a task with the card's
  assignees and day; the description isn't copied (each task shows the
  "From idea" link).
- **One-way copy:** later edits to the card don't change the tasks, and
  vice versa. The card shows a chip per task, "On the Brewery task list ·
  Nov 12", which turns into "✓ Done Nov 12" when the task is checked off,
  or "Removed" if it's deleted. A repeating send links to the series
  ("Repeats weekly on the Brewery task list").
- A card can be sent again (warns "Already on the task list"). Non-managers
  can't send a locked card; managers can.

### 4.8 Task board follow-ups from Part 1's DEV QA

Matt put these in Part 2 (2026-11-07). Report:
`stepwise_results/d53_part1_dev_qa_report.md`. They go in the Part 2 plan; repros are there.

- **Gap 4: History on a "following" edit** records what really changed on later
  occurrences, not only the edited occurrence's people.
- **Gap 5: leaving a department** writes one History row per series (with a count), not
  one per occurrence.
- **Gap 6: Mark not done** doesn't put a former member back on the open task.
- **Gap 9: deactivation** History says the person was deactivated, not "left the Brewery".
- **Gap 11: narrow cards:** one person, a repeat icon and a notes icon don't crush the title.

From the QA recheck (`stepwise_results/d53_part1_dev_qa_recheck_report.md`), both already on `develop`:

- **Gap 13: a rule change from a series' first occurrence, with "keep"** turns the kept occurrences
  into one-offs (`series_id: null`). They lose Edit series… and Stop repeating, and series-wide
  Delete/Stop no longer reach them. Proposed: move them into the new series (they keep their flag,
  people, title and notes, and the new series skips their days).
- **Gap 14: a moved occurrence gets a twin** after a rule change with "keep": it stays on its new
  day, and the new pattern also makes its original date. Decide whether the new series skips the
  kept one's `series_date` too, or the confirm says so.

From the second recheck (`stepwise_results/d53_part1_dev_qa_recheck2_report.md`, observations):

- **Notes on a dropped date vanish without a mention.** The rule-change confirm and History should
  say when occurrences with their own notes are removed.
- **The Ends "After N times" error shows a raw `count:` prefix.**

Gap 8 (the API accepts an owner on a department board) needs no change: it's deliberate
since D41 (S105).

## 5. Scenarios

| # | Persona | Entry point | Mode / state | Expected |
|---|---|---|---|---|
| S216 | `brewer1` | Brewery board → task dialog → add `brewer2` and `floater` | | The card shows two sets of initials; reload: both still assigned. History: "Assigned Riley Wort, Jordan Float to <title>". |
| S217 | `brewer2` | Brewery board → View → My tasks | assigned with `brewer1` | The shared task shows for both `brewer1` and `brewer2`. |
| S218 | `owner` | Users & Roles → remove `floater` from Brewery | `floater` + `brewer1` on an open Brewery task | `floater` removed; `brewer1` stays. |
| S219 | `brewer1` | Brewery board, weekly series with two assignees | | New occurrences carry both; "following" edit changes both for later ones. |
| S220 | `breweryMgr` | Gantt → step with assignee → Brewery board | linked task | One assignee. The linked task's dialog keeps its single picker and a change there reaches the step, as before; two assignees through the API → 422. |
| S221 | — | Brewery shift-end scan | a task with two assignees, both on shift | Each gets the push once. |
| S222 | `breweryDevice` | brewhouse tablet → task → add two people with a staff code | | Saved; History names the acting person. |
| S223 | `bartender1` | nav → **Idea Boards** | first ever open | `/ideas/bar`, lists Ideas / Planned / Doing / Done. Switcher: Taproom, Company. |
| S224 | `bartender1` | Taproom board → + Add a list "Taproom remodel" → add a card, labels, checklist, due date, `bartender2` | nobody watching | All persist after reload. Nobody is notified (`bartender2` isn't watching). |
| S225 | `bartender1` | the card → Watch on; then `bartender2` adds a note and ticks a checklist item | | `bartender1` gets **one** notification naming both changes; `bartender2` gets none. |
| S226 | `floater` | switcher | Taproom + Brewery | Taproom, Brewery, Company. |
| S227 | `brewer1` | typed `/ideas/bar`; `GET /api/idea_boards/bar/lists` | not Taproom | Goes to `/ideas/brewery`; API 403. |
| S228 | `barMgr` | Taproom list ⋮ → **Lock** | | Lock icon and "Locked by Casey"; `bartender1` can't add, edit, move or archive in it; a crafted `PATCH` → 423. `barMgr` still renames the list and edits a card in it without unlocking. |
| S229 | `barMgr` | a card ⋮ → Lock | card in an unlocked list | `bartender1` can't edit or drag it; other cards in the list still work. |
| S230 | `splitRole` | Brewery Idea Board | Brewery employee, Taproom manager | No Lock on the Brewery board; Lock on the Taproom board. |
| S231 | `breweryMgr`; `owner` | Company board → lock a list | | `breweryMgr`: no Lock; API 403. `owner`: locked; `breweryMgr` and `brewer1` then can't change it. |
| S232 | `office1` | Company board → add a card, assign `bartender1` | | Allowed (Company: anyone). |
| S233 | `bartender1` | Taproom card → Send to task list | 3 checklist items, due Nov 12, assignees `bartender1`, `bartender2` | Default: one Taproom task due Nov 12, both assigned, notes with ☐ lines, and the task dialog shows "From idea". Card shows "On the Taproom task list · Nov 12". |
| S234 | `bartender1` | same, "One task per checklist item", then move card to Done | | Three tasks, each with "From idea"; the card is in Done. |
| S235 | `bartender2` | S233's task on the Taproom board → tick done | | The card chip shows "✓ Done <date>". |
| S236 | `office1` | Company card → Send | assignees `office1`, `brewer1` | Picks Office (their only board); `brewer1` shown as "not in Office, left off". |
| S237 | `bartender1` | Taproom list ⋮ → Archive; ⋮ → Archived → Restore | | Gone, then back with its cards. `bartender1` can't delete for good; `barMgr` can. |
| S238 | `noDept` | nav → Idea Boards | no departments | Only the Company board; full use of it. `/ideas/bar` goes to `/ideas/company`. |
| S239 | `bartender1` | open `/ideas/bar/cards/<id>` on phone width | | Opens the card; Android back closes it. One list at a time with tabs; long-press drags a card to another list. |
| S240 | `barMgr`; `bartender1`; `barMgr` on Company | Taproom ⋮ → History | after S224–S237 | `barMgr`: Taproom events only. `bartender1`: no History; API 403. Company History: owners only, `barMgr` gets 403. |
| S241 | `taproomDevice` | tablet → Idea Boards | | Taproom and Company boards, view only: no add/edit/drag/Watch controls; a card opens read-only. `POST …/bar/cards` → 403; `GET …/brewery/lists` → 403. |
| S242 | `brewer1` | Brewery card → Watch on; `breweryMgr` moves it, later `brewer2` edits it | changes 15 minutes apart | `brewer1` gets two notifications; after turning Watch off, a further change sends none. Watching filter lists the card while on. |
| S243 | `floater` | watches a Taproom card → removed from Taproom by `owner` | | No more notifications for it; the watch is gone. |
| S255 | `bartender1` | a locked Taproom card → add a note | | The note saves and watchers hear of it; the card's other fields stay read-only. |
| S256 | `bartender1`; `barMgr` | a label → rename, delete | used on a locked card | `bartender1`: can create a label, no rename or delete; API 403. `barMgr`: delete strips it from every card. |
| S257 | `bartender1` | Archive an unlocked list holding a locked card | | Refused, saying why. `barMgr` can. |
| S258 | `bartender1` | Send a card due last week | due date past | Day defaults to Today; Repeat not offered in "one task per item"; a locked card has no Send for `bartender1`, and `barMgr` can send it. |
| S259 | `bartender1` | delete a task sent from a card | | The card's chip says "Removed" and keeps the title. |
| S260 | `owner` | deactivate `[TEST-TEMP]` person | assigned to and watching cards, with notes | Off the cards, no watches, notes remain under their name. |
| S261 | `bartender1`; `bartender2`; `barMgr` | a card → add two notes; edit one; another person tries to edit it | | Newest first, each with author and time, kept after a reload. The edited one is marked "edited". `bartender2` can't edit or delete `bartender1`'s note (API 403); `barMgr` can delete it. Sending the card leaves the notes on the card only. |

## 6. Out of scope

- Creating extra boards, sharing a department board with another
  department, or a read-only view of other departments' boards.
- Attachments and images on cards.
- Due-date reminders; email digests.
- Two-way sync between a card and its tasks.
- Multiple assignees on production steps or shifts.
- Moving a card to another board.
- Watching a list or a whole board.
- Automatic entries ("Casey moved this card to Doing") in the notes timeline.

## 7. Decisions recap

Q1–Q6 are in Decisions 6 and 10–12. Review items 17–20 (Matt, 2026-11-06) are
Decisions 13–16.

## 8. Risks

- **Part 1 touches every task feature.** The assignee change lands first
  as its own commits; D38–D49's ExUnit and Playwright suites must pass with
  only the shape changed (`assignees` list) before Idea Boards start.
- **Rollback with the join table:** a rolled-back API reads only
  `assignee_id` (the first assignee), so extra assignees vanish until the
  new release is back. The Idea Boards tables are simply unused. Note it in
  the release PR.
- **Size:** Part 2 is a whole new feature (lists, cards, labels, checklist,
  notes, locks, Send). If it runs long, notes and Send to task list
  are the pieces that can move to a follow-up without changing the data
  model.
