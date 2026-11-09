# D50: The brewhouse device on the production schedule — Spec

**Status:** APPROVED by Matt 2026-11-08 (§5 answered: yes to all four).
**Backlog:** PortableMind project 254, task 4934. Also the template link bug found 2026-11-08 (§2.6).
**Order:** after D55 is on prod. Branches from `develop`. Its own release.
**Base:** the D46 spec (`specs/d46_production_scheduling_spec.md`) planned D50 as its fifth part
(P104–P107, §3.13's tablet line). This spec replaces those parts and brings them up to date (D54
removed "Sign in as me"; D53 added Boards).
**Shape:** no new tables expected. Authorization (`Authz.Device`), the production routes joining the
device pipeline, `StaffCodeActing` on every production write, UI on the Gantt, the step and batch
dialogs and the Brewery board for a device, and the link fixes (§2.6, §2.7).

## 1. Why

The brewers work the schedule on the brewhouse floor, not at a desk. Today the brewhouse device sees
production steps on the Brewery board read-only ("Do this on the production schedule.") and can't
open the schedule at all. D50 makes the brewhouse device a full schedule station: anyone in the
Brewery can plan, move, check off and sign off with their staff code, as they already do on the task
board (D40).

## 2. Items

### 2.1 The device (Matt, 2026-11-08)

"Tablet" here means a **shared device**: a device account paired with a code (D33). The hardware
doesn't matter to the app. Matt may start with an older device and later dedicate a Chromebook.

- **Supported:** any device with a current Chrome (version 107 or later; the app's build target),
  1280 px wide or more, with touch or a mouse/trackpad. Tested at **1280×800 touch** (the bar's
  Samsung tablets) and **1366×768 mouse** (a typical Chromebook).
- **Not supported:** Chrome before 107. The ASUS Chromebit (updates ended November 2020, about Chrome
  87) can't run the app; check `chrome://version` before using any older device.
- **Setup notes** (for `docs/process/taproom_tablet_setup.md`, extended to the brewhouse): install the
  app (PWA), open it at login, keep it awake on power; on a laptop, the lid open or docked. A managed
  kiosk mode isn't needed.
- **On prod, before release:** Matt creates and pairs the brewhouse device (Admin → Shared devices,
  home **Brewery**).

### 2.2 Who can do what on the brewhouse device

A device whose **home department is the Brewery** gets production **read and write** (`Authz.Device`).
Every write needs a staff code and is **decided for, and logged as, that person** (`StaffCodeActing`,
D40), with the device recorded beside them. The 5-minute "Acting as" window is **shared with the
Brewery board** (a code entered on either counts for both).

| On the brewhouse device | With a staff code (Brewery members and owners) |
|---|---|
| See the Gantt, the Task list panel, step, batch and tank details, flags | No code needed (read) |
| **Plan a new batch** from a template, pencil in, schedule (Matt, 2026-11-08: yes) | ✔ |
| Move steps and batches (drag, multi-select, Shift-drag), the move / batch-number / off-plan prompts | ✔ |
| Check off and un-check steps; tank assignment; notes; assignee | ✔ |
| **Sign off flags** (Matt, 2026-11-08: yes) | ✔, as the code's person |
| Batch changes: add/remove steps and ramps, transfers, splits, template/brand changes | ✔ |
| Standalone CIPs; clean/dirty/cleaned marks; out-of-service periods | ✔ |
| Undo | ✔ only for the person who made the change, within its 2 minutes (§2.4) |
| Tanks, templates, phases & step types (setup) | **Read only** (Matt, 2026-10-20) |
| The Brewery board's **linked tasks** (check off, move, assign, notes, take off the list) | ✔, as on the Gantt (ends D49's "until D50" rule) |

- A code from someone **not in the Brewery** (and not an owner) is "That staff code can't do this
  here" and nothing changes (as D40's S45 on the board).
- The D40 rate limit and lockout apply to production writes too, counted together with the board.
- The **Taproom tablet** (and any non-Brewery device) gets 403 on every production route; a typed
  `/brewery/production…` URL shows "Not available on a shared device".

### 2.3 The device UI

- **Nav:** Brewery → **Production** appears on the brewhouse device (today it shows only the Brewery
  board). The setup pages open read-only (no add, edit, retire, reorder; a short "Set up on a
  personal account" note).
- **The "Acting as" banner** shows on the Gantt as on the board, with the person's name and the time
  left. When a write needs a code and no window is open, the code dialog opens first; after a
  correct code the write goes through without asking again.
- **Touch and mouse** both work: drag, long-press to multi-select (touch), Ctrl/Cmd- and Shift-click
  (mouse), the step dialog, the batch dialog, the Plan batch dialog, the flags dialog.
- **Show planned batches:** for people it's a per-person setting (D49). On the device it's a
  **per-device** setting in Shared devices (default on), not the acting person's.
- **The theme** follows the device's own setting (D43), not the acting person's.

### 2.4 Undo, History and notifications

- **Undo** on the device belongs to the person whose code made the change, as today's per-person
  rule. Undo needs that person's window to still be open (or their code again). Another person's
  code can't undo it.
- **History / the change log** name the person and "on the Brewhouse device" (as the board's History
  does for D40: "created on the Shared Device").
- **Notifications** the schedule sends today (assignments etc.) treat the acting person as the actor
  (they don't notify themselves).

### 2.5 The Brewery board's linked tasks on the device

D49 made them read-only on the device. With D50 they behave as on a person's board, behind a staff
code: check off (the brew-day number and off-plan prompts included), move (the move prompt), assign,
notes, take off the task list, and **Open in schedule**.

### 2.6 Template links: picking a link and pressing Save drops it (bug, Matt 2026-11-08)

**Today:** in the template editor, editing an entry shows a **Links** section at the bottom. Choosing a
step under "Add: comes after" or "Add: leads to" does nothing until the small **Link** button next to
it is pressed. Pressing **Save** closes the dialog and silently drops the choice (confirmed on the
local server 2026-11-08: PDH → leads to FDH, Save, no link). The **Add** dialog's pickers do save with
Save, so the two dialogs behave differently.

**Change:** in the edit dialog, a step chosen in either picker is **linked when Save is pressed** (as
the Add dialog does), with its default answer. The Link buttons stay for linking without closing. If
Save fails, nothing is linked and the error shows. The Links section moves above Notes so it isn't
below the fold.

### 2.7 Links on an existing batch's steps (Matt, 2026-11-08)

**Today:** a batch step can be linked only when it's added (Add step / Add ramp). The step dialog
shows its links read-only, and the API has no routes to add or remove a batch's links.

**Change:** the step dialog gets the same Links section as the template editor: "Comes after" and
"Leads to" with their default answer, Remove, and pickers that only offer what the server takes (the
same day rules and no loops as templates). Saved with Save or the Link button (§2.6). Every change is
on the schedule's Undo. On the brewhouse device, with a code. A part of a split batch can link only
within its own tree.

## 3. Not in D50

- **D56** (task 5207): steps before brew day (negative days) and multi-day steps.
- **D57** (task 5208): test results and automatic retests (a failed D-test).
- A managed kiosk / ChromeOS enterprise setup.

## 4. Scenarios

Personas: `breweryDevice` (home Brewery), `taproomDevice`, `brewer1`, `brewer2`, `breweryMgr`,
`bartender1`, `owner`. Codes are the personas' staff codes.

| # | Persona | Scenario | Expected |
|---|---|---|---|
| P104 | `breweryDevice` | Brewery → Production, no window open | The Gantt shows; opening a step works; Check off asks for a staff code. |
| P105 | `breweryDevice` | `brewer1`'s code → drag a step | The move (and its prompt) is recorded as `brewer1` on the device; "Acting as Jake Brewer" for 5 minutes. |
| P106 | `breweryDevice` | Setup pages | Tanks, Templates, Phases & steps open read-only; the API refuses setup writes. |
| P107 | `taproomDevice` | typed `/brewery/production` | "Not available on a shared device"; every production route 403. |
| D1 | `breweryDevice` | Plan a new batch from a template with `brewer1`'s code; schedule it | The batch, its P-number, its linked tasks on the Brewery board; History names `brewer1` on the device. |
| D2 | `breweryDevice` | Sign off a flag with `breweryMgr`'s code | Signed off by `breweryMgr`; the flag clears. |
| D3 | `breweryDevice` | `bartender1`'s code on any production write | Refused, nothing changes; the dialog stays open. |
| D4 | `breweryDevice` | Check off a linked task on the Brewery board with `brewer2`'s code | The step is done on the Gantt too; brew-day number prompt on brew day. |
| D5 | `breweryDevice` | `brewer1` moves a step, the window closes, `brewer2` enters a code and presses Undo | Refused ("Only Jake can undo this"); `brewer1` with a code can. |
| D6 | `breweryDevice` | Multi-select three steps and drag, by touch at 1280×800 and by mouse at 1366×768 | They move as a block; the prompt runs; recorded as the acting person. |
| D7 | `breweryDevice` | A batch change (add a step, a transfer, a split) with a code | As for a person; the split's parts move as one. |
| D8 | `breweryDevice` | Five wrong codes on the Gantt | The D40 lockout; the board is locked too (shared counter). |
| D9 | `owner` | Shared devices → Brewhouse → Show planned batches off | The device's Brewery board and the Gantt's Task list hide planned batches' tasks (D49's meaning, now per device; the Gantt still shows pencilled batches); no person's setting changes. |
| L1 | `breweryMgr` | Template editor → edit PDH → pick "Leads to: FDH" → Save | The link exists after a reload (§2.6). |
| L2 | `breweryMgr` | Step dialog on a batch → add "Comes after", Remove another | Saved; the move prompt uses the new link; Undo puts both back (§2.7). |
| L3 | `breweryMgr` | Try a link that would loop, or a "comes after" on a later day | Not offered; the API refuses it if forced. |
| L4 | `breweryDevice` | L2 with `brewer1`'s code | As L2, recorded as `brewer1`. |

## 5. Decisions (Matt, 2026-11-08)

1. **Owners' codes** work on the brewhouse device, as Brewery members' do.
2. **Undo** only by the person who made the change (today's rule).
3. **Show planned batches** on the device is a per-device setting, default **on**.
4. **Out-of-service periods** stay with the schedule: the device adds and edits them with a code.

## 6. Gate

The usual three-environment workflow. DEV QA: the scenarios above on `breweryDevice` at 1280×800
touch and 1366×768 mouse, plus a regression sweep of the Brewery board on the device and of a
person's production pages. Matt pairs a device on DEV if he wants a hands-on pass (a reseed deletes
`[TEST-TEMP]` devices, so pair it after the last reseed).
