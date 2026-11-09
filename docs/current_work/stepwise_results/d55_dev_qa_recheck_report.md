# D55 QA recheck: fix cycle 1 (DEV)

- **Build:** `c3c3308c6a7deb517ae5e34d5353bdc3f5b99633` (`GET /api/health`, `env: dev`; ribbon `DEV · c3c3308`)
- **Date:** 2026-11-08 (America/Denver), about 17:10–17:45
- **Where:** DEV UI and API only. Prod was never touched.
- **Personas (stored sessions only, no password sign-ins):** owner, barMgr, breweryMgr, brewer1, brewer2, bartender1, bartender2, floater, splitRole, dualMgr, office1, sales1, noDept, taproomDevice, breweryDevice. The Brewhouse session works again.
- **Revoke-by-id rule:** followed.
  - No Revoke, Delete or Deactivate was clicked in the UI.
  - Tablet tokens and devices were revoked, deactivated and deleted only through `safeRevokeToken` / `safeDeviceUpdate` (`scripts/lib.mjs`). These read the device row back by exact id and refuse unless the device and token names start with `[TEST-TEMP]`. A test call against seeded token 1182 was refused.
  - Every other delete or deactivate went by exact id, after reading the row back and checking its `[TEST-TEMP]` name or note.
  - Shifts have no name. They were deleted only by ids taken from my own sweep's 201 responses, after checking date and position.
  - Seeded tablet tokens 1181 and 1182 are still active at the end.
- **Verdict:** **pass with gaps.** Every gap in fix cycle 1 is fixed. One new minor gap (14). Backlog gaps 12, 3 and 5 were not rechecked, as the brief says.

## Summary

| Gap | Was | Now | Result |
|---|---|---|---|
| 8 | must-fix | Category Sort Order `null`, `""` or left out → end; update `null`/`""` → end; left out → stays. UI Add Category with an empty Sort Order → 201 at the end; clearing it on edit → end, survives reload. | **fixed** |
| 9 | minor | Same rules for grain-bill rows and category fields (24/24 API checks). | **fixed** |
| 11 | must-fix | Q8 sweep rerun: 2054 requests, **0 × 500**. All 155 wrong-type body cases (`"abc"`, `1.5`, `true`, `[]`, `{}`) → 422 "is invalid" on the field. That includes fields that were ignored before (shift `department_id`/`user_id`, batch `recipe_id`, user `home_department_id`). Wrong-type query ids → 422. `user_id:"abc"` on time off and availability → 422. | **fixed** |
| 7 | minor | `memberships: null` on create → 422; left out → 201 with no roles. Out-of-range or wrong-type `department_id` inside → error reported on `memberships`. | **fixed** |
| 6 | should-fix | Duplicate department → 422 "names a department more than once", on create and update, as owner and barMgr. Nothing stored. | **fixed** |
| 13 | minor | Missing notification (8 id forms) → 404. barMgr marking owner's or bartender1's notification → 404, and theirs stays unread. Own notification → 200 and read. | **fixed** |
| 2 | should-fix | Mid-session `/api/me` 503 or offline → banner, recheck about every 10 s, then the banner clears and the board/time-off data reloads with no navigation. Hard cases in R3. | **fixed** |
| 10 | should-fix | Brand, recipe, ingredient or batch that names nothing (`99999`, a 20-digit id, `abc`) → "… not found" with a back link, and no spinner. | **fixed** |
| 4 | minor | Both tablets: `/messages/nope`, a trailing slash, a 20-digit id, `✓` → "Page not found". Real channels they can't open (managers, other departments' `dept:` channels) → "Not available". `dept:nope` → "Not available" (by design). | **fixed** |
| 14 | — | **New, minor:** a card's `list_id` that names nothing → 404, not 422. | open |

### Gap 14: minor: card with a missing list answers 404
- **Path:** barMgr `POST /api/idea_boards/bar/cards {"list_id":12345678|-1|0,"title":"[TEST-TEMP] q8"}`.
- **Expected (item 9):** 422 "does not exist" on `list_id`.
- **Observed:** 404 `{"error":"not_found","message":"Not found"}`. Nothing is saved. Wrong types → 422 ✔.
- **Note:** the first build behaved the same; I missed it in the first report.

### Notes, not gaps
- **Ignored fields:** shift `department_id`/`user_id`, batch `recipe_id` and user `home_department_id` take a well-typed id that names nothing (`12345678`, `-1`, `0`) and still return 201/200. The value is ignored, not stored; the same was true on the first build. Shifts use `position_id` and `assignee_id`.
- **List `position`:** an idea-board list's `position` accepts any type and is ignored. It isn't an id.
- **`department_id` inside memberships:** never accepted ("unknown department"). The API takes `department` as a key or a number. Same as the first build, so not a regression.
- **Tablet History:** History `?task_id`/`?card_id` on a tablet → 403 "Not available on a shared device", before the 422 check.

## Scenarios

| # | Result | Notes |
|---|---|---|
| R1 | PASS (gap 14) | Every fixed gap passes its original repro (table above). Gap 11 checked with the whole Q8 sweep (`results/r1_q8_sweep.txt`). |
| R2 | PASS | **Sort Order:** 2 saves at 2, 1 reorders to 1, and the list order follows. **Valid ids accepted:** shift create with `assignee_id`, unassign, a numeric-string assignee; time off and availability for my `[TEST-TEMP]` person (`user_id` as int or numeric string, stored on that person); a person with `department` memberships; a recipe ingredient (numeric-string `recipe_id`) and its update; a task with real `assignee_ids`; a card in a real list. **Notifications:** marking my own as read works. **Banner:** none in 48 s of normal use on the tablet or bartender1 (one `/api/me`). **403:** a page forced to 403 for 60 s was fetched twice, then left alone — no `/api/me`, no banner, still signed in. |
| R3 | PASS | Taproom tablet, writes blocked. **Slow:** `/api/me` hangs 40 s per call → banner at about 15 s, rechecks about every 20 s, recovers with data at 55 s. **Flapping:** 503, 503, 200 repeating for 60 s while the board 401s → banner stays, about 3 `/api/me` calls per 10 s (bounded), recovers. **Burst:** navigating three pages during the outage → 4 extra `/api/me` calls in 3 s, then normal; the board shows after recovery. **150 s on the banner:** `/api/me` every 10 s (16 calls), token kept, recovers in 10 s (`results/r3_banner_150s.png`). **Late 401:** `/api/me` 401 after an outage → "This tablet was unpaired". Never unpaired otherwise. |
| R4 | PASS | **Q3:** own `[TEST-TEMP] R tablet` paired in a fresh context. Revoked by id → next request unpaired, start-up unpaired on 4 paths. Second token, then device deactivated by id → unpaired. `[TEST-TEMP]` person deactivated → `active:false`, not on the roster. **Q4:** 48 URLs on both seeded tablets, same as the first pass, plus `/messages/bar` → "Page not found" (gap 4). Brewhouse "Go to Home" → `/tasks/brewery`; it shows Buy-a-Beer as "Not available" (Taproom page). **Q9:** pairing view; wrong staff code → "That staff code isn't right", no change; `[TEST-TEMP]` person's code → beer redeem 2 → 1, task "Mark completed" → done; Boards view-only; `/login` → "Personal logins not accepted"; 13 people × 15 pages: no sign-outs, no error banners, no JS errors, no 401/5xx; role-gated pages redirect Home as before. |

## Data made and cleaned

| Kind | Made | Cleanup |
|---|---|---|
| Device | 3646 "[TEST-TEMP] R tablet" (tokens 1195, 1196) | 1195 revoked by id; device deactivated, then deleted, by id |
| People | 3642 R person (staff code, used for Q9), 3643 R inactive, 3644, 3645 (Q6), 3647 R2 noroles, 3648–3650 (sweep) | all deactivated; 3642's staff code removed |
| Brewing | brand 2936, recipe 15 + its rows, ingredient 57, lot 43, categories 63–68 + fields, batches 4882–4884 | deleted |
| Scheduling | shifts 4304–4310; availability 250; time off 384, 385 on my person (auto-approved; no delete or cancel route for a manager) | shifts and availability deleted; time off 384, 385 **denied** (still listed as denied) |
| Boards | lists 270–280, card 448, tasks 111433–111435 | deleted |
| Buy-a-Beer | 3457 | deleted |
| Notifications | owner's 7511 marked read (R2 "own notification") | no undo; it was one of several duplicate "Re-subscribe" notices |

`scripts/verify.mjs` at the end: no leftovers apart from inactive people. Seeded sessions owner, barMgr, bartender1, brewer1, taproomDevice and breweryDevice all answer 200.

## What I couldn't test
- **A deactivated person's own session:** no password sign-ins, so this was checked through the owner API only.
- **Real network flakiness, or a real deploy mid-session:** simulated with `page.route`.
- **Installed-PWA update path:** Matt's manual check.
- **Backlog gaps 12, 3, 5, and gap 1 (by design):** not rechecked.
- **Message posting:** not swept, per "don't post messages".
