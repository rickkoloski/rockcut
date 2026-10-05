# D35 QA report: calendar feed links reset when someone leaves (DEV)

- **Tester:** independent QA agent (Claude), acting only as the synthetic personas and `[TEST-TEMP]` throwaways
- **Time:** 2026-10-04, about 23:18–23:33 UTC
- **Target:** DEV only. UI https://rockcut-ui-dev.fly.dev, API https://rockcut-api-dev.fly.dev, build D35 `bf0cba6`. Prod hosts were not touched.
- **Method:** Node + Playwright (Chromium) scripts in this folder (`s1.mjs`, `s2.mjs`, `s11.mjs`, `l3.mjs`, `l4d.mjs`, `s15.mjs`, `ui1.mjs`, helpers in `lib/`). API calls run inside persona pages with the page's own token. Feed links were compared inside the script: "changed/unchanged", plus the HTTP status of the old link and the new link, fetched from the API host. Notifications were diffed per persona by notification id. Observers in every scenario were `owner`, `owner2`, `barMgr`, `dualMgr`, `splitRole`, `breweryMgr`, `bartender1` and `office1`, plus the throwaway where it had a session. Raw results are in `results/`, screenshots in `shots/`. Feed links are redacted on screen before every screenshot.
- **Note: `splitRole` (Rowan Split) is also a Taproom manager.** It is not in the brief's S2 list. It correctly received every Taproom notification.

## Result: **PASS with gaps**

The core D35 behaviour passed in every scenario run: which feeds rotate, old links return 404, new links return 200, who is notified, one notification per change, opt-out, and no notification for the person leaving. The gaps below are in the re-subscribe path, in combined edits and in wording.

## Gaps

1. **must-fix: the "new link" the notification sends people to does not work as a calendar subscription.**
   - Path: bell → "Re-subscribe…" → Schedule / Calendar sync → copy the Taproom link.
   - Expected: an ICS URL on the API host (`https://rockcut-api-dev.fly.dev/api/calendar/<token>.ics`), as the brief states.
   - Observed: the dialog builds the link as `window.location.origin + path`, so it shows `https://rockcut-ui-dev.fly.dev/api/calendar/<token>.ics`. That URL returns `200 text/html` (the SPA's index.html), not a calendar. The same path on the API host returns `200 text/calendar`. Checked with a real current feed (bartender1's "My shifts") and with a bogus token (UI host 200 HTML, API host 404). Google, Apple or Outlook given the copied link would get HTML and never an event.
   - Repro: sign in as any persona → `/schedule?calendar_sync=1` → copy any link → fetch it.
   - This is probably older than D35. It still directly breaks the D35 user story: "remove the old calendar and add the new link".

2. **minor: one Users & Roles save that removes the owner flag and changes memberships sends two notifications.**
   - Path: the UI save sends `PATCH /api/users/:id` and then `PUT /api/users/:id/memberships`. I reproduced exactly that sequence by API.
   - Case L4a: the throwaway is an owner and Taproom manager. In one save, the owner flag comes off and the Taproom manager role is changed to employee.
   - Observed: two rotations and two log rows. `owner`, `owner2` and `dualMgr` each got **2** notifications: Brewery/Office/Other/Sales/Whole schedule first, then Taproom (for dualMgr, Office then Taproom). `barMgr`, `splitRole` and `breweryMgr` got 1.
   - Expected (spec §3): one notification per change.

3. **minor: in a combined save, the owner flag is removed before memberships are applied, so a link can be reset needlessly.**
   - Case L4d: the throwaway is an owner and Taproom employee. In one save, the owner flag comes off and they are made Taproom manager, so they never lose Taproom.
   - Observed: Taproom is reset as well (all 5 department feeds plus Whole schedule, reason `lost_access`). barMgr, splitRole and dualMgr were told to re-subscribe to Taproom, and the person still has the new Taproom link.
   - Expected: everything except Taproom changes.

4. **minor (wording): the notification body has singular/plural mismatches.**
   - "The link for Taproom changed because someone who could see **them** no longer works here. If you subscribed to **these**…". With several feeds it reads "The **link** for Office and Taproom changed…".
   - The S11 variant says "…no longer has access to **them**".
   - It is also long: about 160 px tall per item at 390 px width (`shots/D1-barMgr-bell-phone.png`). Three departures in a row stack three identical items.

5. **minor: the User change log's "Calendar links reset" row has an empty Detail column.**
   - Path: Owner → Admin → User change log.
   - Observed: the row shows When / "Calendar links reset" / By / Affected user, and Detail is blank. The API row has `detail.feeds` and `detail.reason` (`departed` / `lost_access`), but the UI does not show which links were reset or why (`shots/G-change-log-1280.png`).
   - No link or token appears in the page (checked at 1280 and 390 px).

6. **minor, probably older than D35: owner-flag changes are not visible in the change log.**
   - Removing `is_owner` logs `user.updated` with `fields: []` (S13). In L4a it logged `["active","name","schedulable"]` with no `is_owner`.
   - The adjacent "Calendar links reset" row is the only trace.

7. **observation, outside D35 scope: a manual reset in Calendar sync breaks every co-manager's subscription silently.**
   - barMgr pressing the reset icon for Taproom (`POST /api/calendar_feeds/rotate`) gave Taproom a new link and made the old one 404.
   - Nobody was notified (owner, owner2, dualMgr, splitRole: 0) and nothing was logged.

## Scenarios

| # | Result | Evidence |
|---|---|---|
| S1 | PASS | Throwaway employee deactivated by owner: only their own "My shifts" changed (old link 404). Department and whole-schedule feeds unchanged. 0 notifications anywhere. Log: "Calendar links reset" with feeds `[user]`, reason departed. |
| S2 | PASS | Taproom changed (old 404, new 200). Throwaway's own feed old link 404. owner, owner2, barMgr, dualMgr and splitRole got 1 each, naming Taproom. breweryMgr, bartender1 and office1 got 0. Brewery, Office, Sales, Other and Whole schedule unchanged. The body does not name the person. |
| S3 | PASS | Office and Taproom changed. dualMgr got 1 listing "Office and Taproom". barMgr and splitRole got 1 listing Taproom only. Owners got 1 listing both. breweryMgr got 0. |
| S4 | PASS | All 5 department feeds plus Whole schedule changed (old 404, new 200). owner and owner2 got 1 listing all six. barMgr Taproom, dualMgr Office+Taproom, splitRole Taproom, breweryMgr Brewery: 1 each. Employees 0. |
| S5 | PASS | barMgr deactivated a throwaway Taproom manager (200). Taproom changed. barMgr (the actor) was notified, as were owner, owner2, dualMgr and splitRole (1 each). breweryMgr 0. Log actor is Casey Tap. |
| S7 | PASS | Reactivating S2's person: no feed changes, 0 notifications, only `user.updated` logged. Deactivating them again rotated Taproom and notified again, as expected. |
| S8 | NOT RUN | No safe setup: making a throwaway the last active owner would mean demoting `owner` and `owner2`, which is forbidden. Proxy for spec item 6: barMgr deactivating a Brewery-only manager was refused (403). Nothing changed, nobody was notified, nothing was logged. Note that an owner deactivating **themselves** is not refused (throwaway owner, 200) and rotates everything. |
| S10 | PASS | barMgr bell → clicked "Re-subscribe…" → `/schedule` with Calendar sync open. The dialog shows the current Taproom link (it matches `GET /api/calendar_feeds`), and the notification is marked read. Clicking again while already on /schedule reopens the dialog. See gap 1 for the link host. `shots/A2-…`, `shots/D2-…` |
| S11 | PASS | Throwaway Taproom manager → employee: Taproom changed. Their own "My shifts" unchanged and the throwaway got 0 notifications. Others got "…no longer has access to them". Log reason `lost_access`. |
| S12 | PASS | Office manager role removed and Taproom kept: only Office changed. dualMgr and owners got 1 ("Office"). barMgr and splitRole got 0. The throwaway got 0. |
| S13 | PASS | Owner flag removed from a throwaway owner who manages Taproom: Brewery, Office, Other, Sales and Whole schedule changed, Taproom unchanged. Owners got 1 listing those five. dualMgr got Office, breweryMgr got Brewery. barMgr, splitRole and the throwaway got 0. |
| S14 | PASS | Employee → Taproom+Office manager, then → owner: no feed changed, 0 notifications. The throwaway now sees all 7 feeds. |
| S15 | PASS | Throwaway Taproom manager A, in the bell → gear dialog: the "Calendar link changed" row defaults to In-app on, Email off, SMS "—", Push on. A turned In-app and Push off (server stored `calendar_feed_rotated: {in_app:false, push:false}`, barMgr's prefs untouched). Then manager B left: A got 0 notifications of any kind, and the others got 1 each. `shots/S15-*` |

## LIMITATIONS items

1. **Bell navigation side effects:** clicking an `open_shift` notification (no `url`) marks it read. The URL stays `/` and the menu stays open: no navigation. Events present in persona inboxes: `calendar_feed_rotated` (has `url`), `open_shift` and `seed.welcome` (neither has a URL). No `message_posted` notifications exist; in-app delivery for messages is off by default. The bell only navigates on a `data.url` starting with "/", so message notifications without a URL would only be marked read. I saw nothing navigate unexpectedly.
2. **Deep link `/schedule?calendar_sync=1`:**
   - Opened directly as owner (7 feeds), bartender1 (My shifts only) and noDept (My shifts only): the dialog opens and the query string is removed.
   - At phone width (390 px) from the bell: works, no horizontal overflow (`shots/D1`, `D2`).
   - `taproomDevice`: no dialog, no "Calendar sync" text, no bell (`shots/F-…`).
   - Signed out: the login page keeps the URL. After sign-in and the forced first-time password reset, the user lands on `/schedule` with the dialog open.
3. **Several changes in a row:** 3 Taproom managers deactivated concurrently. Each event sent its own notification (3 for owner, owner2, barMgr, dualMgr and splitRole; 0 for the others) and produced 3 "Calendar links reset" log rows. The original Taproom link returns 404. One shared current link is identical for all four managers and returns 200. Nothing broke. The repeated identical items are noisy in the bell (gap 4).
4. **Combined edits:**
   - Deactivate + rename + membership change in one save (L4b): one rotation (reason departed, Office+Taproom) and 1 notification each. The later membership PUT on the now-inactive user rotated nothing. **OK.**
   - Deactivate + owner-flag removal in one PATCH (L4c): one rotation of everything, 1 notification each. **OK.**
   - Owner-flag removal + membership change in one save: **notified twice** (gap 2), or **rotated needlessly** (gap 3).
5. **Manager deactivating someone in a shared department:**
   - barMgr deactivates a Taproom employee who manages Brewery (L5): allowed. Brewery is reset and owner, owner2 and breweryMgr are notified. barMgr (the actor) is correctly not notified, because Taproom did not change.
   - barMgr deactivates a Taproom+Office manager (L5b): Office and Taproom are reset. dualMgr gets one notification listing both, and only people with access were notified.
6. **Wording and layout:**
   - Bell at phone width: the text wraps cleanly within the 90vw menu, but each item is long (gap 4).
   - Change log at 390 px: the grid truncates the Affected user email and Detail is empty (gap 5). "Calendar links reset" wording is fine.
   - The notification body never names the person who left.
   - **Push and email delivery were not verified** (no push subscription or mailbox available). Only the preference defaults were checked: Email off, Push on.

## Housekeeping and disclosures

- **30 `[TEST-TEMP] QA D35 …` throwaways** were created (ids are in `temps.log`). All 30 are deactivated, which reset feeds again as expected.
- No spare `bartender2` sessions were used: no scenario signed out or revoked a persona session. The one throwaway session signed in through the UI was ended with `DELETE /api/session`.
- No persona's memberships, owner flag, active state or password were changed. I verified this at the end.
- **Token disclosure:** my first exploratory call (`probe1.mjs`) printed the `path` field of owner's `GET /api/calendar_feeds` to my own console. That field contains the feed token. Nothing was written to any file or screenshot.
  - All six department/whole-schedule links in that output were rotated later by the tests, so the old ones return 404.
  - Owner's own "My shifts" link would not otherwise have rotated. I reset it with the Calendar sync reset action (`POST /api/calendar_feeds/rotate`); the old link now returns 404.
  - Later scripts hash or hold feed paths in memory only.
- `barMgr` manually reset the Taproom link once (gap 7 test). Its notifications in the bell were also marked read by the click tests.
- No credential outside the brief was requested.
