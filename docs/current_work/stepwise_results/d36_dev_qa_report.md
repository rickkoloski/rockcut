# D36 QA report: backlog sweep + time-off conflict fix (DEV)

- **Tester:** independent QA agent (Claude), synthetic personas only
- **Time (UTC):** 2026-10-05 03:00 to 03:40
- **Target:** https://rockcut-ui-dev.fly.dev / https://rockcut-api-dev.fly.dev (build under test D36 `aafff58`; prod hosts not touched)
- **Method:** Node + Playwright (Chromium, headless) scripts in this folder; personas loaded from `auth/*.json`; browser timezone America/Denver; API calls made from inside the page with the page's own token; spare `bartender2` sessions (indexes 0 to 7) used for every sign-out test; throwaway `[TEST-TEMP] QA …` people and a `[TEST-TEMP] QA tablet D36` shared device created for L, G, H and I. Real time used for G (6.5 min, three real tabs); `page.clock` used for I and the tablet idle variant of H; `context.setOffline` for offline. Screenshots in `shots/`, raw logs in `results/`. No tokens or pairing codes were printed or saved.

## Result: **PASS with gaps**

All 16 brief scenarios pass. I found 4 minor gaps at the edges (none must-fix), plus 2 observations.

## Gaps

### G-1 (minor): an overnight Sunday shift that runs into Monday time off is not flagged
- **Path:** `barMgr` → Scheduler, week Oct 5 to 11. A `[TEST-TEMP]` bartender has approved timed time off **Mon Oct 12, 01:00 to 06:00**. Add a shift **Sun Oct 11 22:00 → Mon Oct 12 03:00**.
- **Expected:** a warning ("approved time off then"), because the shift overlaps the time off from 01:00 to 03:00.
- **Observed:** no warning anywhere. The Add-shift dialog, the chip (no red outline, no tooltip), the edit dialog and the banner count all stay silent. The Scheduler loads time off with `GET /api/time_off?from=2026-10-05&to=2026-10-11`, and that range leaves out time off on Monday the 12th. `to=2026-10-12` does return it (checked through the API). The week of Oct 12 does not list the shift, because the shift starts on the 11th. So no view ever shows this conflict.
- **Repro:** see above. Evidence: `shots/wk1-QAXO-grid.png` (the 10:00 PM card has no outline) and `shots/_TEST_TEMP_XO2_overnight_weekend-dialog.png`. The same root cause applies to all-day time off on the Monday.
- **Note:** the opposite case works. An overnight Sat → Sun shift that runs into Sunday time off in the same week is flagged (`XO1`).

### G-2 (minor): tablet header wraps at the common Samsung phone widths (≤384 px)
- **Path:** `taproomDevice`, shared screen, viewport 384×800 or 360×780 (or 320).
- **Expected:** the header stays on one line with no overlap (brief C).
- **Observed:** at 412 px it passes. At 384 px and below, the **"SIGN OUT"** button wraps onto two lines (button height 54 px against 31 px, header height 55 px against 49 px). The logo's right edge also touches the device pill with no gap (logo 52 to 80, pill starts at 80 at 360 px). The pill text gets cut to "Shared …".
- **Repro:** `node ccheck.mjs 360x780` / `node imgb.mjs`. Evidence: `shots/C1-taproomDevice-360x780.png`, `shots/C1-taproomDevice-320x640.png`.

### G-3 (minor): a channel page loads forever when `/api/channels` fails
- **Path:** `bartender1` → `/messages/dept:bar`, with `/api/channels` answering 500 or failing at the network level (`page.route`).
- **Expected:** an error message or retry state, or the crash screen with Reload.
- **Observed:** "Messages · Loading…" stays up for good (watched for 45 s, 6 retries). There is no error and no Reload button. The tablet behaves the same way. There is no false "Channel not found" flash. A slow (4 s) channels reply resolves correctly.
- **Repro:** `node jlong.mjs`, `node jrace.mjs`. Evidence: `shots/J-channels500-45s.png`.

### G-4 (minor): malformed nav replies take down the whole shell on some pages
- **Path:** `barMgr`, `/api/channels` → `{"data":null}`, then open `/messages` or `/messages/dept:bar`.
- **Expected (brief J):** "the app still renders; any crash shows Reload".
- **Observed:** Home renders fine with `{"data":null}`, `{}` or `{"data":{...}}`. On the Messages pages, though, the same reply hits the top-level boundary. The sidebar and header disappear and only "Something went wrong · Reloading usually fixes it · RELOAD" is left. The same full-screen crash comes from `channels {"data":[null]}` on Home, `notifications {"data":{...}}` on Home, and `{"data":null}` for roster/positions/shifts/time_off on the Scheduler, `/time_off` and `/schedule`. Every crash does show Reload and none is blank, so the letter of J is met. The Messages page just doesn't tolerate the nav-list case that J calls out.
- **Repro:** `node jcheck.mjs`. Evidence: `shots/J-channels_null_messages.png`, `shots/J-channels_null.png`.

### Observations (not scored as gaps)
- **O-1, H retry only at start-up/online:** if Logout gets a server error while the network is up (`DELETE /api/session` → 503), the token stays in the pending list. The session stays valid (**200 after 60 s**) until the app is reopened or an `online` event fires. A tab left open on a shared desktop keeps that session alive indefinitely, and the old token sits in `localStorage` until then. Reopening the app does end it (401). This matches the brief's wording. (`node h.mjs g2 7`; spare session 7 was left in this state and is still valid.)
- **O-2, tablet + unknown channel:** `taproomDevice` → `/messages/nope` shows "Not available on a shared device", not "Channel not found". That is acceptable, but slightly misleading for a channel that doesn't exist.
- `/messages/all/extra` silently redirects to Home (catch-all route). This is outside B's channel-key route; noted only.

## Scenarios

| # | Result | Evidence |
|---|---|---|
| L1 | PASS | 09–12 time off, 17–22 shift: no dialog warning, no outline or tooltip, banner count unchanged (2 → 2) |
| L2 | PASS | 11–15 shift: dialog, tooltip and edit dialog all say "Assignee has approved time off then"; red outline; banner +1 |
| L3 | PASS | all-day Tue, 17–22 shift: "Assignee has approved time off that day" in all three places |
| L4 | PASS | time off ends 12:00, shift 12:00–16:00: no warning anywhere |
| L5 | PASS | Mon 15:30 → Wed 12:00 time off, Tue 10–14 shift: "then" warning; grid shows "Off from 3:30 PM / Off / Off until 12:00 PM" |
| L6 | PASS | pending 09–12 (filed by the employee), shift 10–14: no warning. After the manager approves it, the warning appears (banner 6 → 7) |
| A1 | PASS | `/live/websocket` and `/live/longpoll` → 404 (GET, POST and WS upgrade); crawl of 15 routes plus detail pages as owner: 121 API calls, 0 ≥400, no websocket opened, no page errors |
| B1 | PASS | `taproomDevice` `/messages/managers` → "Not available on a shared device", "Go to home" → `/` |
| B2 | PASS | `bartender1` `/messages/nope` → "Channel not found", "Go to Messages" → `/messages/all`; no redirect |
| C1 | PASS | 412×915: header 49 px, single row, no horizontal scroll; pill "Shared device" (no dept); button text "SIGN IN", accessible name "Sign in as me" (see G-2 for narrower widths) |
| D1 | PASS | `HEAD /manifest.webmanifest` → `application/manifest+json` (also with br encoding); CDP `Page.getAppManifest` parses with no errors; `getInstallabilityErrors` = []; service worker active |
| E1 | PASS | `bartender1` `POST /api/schedule_event_series/<all-draft id>/extend` → 404 (same as a nonexistent id); `brewer1` 404; manager 200. After one occurrence was published, bartender → 403 |
| G1 | PASS | real time, 3 real tabs: activity in tab A only for 6.6 min, tabs A/B/C all still signed in, last-activity age ≤ 15 s throughout. Control run with no activity: all three tabs return to the shared screen at about 5 min |
| H1 | PASS | spare session: offline Logout → login screen, server still 200, pending list 1 → online → 401, pending 0. Also passes when the tab is closed right after an offline Logout and the app is reopened (401) |
| I1 | PASS | `page.clock`: email typed, at 4:30 the form is still there, at 5:30 the shared screen is back; on reopen email and password are empty. Same at 412×915 mobile with the field focused |
| J1 | PASS | `/api/channels` → `{"data":null}`: Home renders with nav; crashes elsewhere show "Something went wrong" + Reload, never blank (see G-4) |

**Counts: 16 PASS, 0 FAIL, 0 NOT RUN.**

## LIMITATIONS items: what I found

1. **D (nginx):** the header is correct on the real DEV nginx, both plain and brotli. The manifest is linked from `index.html`, Chromium parses it with no installability errors, and the icons (`pwa-192`, `pwa-512`, `maskable-512`) serve as `image/png`. A real Android install prompt wasn't tested (headless).
2. **A:** the API serves everything the app uses. No 4xx/5xx across all routes and detail pages as owner, and no LiveView/websocket connections were attempted. `/api/health` → 200.
3. **G and H with real tabs and network:**
   - G: I used three real Playwright tabs in one context in real time (tab B open before sign-in, tab C opened after). All three pick up the personal session and stay alive from tab-A-only activity. Without activity, all three time out together at about 5 min.
   - H: these all reached **401**:
     - offline Logout, then online (`online` event);
     - offline Logout + immediate tab close + reopen;
     - online Logout + tab closed about 60 ms later (keepalive), without reopening;
     - offline Logout + reload while offline + online;
     - DELETE answering 503 or hanging 8 s (the UI moves on after about 3 s), then reopen;
     - two tabs, offline Logout in A, A closed, online with B open (B retries).
   - Tablet person, real "Sign in as me": both a manual Sign out while offline and an **idle auto sign-out while offline** reach 401 once the tablet comes back online, and the tablet stays paired.
   - Caveat: Playwright's offline emulation let some requests through after a reload or close (in two variants the token was already 401 before the "reopen" step), so those variants confirm the outcome but not that the retry path ran. The gap in retrying while the network is up is O-1.
   - Hidden-tab throttling wasn't reproduced (headless tabs count as visible). I faked a hidden-then-visible tab for I instead (I6: it returns to the shared screen after 6 min hidden).
4. **L against real data:**
   - **DST:** passes. All-day time off on Sun Nov 1 is stored as 06:00Z → 06:59Z on Nov 2 (a 25-hour day, correct), and a Nov 1 23:15–23:45 shift warns "that day". All-day time off on Mon Nov 2 does not flag that Sunday-night shift.
   - **Different week:** passes when the time off starts in an earlier week. Timed time off Fri Oct 9 18:00 → Tue Oct 13 12:00 flags a Mon Oct 12 shift, and all-day time off Oct 16 to 19 flags a Mon Oct 19 shift.
   - **Fails when the time off is in the next week and an overnight shift runs into it:** see **G-1**.
   - **Overnight:** Sat 20:00 → Sun 02:00 into Sun 00:00–08:00 time off is flagged. An overnight shift starting on an all-day day (Thu 22:00 → Fri 02:00) is flagged. A shift starting at 00:00 the day after an all-day time off is not flagged (correct).
   - All three warning surfaces (Add dialog, chip outline and tooltip, edit dialog) agreed in every case, and the banner count matched the number of outlined shifts.
5. **I with the on-screen keyboard:** at a 412×915 mobile/touch viewport with the field focused, the form returns to the shared screen at 5:30 and the fields are cleared.
   - A tap at 4:00 resets the timer.
   - Typing once a minute keeps the form open past 7 min.
   - Cancelling and reopening the form 10 min later works (the old idle time isn't reused).
   - A reload clears the email.
6. **Side effects:**
   - Messages: the list opens on `/messages/all`, and a real channel (`dept:bar`) opens for both the person and the tablet (read-only).
   - From "Channel not found", the sidebar channel link works and Back returns to the not-found page.
   - A slow `/api/channels` reply doesn't flash "Channel not found". Normal navigation across 15 routes showed no error boundary.
   - Remaining issues: G-3 and G-4.

## Cleanup
- 14 `[TEST-TEMP]` shifts were deleted. The `[TEST-TEMP] E1` event series (53 drafts) was deleted.
- 13 `[TEST-TEMP]` time-off entries were set to denied, because a manager can't cancel them (403) or delete them (404).
- The `[TEST-TEMP] QA tablet D36` device was deleted, which revokes its tablet tokens.
- 13 `[TEST-TEMP] QA …` people (ids 580–589, 591–593) were deactivated.
- Spare `bartender2` sessions 0–6 are signed out. Session 7 is still valid (O-1). No persona was changed, and `taproomDevice` and `bartender2` still answer `/api/me` 200.
- No credential was requested beyond the brief.
