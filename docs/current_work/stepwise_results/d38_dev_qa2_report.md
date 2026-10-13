# D38 QA pass 2: fixes re-check (Brewery Task Board)

- **Tester:** Claude (independent QA, automated with personas)
- **Time:** 2026-10-12, 14:04–14:29 UTC (Colorado date 2026-10-12, so "today" = Mon 10/12, "yesterday" = Sun 10/11)
- **Target:** DEV only. UI https://rockcut-ui-dev.fly.dev, API https://rockcut-api-dev.fly.dev, build D38 `fcaba29` (as briefed; I did not check the build hash independently)
- **Method:** Node + Playwright 1.63 (Chromium, `timezoneId: America/Denver`), one browser context per persona loaded from `auth/<persona>.json`. Real UI flows for the user paths. Direct API calls were made with in-page `fetch` using the page's own token, and the token was never returned or logged. Every write request and response was logged to `results/*.log`, and those logs were grepped afterwards to confirm no tokens. Screenshots are in `shots/`, scripts in `scripts/`. Personas used: `breweryMgr`, `owner`, `brewer1`, `brewer2`, `floater`, `bartender1`.

## Result: **PASS with gaps**

G1, G3 and G4 behave as specified on every path I tried. The S24–S31 and S6–S9 regression checks pass, and so does phone width. The two gaps found are minor and sit next to the fixes, not in them.

## Gaps

### GAP-1 (minor): renaming a retired item from a stale Daily items dialog says "Not found", not "retired"
- **Path:** Edit Daily items (dialog A, open) → another manager retires item X → in dialog A, Rename X → Save name.
- **Expected:** a refusal that tells the user the item was retired, consistent with G3's `retired` error. The item stays retired.
- **Observed:** `PATCH /api/brewery/daily_items/<id> {"name":…}` → **404** `{"error":"not_found","message":"Not found"}`. The dialog shows "Not found" under the rename field (`shots/g1d_mgr_D5_after_save.png`). The item stays retired and unrenamed, so no data is harmed. Only the message is misleading. API-only, the same: `{"active":false}` on a retired item → 404 `not_found`.
- **Repro:** `scripts/g1_daily.mjs` scenario D5. `breweryMgr` opens Rename on a `[TEST-TEMP]` item, `owner` retires it, wait for a refresh, then `breweryMgr` clicks Save name.

### GAP-2 (minor): `PATCH` with only `position` on a retired item answers 200 and does nothing
- **Path:** `PATCH /api/brewery/daily_items/<retired id>` with body `{"position":1}` as `breweryMgr`.
- **Expected:** a refusal (422 `retired`, or 404 like a name change), not a silent success. This is the same shape as the original G3 defect, on a different field.
- **Observed:** **200** `{"data":{"active":false,…,"position":9}}`. Nothing changed and the item is still retired. The UI doesn't send this (reorder uses `PUT …/daily_items/order`), so this is API-only.
- **Repro:** `scripts/g3.mjs` (logged in `results/g3.log`).

### Observations (not gaps, for the lead's judgment)
- **O-1:** A stale **Edit task** dialog whose task another person deleted: Save → `PATCH` 404, an alert says "Not found", and the dialog stays open. Nothing is recreated, which is safe, but the wording could say the task was deleted (`shots/edge_E1_after_save.png`).
- **O-2:** The **Edit Daily items** dialog doesn't update its own list when the board refreshes (it keeps old names, retired items and the old order). Each action from it is still handled safely: a rename sends only the name, an unchanged rename sends nothing, and a reorder from the stale list is refused with "The list changed. Reload and try again", leaving the order unchanged (`shots/edge_stale_reorder.png`).
- **O-3:** An item that was ticked today and then retired can still be **unticked** (DELETE 204). After that it can't be re-ticked (`PUT` → 422 `retired`) and it disappears from today's card. So an accidental untick of a retired item can't be undone that day.

## G1: stale Edit dialog saves only changed fields

Setup: each scenario had its own `[TEST-TEMP]` task (initial notes "orig notes", assignee Jake, day +3). `brewer2` (B) opened Edit and made their change without saving. `brewer1` (A) then made their change through the UI Edit dialog and saved. All B pages went through at least one 60 s board refresh with the dialog still open (dialog visible = true). Then B saved. The server state was read back afterwards, and B's board was reloaded and the dialog reopened for S1.

| # | Check | Result | Evidence |
|---|---|---|---|
| S1 | Original path: A renames, B (stale) edits notes | PASS | B sent `{"notes":"B notes S1"}` only; server has A's title and B's notes; after reload B sees A's title and B's notes (`g1_S1_reload_reopen.png`) |
| S2 | A notes, B title | PASS | B sent `{"title":…}` only; server kept both |
| S3 | A assignee → Riley, B day | PASS | B sent `{"due_on":"2026-10-16"}`; server has Riley and 10/16 |
| S4 | A day, B assignee | PASS | B sent `{"assignee_id":1061}`; server kept both |
| S5 | Same field (title), B saves later | PASS | Server title = B's (later write wins) |
| S6 | B opens, changes nothing, Save | PASS | No request sent; dialog closed; A's rename kept |
| S7 | B changes title then changes it back, Save | PASS | No request sent; A's notes kept |
| S8 | B clears notes and assignee; A renamed | PASS | B sent `{"notes":null,"assignee_id":null}`; server notes null, assignee null, A's title kept |
| S9 | B ticks "No day (Future)"; A edits notes | PASS | B sent `{"due_on":null}`; task in Future with A's notes |
| S10 | A clears notes and assignee; B edits title | PASS | B sent title only; notes and assignee stay cleared |
| E2 | A completes the task; B (stale) saves notes | PASS | B sent notes only; task still done, "✓ Jake" |
| E3 | A moves the day (API); B (stale) saves title | PASS | Server keeps A's day and B's title |
| E1 | A deletes the task; B (stale) saves | PASS (see O-1) | 404, "Not found", nothing recreated |
| D1 | Daily rename, same item: `owner` renames, then stale `breweryMgr` renames | PASS | Mgr sent `{"name":…}` only; mgr's name kept (later wins) |
| D2 | Daily rename: owner renamed; mgr Save name with field unchanged | PASS | No request; owner's name kept |
| D3 | Daily rename: mgr changes the name then changes it back, Save | PASS | No request; owner's name kept |
| D4 | Owner reorders an item; stale mgr renames it | PASS | Mgr sent name only; owner's position (7) kept |
| D5 | Owner retires an item; stale mgr renames it | PASS, msg minor | Refused, stays retired; message "Not found" (GAP-1) |

## G3: re-activating a retired item is refused

| Check | Result | Evidence |
|---|---|---|
| `breweryMgr` retires a `[TEST-TEMP]` item via UI (confirm dialog "Retire [TEST-TEMP] G3 item? Past ticks are kept.") | PASS | `PATCH {"active":false}` 200; removed from active list |
| `breweryMgr` `PATCH {"active":true}` | PASS | 422 `{"error":"retired"}`; still retired |
| `breweryMgr` `PATCH {"active":true,"name":…}` | PASS | 422 `retired`; name unchanged, still retired |
| `breweryMgr` `PATCH {"active":"true"}` (string) | PASS | 422 `retired` |
| `owner` `PATCH {"active":true}` | PASS | 422 `retired` |
| `brewer1` `PATCH {"active":true}` and with a name | PASS | 403 (not 422) |
| `floater`, `bartender1` `PATCH {"active":true}` | PASS | 403 |
| `brewer1` PATCH on an active item and POST a new item | PASS | 403 / 403 |
| Name-only or `{"active":false}` PATCH on a retired item | PASS, msg minor | 404 `not_found`, nothing changes (GAP-1) |
| `{"position":1}` PATCH on a retired item | Minor gap | 200, no change (GAP-2) |
| Add a new item with a retired item's name | PASS | 201 (a new item; the retired one is untouched) |
| No un-retire path in UI | PASS | Edit Daily items lists active items only; no restore control |

## G4: past days show only items that existed that day

| Check | Result | Evidence |
|---|---|---|
| Item added today: **today** shows it and counts it | PASS | "Daily 1/10" with the new row |
| **Yesterday** doesn't show it | PASS | "Daily 3/4", 4 default rows only |
| **A week back** doesn't show it | PASS | "Daily 0/4", 4 rows |
| **Tomorrow** shows it, all rows disabled | PASS | "Daily 0/10", every checkbox disabled |
| `brewer1` ticks it today via UI | PASS | `PUT …/daily_checks/2026-10-12/44` 200; row "— Jake, 8:20a"; 2/10 |
| API tick yesterday / a week back | PASS | 422 `not_yet_added` "That Daily item wasn't on the list that day" |
| API tick tomorrow | PASS | 422 `future_day` |
| Untick today, then retire → today doesn't show it | PASS | Today back to "1/9" without the row |
| Tick today, then retire → today still shows it ticked and counts it; tomorrow doesn't show it | PASS | Today "2/10" with "— Jake, 8:21a [x]"; tomorrow 0/9 (`g4_today_retired_ticked.png`) |
| Ticking a retired, unticked item today | PASS | 422 `retired` |
| S26: yesterday 3/4 is amber, ticking the 4th works | PASS | 3/4 orange (rgb 230,81,0); tick → "4/4", normal colour, "— Jake, 8:21a"; kept after reload; then unticked to restore 3/4 (`s26_yesterday_3of4.png`, `s26_yesterday_4of4.png`) |
| Stale board shows a refusal message | PASS (staged) | Staged by injecting an item added today into yesterday's card in `brewer2`'s board response, then clicking it: server 422 `not_yet_added`, the board shows an alert "That Daily item wasn't on the list that day", and the box stays unticked (`g4_stale_refusal.png`). I couldn't stage a real across-midnight board inside this window. |

## Regression (S24–S31, S6–S9) and phone width

| Check | Result | Evidence |
|---|---|---|
| Tick/untick today shows the name and time | PASS | "Gravities — Jake, 8:27a"; untick clears it |
| Tick/untick a past day (yesterday) | PASS | See S26 above |
| Tomorrow disabled (desktop and phone) | PASS | All tomorrow checkboxes disabled; API 422 `future_day` |
| Add Daily item (UI) | PASS | POST 201, row appears on today and later days |
| Rename Daily item (UI) | PASS | PATCH with name only |
| Reorder (Move up) | PASS | `PUT /daily_items/order` with the full id list; new order shown |
| Retire with confirm; Cancel keeps it | PASS | Cancel → still active; Retire → removed |
| "Up to 12 items" | PASS | 13th add refused in UI ("Up to 12 items"); API 422 `too_many_items` |
| "Already on the list" (case and space insensitive) | PASS | "backups", "  Temps  " → "Already on the list"; rename to "pressures" → same message |
| Edit Daily items is manager-only | PASS | `brewer1` has no board ⋮ menu; API 403 |
| Board access | PASS | `floater` sees the board; `bartender1` is sent to Home and gets API 403 |
| Task add, edit, complete ("✓ Jake"), uncomplete, delete (with confirm) as `brewer1` | PASS | POST 201 / PATCH title-only / complete / uncomplete / DELETE 204; gone after reload |
| Phone 360×800 `hasTouch`: board | PASS | No horizontal scroll (scrollWidth 360); day tabs; Daily card readable (`phone_board.png`) |
| Phone: tap-tick on the Daily card | PASS | 28 px checkbox; tap ticks and unticks with the name and time |
| Phone: tap card → menu → Edit dialog | PASS | Dialog 296 px wide, all fields and Save visible, no overflow; Save works (`phone_edit_dialog.png`) |
| Phone: Edit Daily items dialog | PASS | Fits within 360 px, scrolls inside; long names wrap (`phone_daily_items_dialog.png`) |

## Not covered
- Real across-midnight stale board (simulated with a staged response instead, as above).
- The task-menu shortcuts "Add notes" and "Change day…" weren't exercised from a stale board. G1 was checked through the Edit dialog only.
- Ticking as `floater` (checked board access only).

## Cleanup
- **Tasks:** all 17 `[TEST-TEMP]` tasks deleted (ids 318–334). A final scan of −30…+31 days, Unfinished and Future finds 0 `[TEST-TEMP]` tasks.
- **Daily items:** all `[TEST-TEMP]` items retired (ids 37–48). The active list is exactly Backups, Gravities, Temps, Pressures at positions 1–4, as I found it.
- **Ticks:** test ticks on default items were undone. Yesterday (10/11) is back to 3/4 (Jake ×3, Pressures unticked) and today (10/12) to 1/4 (Backups by Riley).
- **Couldn't clean up:** the 12 retired `[TEST-TEMP]` Daily item records (ids 37–48). Retiring can't be undone or deleted in this release. They don't appear on any card because none has a tick left. No personas, memberships or passwords were changed.
