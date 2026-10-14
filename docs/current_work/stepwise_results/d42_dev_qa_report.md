# D42 QA report: task board follow-ups (DEV)

- **Tester:** independent QA (Claude Code, Opus 5.5), personas from `auth/`
- **Time (UTC):** 2026-10-14 16:54 – 17:30
- **Target:** https://rockcut-ui-dev.fly.dev / https://rockcut-api-dev.fly.dev, D42 `cb59d3b` (prod was not touched)
- **Method:** Node + Playwright, Chromium, timezone `America/Denver` (today is Wed 2026-10-14). API calls were made from inside the page with the page's own token (never printed). UI flows used the real dialogs. Route names and test IDs came from the deployed JS bundle only. Scripts are in `scripts/`, logs in `results/`, screenshots in `shots/`.

## Result: **PASS with gaps** (no must-fix found; 2 minor)

## Gaps

1. **Minor: Daily item "ever ticked" is treated as "has ticks now".**
   - **Path:** `breweryMgr` adds a `[TEST-TEMP]` item, ticks it on 10/14, unticks it, retires it, then calls `DELETE /api/boards/brewery/daily_items/<id>`.
   - **Expected (spec item 4):** an item that was ever ticked has only Restore, and DELETE returns 422 `has_ticks`.
   - **Observed:** DELETE returns 204. The UI offers Delete, and its confirm says "It was never ticked, so no day's Daily checks change", which is false. History still shows the Ticked and Unticked lines.
   - **Repro:** `results/s127_133.log` (item "tick-untick").
2. **Minor: a move with a non-existent `before_id` succeeds silently.**
   - **Path:** `floater` sends `POST /api/boards/brewery/tasks/<id>/move` with `{due_on: today, before_id: 99999999}`.
   - **Expected:** 404, the same as for another board's task id.
   - **Observed:** 200 and a no-op; neither board changed.
   - **Repro:** `results/s124.log`.

These are observations, not gaps:
- **A retired item ticked today stays on today's card.** Today's Brewery card showed 2/5 after the ticked item was retired (by design: "Past ticks are kept"). A retired item also can't be unticked (422 `retired`).
- **History wording differs.** It says "Deleted the Daily item '[TEST-TEMP] Typo'" with quotes, but "Retired the Daily item [TEST-TEMP] Typo" without them.
- **Re-tapping "All days" on the phone jumps to the top.** If you tap it while already in the all-days view, the board scrolls to the top instead of staying on today (emulated).

## Scenarios

| # | Result | Evidence |
|---|---|---|
| S121 | PASS | `newhire`: `GET /api/boards/bar/tasks` gave 403 `password_reset_required`; `POST /api/beer_board` gave 403; `GET /api/me` gave 200 |
| S122 | PASS | Throwaway user (id 1553): a write before the reset gave 403; after setting the password in the UI, the same write gave 201 |
| S123 | PASS | Sign-in showed "Set a new password". Wrong current password, mismatch and same-as-temp were each rejected with a clear message. Afterwards the Tasks board loaded and `must_reset_password` was false (`shots/s123-*`) |
| S124 | PASS | Using a Taproom id as `before_id` gave 404 in all 4 variants (today, null/Future, another day, reverse direction, string id); snapshots of both boards were unchanged |
| S125 | PASS | "No one scheduled" shows on exactly the days the API flags with `no_one_scheduled: true` (10/18–10/27); the raw key never appears (`shots/s125-*`) |
| S126 | PASS | Add, Retire, Retired list with Delete, confirm, and the item is gone. History reads "Deleted the Daily item…". Day counts for 10/1–10/31 were unchanged (`shots/s126-*`) |
| S127 | PASS | Ticked once (UI) then retired: Restore only, no Delete. API DELETE gave 422 `has_ticks` (`shots/s127-*`). See gap 1 for the tick-then-untick case |
| S128 | PASS | DELETE on an active item gave 422 `not_retired`. On a Taproom item, `/bar` gave 403 and `/brewery` gave 404, active or retired. Employee DELETE gave 403 |
| S129 | PASS | After "Just this one" notes on #3, it is not an exception. A "following" title+notes edit from #2 gave #3 the new title, and it kept its own notes. Stop repeating then offered "Remove 5, keep the 1 changed on its own", and keeping it worked |
| S130 | PASS | #3 kept its own title after a "following" title edit. A later "following" notes edit also skipped it |
| S131 | PASS | Split weekly to monthly from 11/11. Edit series… on the early part with Ends → Never confirmed "Extends the series." (no "Removes"). The monthly part stayed monthly and runs to 2027-10-11 (~12 months); the weekly part was unchanged |
| S132 | PASS | Until 1/27 → After 5 times via Edit series… confirmed "Removes 11 later occurrences." and left 5. The same change via a "following" edit gave the same result. Changing back to until confirmed "Extends the series." and restored 16 |
| S133 | PASS | At 12 active items, Add and its input are disabled, and Restore is disabled, both with "Up to 12 Daily items. Retire one first." The API refuses a 13th item or a restore with 422 `too_many_items` (`shots/s133-*`) |
| S134 | PASS | Brewery set to 2 weeks + Hide completed; Taproom kept its own (2 weeks, hide off; later 1 week, Monday). Each kept its own across switches and back/forward |
| S135 | PASS (set up by hand) | With D41 shared keys set before the first load, each board started from them and copied them into its own keys; boards then diverged independently. Older `rockcut.breweryTasks.*` keys also carried over. Phone view `day` carried over too |
| S136 | PASS | Monday showed 10/12–10/18 with 10/12 and 10/13 dimmed (opacity 0.6). On a past day, add, tick (planned/today/both dialog), untick, open/edit, Daily tick and untick (restored), and drag all worked. Next went to 10/19–10/25, Today came back, and the setting survived a reload |
| S137 | PASS | Sunday with 2 weeks showed 10/11–10/24; Next went to 10/25–11/07; Today returned to 10/11–10/24; Prev went to 9/27–10/10 |
| S138 | PASS | All departments kept Monday while Brewery stayed Today. An All card on past day 10/12 opened Brewery at 10/12–10/25 with that day in range; 10/16 and 10/18 also opened in range |
| S139 | PASS (emulated) | Picking Monday in the calendar dialog showed 10/12–10/25, scrolled to today (today at top). One-day view opened on Wed 10/14 and survived a reload |
| S140 | PASS | With Monday set, typed ranges 10/15–10/22 and 10/08–10/16 showed exactly as typed; Next moves by the typed span |
| S141 | PASS | Split Wed→Thu at the 6th, then Wed→Fri from the 3rd. Every part shows "Repeats every week on …, 10 times" in both Edit and Edit series…; 10 in total |
| S142 | PASS | Same split, then Ends → 12 times from the Thursday part confirmed "Extends the series.": 12 in total, Thursday rule unchanged. Then 8 times confirmed "Removes 4": 8 in total, every part shows 8 |

## LIMITATIONS

1. **Reset gate across the app: no gap.** As `newhire`, about 60 reads and writes returned 403 `password_reset_required`. Areas covered: schedule, shifts, time off, availability, channels and messages, notifications and preferences, users, roster, departments, positions, calendar feeds, push, owner activity, brewery modules, beer board, boards, daily checks, and publish endpoints. Path tricks (trailing slash, `//`, `..`, HEAD) were also refused. Only `/api/me`, `/api/session` and `/api/session/password` answered (the password route answered 400 to an empty body, so nothing changed). In the UI, every route showed only "Set a new password" plus Sign out, and the only API call was `GET /api/me`. Note: one `DELETE /api/sessions/others` was sent by mistake as `newhire`; it returned 403, so nothing happened.
2. **Old split series: NOT RUN.** I found no pre-D42 split series on DEV. New splits were tested in S131, S141 and S142.
3. **Ends-only and keep/remove wording: no disagreement found.** Every confirm matched what happened (Removes 11 → 11 gone; Removes 4 → 4 gone; "Extends" → extended). One wording point: on a rule split, "Removes N later occurrences" doesn't mention that new occurrences are generated under the new rule. For example, S141's "Removes 7" was followed by 8 new Friday occurrences, so the total stayed 10.
4. **First day across weeks, months and the year boundary: no gap.** Checked the month boundary (10/25–11/07), the year boundary (typed 12/27–1/09; Next 1/10–1/23; Prev ×2 12/13–12/26), `?day=2027-01-01` (Sunday mode gave 12/27–1/09; Monday mode gave 12/28–1/10), `?day=` on a past day, and switching span inside Sunday mode.
5. **Dimmed past days: nothing was blocked.** Tick, untick, open, edit, add, Daily tick/untick and drag (past→past, past→future, future→past) all work.
6. **Fast board switching: no mismatch.** A per-frame sampler during 6 rapid Brewery/Taproom switches never showed one board's content with another board's settings. The URL leads the render by about one frame, which is harmless.

## Cleanup

- Every `[TEST-TEMP]` task and series was deleted. The final cleanup checks found nothing left.
- `[TEST-TEMP]` Daily items: all deleted, including the ticked S127 item, which I restored, unticked (my own tick), retired and deleted. The Brewery is back to its 4 seed items (today 1/4), and Taproom has no Daily items.
- The past-day Daily tick on 10/13 (Temps) was unticked again.
- Throwaway user 1553 (`temp-e2f1ccfa@rockcut-test.com`) was deactivated.
- Nothing is left that I couldn't clean up. Persona browser settings were per-context only, so none persisted.
