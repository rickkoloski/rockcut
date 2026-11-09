# D50 QA report: brewhouse device on the production schedule

- **Build:** `67c6629a22b9156d4cc44304fc012b210c2f31b5` (`/api/health` sha and ribbon `DEV · 67c6629`)
- **Environment:** DEV only (rockcut-ui-dev / rockcut-api-dev). Prod was not touched.
- **Date:** 2026-11-08, about 21:50–23:15 America/Denver
- **Sizes:** 1280×800 with touch (`hasTouch`, taps, long-press via CDP touch events) and 1366×768 with a mouse. Each result says which size(s).
- **Personas used:** `breweryDevice`, `taproomDevice`, `owner`, `breweryMgr`, `brewer1`, `brewer2`, `bartender1`.
- **Coded people made for this run:** TT-brewer A, TT-brewer B (Brewery), TT-taproom (Taproom), TT-owner (owner flag set by `owner` via PATCH; code set).

**Verdict: pass with gaps.** No must-fix found. Every scenario Q1–Q14 passed. I found 1 should-fix and 3 minor gaps.

## Summary

| Severity | Count | Gaps |
|---|---|---|
| must-fix | 0 | none |
| should-fix | 1 | 1 |
| minor | 3 | 2, 3, 4 |

## Gaps

### Gap 1: should-fix: a Taproom person's valid code is called "not right" and counts toward the shared lockout (Q6)
- **Path:** Brewery device → any Gantt change (step Notes → Save) → code dialog → TT-taproom's correct code. Also Flags → Mark OK, and the API directly.
- **Expected:** refused, nothing changes, the dialog stays open. Those parts all work. The person should be told why: they aren't in the Brewery.
- **Observed:** the message is "That staff code isn't right" (`422 staff_code_invalid`, the same as a mistyped code), and each try counts as a wrong code. About 6 tries by the Taproom person (my API and UI checks) locked the seeded Brewhouse tablet for 10 minutes ("Too many wrong codes. Try again in 10 minutes."), for everyone, on the Gantt and the board. A Taproom person who knows their code is right will retry, and that locks out the brewers.
- **Repro:** on `breweryDevice`, open any step, change Notes, Save, enter a Taproom-only person's code about 5 times → 429 lockout.
- **Size:** both (1366×768 mouse and 1280×800 touch), and the API.

### Gap 2: minor: template Save isn't all-or-nothing when the server refuses one of two picked links (Q12)
- **Path:** breweryMgr → `[TEST-TEMP]` template → Edit PDH → pick "Add: comes after" = Lag and "Add: leads to" = Set temp - 32° → Save.
- **Expected:** "A failed Save links nothing."
- **Observed:** Save sends `PATCH step`, then one `POST …/links` per picked link. I made the server refuse the second link: the error shows and the dialog stays open, but Lag → PDH is already saved. Pressing Save again then posts only the missing link, which is graceful. A Save the server refuses outright (for example a day before the step it follows, `422 link_order`) correctly links nothing.
- **Note:** I could only make the second link fail by intercepting its response (a simulated 422). The pickers don't offer a link the server would refuse, so in real use this needs a race, such as two managers editing at once or a dropped connection. Save also takes 2 s or more. A reload during that time kept the step change but lost both links.
- **Size:** 1366×768 mouse.

### Gap 3: minor: "Take off the task list" hides the step from the Gantt, with no way back on the list (Q10)
- **Path:** Brewery board → linked task → Delete → "Take off the task list? It stays on the production schedule." → Take off (with a code).
- **Expected:** the step stays on the production schedule.
- **Observed:** the server keeps the step (`on_task_list:false`) and the batch dialog still lists it, but its dot disappears from the Gantt. So its step dialog, the only place with "Show on the Brewery task list", can't be opened, and I found no way to put it back on the list. The same happens on a person's (breweryMgr's) Gantt, so this isn't device-specific; D50 is what made it reachable from the device.
- **Repro:** take off `#907 · Set temp - 58°` from the board, reload Production, look for `gantt-step-<id>`.
- **Size:** both (taken off at both sizes; Gantt checked at 1366×768).

### Gap 4: minor: removing a tank condition mark is one tap, with no confirmation (Q8 extras)
- **Path:** Brewery device → Gantt → tank's out-of-service button → History → "Remove: Marked … by …".
- **Expected:** like deleting an out-of-service period or a CIP: a confirm step (those both have one).
- **Observed:** one tap deletes the mark straight away. While someone's 5-minute window is open, no code is asked either. Undo is available for 2 minutes. On a shared tablet the Remove buttons for different people's marks sit next to each other in one list. This is how my own script deleted a seeded mark (see "Incident" below).
- **Size:** 1280×800 touch.

## Incident during testing (my error, fixed)
- In the Q8 condition-mark check, after removing **my** `[TEST-TEMP]` mark, my script looked for a confirm button that never appeared (gap 4). It matched the next "Remove" button in the same History list and deleted the seeded mark on **Serving 3**: "Clean & sanitized · Fri Nov 6 · Jake Brewer · [SEED] Hosed and sanitized after the gasket job" (id 402), under TT-brewer B's window.
- **Restored** within about a minute as `brewer1` (Jake Brewer) with the same state (`clean`), date (2026-11-06) and note. Serving 3's status line is the same as before ("Sani 2 days"). **What differs:** the mark id is now 406 (was 402) and `inserted_at` is 2026-11-09T05:40Z. If anything depends on the seed's id, reseed.
- I also locked out the seeded Brewhouse tablet twice (10 minutes each): once by accident through the Taproom-code checks (about 22:27–22:38) and once on purpose for Q6 (about 23:05). Both expire on their own.

## Scenarios

| # | Result | Size(s) | Notes |
|---|---|---|---|
| Q1 | PASS | – | Health sha 67c6629a…; ribbon `DEV · 67c6629`. |
| Q2 | PASS | both | Gantt, step, batch, tank expand, flags and Task list all open with no code and no writes. Plan batch Save, step Check off and flag Mark OK open "Who's making this change?" before any request. |
| Q3 | PASS | both | Drag → code dialog → move prompt (Apply/Undo) → `steps/move` with `staff_code`. "Acting as …" banner. A second change doesn't ask. Done ends it. Idle: still active at 4 min, activity resets the timer, gone at 5.5 min, then asks again. Simulated 30-minute tablet sleep: the window ends on the next touch. Block move: Shift-click (mouse) and long-press then tap (touch) moved PDH and FDH together. |
| Q4 | PASS | both | Planned a scheduled batch (mouse) and a pencilled one (touch). Check-off on the pencilled one → "Schedule this batch first" → Schedule. Notes, assignee, check off (shows "Done … by TT-brewer A · on Brewhouse tablet"), Mark not done, tank (Ferment in), Add step, transfer, split, Undo split. All asked for a code first. P-numbers and linked tasks appear on the Brewery board. Dragging the split parent moves all parts. |
| Q5 | PASS | both | After A's Done, B's code on Undo → "Only [TEST-TEMP] can undo this.", nothing changed, B not left acting; A's code undoes. brewer2 → "Only Jake can undo this." (403); brewer1 undoes; a second undo → 404. Undo from another tab works for the owner only. After 2 minutes → "It's too late to undo that." |
| Q6 | PASS (gap 1) | both | Taproom code refused at both sizes, dialog stays open, field cleared, nothing changed. Real lockout: wrong codes alternating Gantt, board, Gantt, board, Gantt → the 5th returns 429. Then A's correct code is refused on both the Gantt and the board, and nothing changed. The lock counts down (10 → 3 → 1 min) and correct codes don't extend it. |
| Q7 | PASS | both | Sign-off with A (touch) and the owner's code (mouse) → "Signed off by … · on Brewhouse tablet · …" (server `device_name: Brewhouse tablet`). Remove sign-off within the window works. API: Taproom code 422, no code 422. |
| Q8 | PASS (gap 4) | both | Tanks, Templates (list and editor) and Phases & steps show "Read only on a shared device. Set up on a personal account." with no edit controls and no enabled inputs. 20 setup API routes (tanks, phases, step types, templates, template steps and links, duplicate, reorder, delete) → 403 "Not available on a shared device" with and without a code; my template unchanged. Out-of-service add, edit and delete (with its confirm) with a code. Also: condition mark and CIP add/remove with a code. |
| Q9 | PASS | both | Typed `/brewery`, `/brewery/production`, `?from=…`, `/tanks`, `/templates`, `/templates/1112` → "Not available on a shared device"; other sub-paths → Page not found. 25 production API routes → 403, even with a valid code. The Brewery board API also returns 403. No Brewery nav. |
| Q10 | PASS (gap 3) | both | Board linked tasks: check off → code → batch-number prompt → move prompt → recorded as A on Brewhouse tablet (#907, #908). Un-check restores the batch, dates and P-number. Change day (with move prompt), Edit → assignee, Add notes, Take off the list, Move up: each asked a code with the window ended. Gantt agrees after reload. Board API without a code → 422. |
| Q11 | PASS | Gantt and board touch, admin mouse | Off for the `[TEST-TEMP]` device: its board drops all 65 "Planned batch" tasks and its Task list shows 0, while the Gantt still shows the pencilled bar and P7. Seeded Brewhouse tablet and every person's `show_planned_batches` unchanged. On again: all back. breweryMgr PATCH → 403, and their /devices page has no checkbox. The device can't change itself (403). |
| Q12 | PASS (gap 2) | both | "Add: comes after" and "Add: leads to" picked, then Save (not Link) → linked, kept after reload, and the row reads "after Brew day · …; after Fermentation · …". Links sit above Notes. Server refusal (`link_order`) shows the error and links nothing. Pickers offer only earlier/later days as appropriate. |
| Q13 | PASS | manager mouse, device touch | Add comes after (Link), leads to (via Save), change default answer, Remove (with confirm), Undo restores the same link. Saved after reload. The move prompt follows the new links (a "Stays" link makes "Move only PDH" the default). Pickers offer only the batch and its split tree, never later days. API refuses loops, self links (`link_cycle`), later-day comes-after (`link_order`), other batches, seeded batches and other split trees (`link_other_batch`), for both manager and device. Sibling split parts can link. |
| Q14 | PASS | mouse; Taproom touch | breweryMgr and brewer1: Gantt, step dialog save, batch dialog (Add step/ramp/transfer/Split), Plan batch (pencilled) and setup pages with edit controls, no code asked, no device banner. bartender1: /brewery/production goes to home; API 403. Taproom tablet: Add a task and check off with a code; Buy-a-Beer add and redeem with a code. |

## Other observations (not gaps)
- **Edge auto-scroll while dragging:** a 1-day drag that ends near the right edge of the Gantt moved 5–6 days (the chart scrolls under the pointer). The move prompt shows the real distance and its Undo cancels cleanly, so nothing was saved by mistake. Mouse.
- **Ctrl-click** doesn't multi-select in Chrome on macOS (it acts as a right-click; no click event fires). Shift-click works. On touch, a second long-press *replaces* the selection, while a tap adds to it.
- **Dragging one split part** moves only that part, on device and person accounts alike. Dragging the parent moves the whole tree.
- **P-numbers re-sort by brew date** whenever a batch is planned, brewed or deleted (P8 became P9 and back). Expected per the "real number is set when brew day is checked off" note, but scripts and people tracking P-numbers should know.
- **Slow writes:** check-off with renumbering and template Save took 2–6 s. Closing the page early meant the change never happened (no partial save seen, except gap 2's link case).
- The banner and undo messages show only the first word of the name ("Acting as [TEST-TEMP]", "Only [TEST-TEMP] can undo this."). That's my naming; real first names read fine.
- Deleting a template retires it (`retired_at` set); it isn't removed.

## Data made and cleaned
| Item | Id(s) | Cleanup |
|---|---|---|
| People `[TEST-TEMP] TT-brewer A`, `TT-brewer B`, `TT-taproom`, `TT-owner` (with staff codes) | 3732, 3733, 3734, 3735 | Deactivated by exact id; owner flag removed |
| Brand `[TEST-TEMP] D50 QA Ale` | 3153 | Deleted (204) |
| Batches P7/#908, P8/P9 + split parts, P8/#907, X2 (breweryMgr pencilled) | 5199, 5200, 5201, 5202, 5203, 5206 | Split undone, #907 un-brewed, all deleted; no board leftovers |
| Template `[TEST-TEMP] D50 link template` (duplicate of [SEED] Standard ale) | 1115 | Delete retires it: retired 2026-11-09T06:11Z |
| Shared device `[TEST-TEMP] D50 QA brew device` + one pairing (`[TEST-TEMP] QA tablet`) | 3736 | Deleted (204); seeded devices unchanged (show planned batches on, light theme) |
| Out-of-service period on Serving 3 (Feb 1–4 2027) | 714 | Deleted |
| CIP on Serving 3 (Feb 10 2027) | 70208 | Deleted |
| Condition mark on Serving 3 | 405 | Removed |
| Flag sign-offs on `unsanitized_fill:5199.0` (A, then owner) | – | Removed; the flag left with its batch |
| Taproom task `[TEST-TEMP] QA taproom task` | 118077 | Deleted by exact id |
| Buy-a-Beer entry `[TEST-TEMP] QA guest` | 3528 | Redeemed, which removes the entry (GET → 404) |
| Seeded Serving 3 mark deleted by my script | 402 → 406 | Restored (see Incident) |
| Notes on `#907` steps | – | Went with the batch |

No messages were posted. No seeded persona, device, theme or setting was changed. Scripts are in `scripts/`; screenshots and `q3_idle.out` are in `results/`.

## What I couldn't test
- Real hardware: the brewhouse tablet, an installed PWA, a real touch screen and its on-screen keyboard (Matt's check). Touch was Playwright/CDP touch events on desktop Chromium.
- Ctrl-click multi-select on Windows/Linux (I only had macOS Chrome).
- An exact race where one person's window closes *while* another types a code. I covered idle expiry, Done, a simulated sleep (clock jump), and B's refused undo not leaving B acting.
- The owner's code on a Gantt drag in the UI. The owner's code was checked on flag sign-off in the UI; an API move with it was blocked by the accidental lockout at the time.
- Whether lockout is per device or shared across devices; only the Brewhouse tablet was locked.
- A genuine (unsimulated) server refusal of the second link in a template Save (gap 2).
