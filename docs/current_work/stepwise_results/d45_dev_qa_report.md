# D45 QA acceptance report (DEV)

| | |
|---|---|
| Tester | Claude (independent QA agent), for matthewheiser |
| Time | 2026-10-16, 14:27–15:04 UTC (08:27–09:04 America/Denver) |
| Target | DEV only: https://rockcut-ui-dev.fly.dev, https://rockcut-api-dev.fly.dev. Build confirmed on every page load: `<html data-build="d45-e6d05d6-3">`. Prod was not touched. |
| Method | Node 20 + Playwright 1.63, Chromium headless, `timezoneId: America/Denver`. One browser at a time, closed at the end of each script. Personas loaded with `storageState: auth/<key>.json`. API calls were made from inside the page with the page's own token, and no token was ever returned or logged (I scanned `results/` and `scripts/` for `ses_`, `dev_` and `Bearer`: none found). Long waits used Playwright's clock (`install`, `runFor`, `fastForward`). Screen off/on was simulated by overriding `document.visibilityState` and firing `visibilitychange`. Scripts are in `scripts/`, logs in `results/`, screenshots in `shots/`. |

## Result: **PASS with gaps**

Every D45 scenario I could run passes (S179–S188), and so does every LIMITATIONS check. I found no must-fix issue and nothing that looks like a D45 regression. The two gaps below are minor and look older than D45.

## Gaps

| # | Severity | Path | Expected | Observed | Repro |
|---|---|---|---|---|---|
| G1 | minor | Deep link `/tasks/taproom` (owner) | Opens the Taproom board, or shows "not found" | Silently redirects to `/tasks/brewery`. The Taproom board's real key is `/tasks/bar`, and the switcher uses that. A hand-typed or shared "taproom" link lands on the wrong board with no message. Probably older than D45. | As `owner`, open `https://rockcut-ui-dev.fly.dev/tasks/taproom` → you land on `/tasks/brewery` (`results/s185.log`, nav #22→#23 and #37→#39). |
| G2 | minor | Notification preferences → **Enable push** in a browser where push can't subscribe (e.g. incognito/private window) | A message saying push can't be turned on here | Nothing visible happens. The button stays "Enable push", and the page throws an unhandled `AbortError: Registration failed - permission denied` (Chrome logs "does not support the Push API in incognito mode"). In a normal profile it works (see LIMITATIONS 1). This is D21 behaviour, not D45. | As `brewer1` in a Playwright default (incognito-like) context with notifications granted: bell → Notification preferences → Enable push (`results/push3.log`). |

Not a gap, just for the record: on the phone's **One day** view, the top Previous/Next move the whole 2-week range. The day stepper (`Previous day` / `Next day` and the day stops) moves one day at a time. That's existing behaviour, not D45.

## Scenarios

| # | Result | Evidence |
|---|---|---|
| S170 | NOT RUN (lead-verified) | Needs a deploy. Related check without a deploy: a fresh `brewer1` browser loaded once, sat 15 s plus several screen off/on cycles, and showed **no bar** and no reload (`sw1.log`, `check-fires2.log`). |
| S171 | NOT RUN (lead-verified) | Needs a deploy. |
| S172 | NOT RUN (lead-verified) | Needs a deploy. |
| S173 | NOT RUN (lead-verified) | Needs a deploy. Related check: as `breweryMgr`, a half-filled Add task dialog kept its text and stayed open through a screen off/on, which ran the update check; no reload, no bar. Closed with Cancel, nothing saved (`sw4.log`). |
| S174 | NOT RUN (lead-verified) | Needs a deploy. Related check: an idle `taproomDevice` on the shared screen got 4 real minutes plus 30 simulated hours, and the update check did fire (`update()` counted). Exactly **1** document load, no bar (`idle-taproomDevice.log`, `check-fires2.log`). |
| S175 | NOT RUN (lead-verified) | Needs a deploy. Related check: a tablet screen off/on calls `update()` at once; with nothing new it doesn't reload (`check-fires2.log`). |
| S176 | NOT RUN (lead-verified) | Needs a deploy. Related check: throwaway person used "Sign in as me" on `breweryDevice`, plus a screen off/on, and got no reload. After their SIGN OUT, and separately after the 5-minute idle auto-return, the tablet went back to the shared screen and then stayed put for 30 simulated hours (`temp2.log`, `temp3.log`). |
| S177 | NOT RUN (lead-verified) | Needs a deploy. |
| S178 | NOT RUN (lead-verified) | Needs a deploy and a real push delivery. Push enable/disable was checked instead (LIMITATIONS 1). |
| S179 | PASS | `brewer1` → View Schedule: From `2026-10-16`, To `2026-10-22`. Only Fri Oct 16 and Sat Oct 17 are listed (the only published days in range). API calls were `from=2026-10-16&to=2026-10-22` (`viewsched.log`, `shots/S179-viewschedule-default.png`). |
| S180 | PASS | After setting To to `2026-11-16`: Home and back → 10-16/10-22. Browser back/forward → 10-16/10-22. Page reload → 10-16/10-22. |
| S181 | PASS | Clearing both dates queries `/api/shifts` with no dates and lists Mon Oct 12 → Sat Oct 17 (this week's seed shifts, starting at the first published shift). Clearing only one date also works: From-only shows from 10-16 on, To-only shows up to 10-22. From after To shows nothing, with no error. |
| S182 | PASS | `taproomDevice` → View Schedule: 10-16 to 10-22, same days (`shots/S182-tablet-viewschedule.png`). |
| S183 | PASS | `owner` → Scheduler: week grid Oct 12–18, "THIS WEEK", columns 12 Mon…18 Sun, no date-range inputs (`shots/S183-owner-scheduler.png`). |
| S189 | NOT RUN (lead-verified) | Needs a `v2026.10.15` client. Related check: every fresh browser loaded D45 exactly once (one navigation request, one document load) with no reload loop. |
| S184 | PASS | `brewer1`, Brewery board, range 10/12–10/25, Hide shifts on. 0 person lines, 0 open-shift lines, 0 "No one scheduled". The event days keep their event: Wed 10/14 shows "Brew day: Hazy IPA · All day", and Mon 10/19 shows the `[TEST-TEMP]` event-only day. The other 12 days have **no header box**. It also stayed correct with My tasks, Hide completed, 1 week, and after a reload (`s184.log`, `shots/S184-on*.png`). |
| S185 | PASS | `owner`: Brewery on, reload → still on. Switch to Taproom → off, with 15 shift lines showing. Back to Brewery → on. Turning Taproom on and Brewery off keeps them independent; Office and Sales default to off. Saved as `rockcut.tasks.hideShifts.<board>` in localStorage. A fresh browser for the same person starts off, so it is per browser (`s185.log`). |
| S186 | PASS | `brewer1` at 412×915 (mobile, touch). The switch sits in the phone toolbar with nothing overflowing sideways. **All days** view: no shift lines, and event day 10/19 keeps its event. **One day** view: 10/16 (people), 10/17 (only an open shift) and 10/18 ("No one scheduled") have no header box; 10/19 shows only its event. Turning it off in One day brings the lines back. The setting survives a reload and a resize to desktop (`s186.log`, `s186b.log`, `shots/S186-*.png`). |
| S187 | PASS | `owner` → All departments (`/tasks/all`): no Hide shifts switch, no "Hide shifts" text, no day headers (`shots/S187-all-departments.png`). |
| S188 | PASS | `taproomDevice` → Tasks (`/tasks/bar`): turned on, lines hidden. Still on after a reload, after Home → Tasks, and in a second tab of the same browser. Turned back off at the end (`s188.log`). |

## LIMITATIONS checks

**1. Service-worker change: nothing found.**
- Fresh load: one navigation request, `/sw.js` active and controlling, no bar after 15 s. (Playwright reports two `framenavigated` events per load; that's the client router, not a second network load.)
- Reload and hard reload (CDP `ignoreCache`): the app loads every time, with no loop. After a hard reload the page isn't SW-controlled, as expected; the next navigation is controlled again.
- Deep links, each followed by a reload: `/tasks/brewery`, `/tasks/brewery?from=…&to=…`, `/messages/all`, `/schedule` for `brewer1`, and `/scheduler`, `/tasks/all`, `/messages/all` for `owner`. Each gave exactly one document load per navigation. `/scheduler` for brewer1, `/no-such-page` and `/admin` go to Home (permissions or unknown route; the shared-devices admin page is `/devices`).
- Second tab: loads fine; the first tab doesn't reload and shows no bar.
- Sign out and in, with the throwaway person:
  - First sign-in leads to "Set a new password", then Home.
  - Log out lands on "Sign in to continue" with no reload loop over 8 s.
  - A reload while signed out, and a signed-out deep link to `/messages/all`, both show the sign-in form.
  - Signing in returns to `/messages/all`.
  - A second tab after signing back in is fine (`temp1.log`).
- Offline (SW installed): a reload or a navigation to `/tasks/brewery`, `/`, or `/messages/all` shows the app shell ("Can't reach the server, retrying… / TRY NOW"), not the browser's error page. Back online, it recovers on its own without a reload (`shots/L1-offline-*.png`).
- Phone width 412×915: same results for the fresh load, deep links plus reload, screen off/on, and offline/online (`sw4.log`).
- Push enable/disable: in a persistent (non-incognito) profile, signed in as the throwaway person:
  - Enable push → `POST /api/push/subscriptions` 201, "Push is enabled on this device", subscription present.
  - The subscription survives a reload.
  - Disable → `DELETE` 204, subscription gone (`push5.log`).
  - The temporary profile was deleted afterwards. Persona tokens can't be loaded into a persistent profile without opening the auth files, which is why I used the throwaway person.
- Update check: `ServiceWorkerRegistration.update()` is called on every screen off/on and again after a simulated 25 h, for a person and for a tablet. With nothing new, **no bar ever appeared** in any run.

**2. Shared tablets never reload by themselves: nothing found.** The idle `taproomDevice` had 1 document load across 4 real minutes plus 6 × 5 h fast-forwards and a screen off/on. The `breweryDevice` shared screen after "Sign in as me" and its auto-return had no extra loads over 30 simulated hours. The one extra load in that run comes from the deliberate return to the shared screen, which is a single load.

**3. View Schedule dates: nothing found.** Using the fake clock, all 11 cases gave the expected today → today+6:
- 23:59:30 MDT
- 00:00:30 MDT
- 17:59 and 18:01 MDT (the UTC date rollover)
- Oct 27 (across the month end and DST end)
- Oct 31 23:30
- Nov 1 00:30 MDT and 23:30 MST
- Feb 25 (non-leap year)
- Mar 8 01:30 (spring forward)
- Dec 28 (year end)

Leaving the page open across midnight and reopening it gives the new day (10-17 to 10-23). The device timezone doesn't matter: UTC, Los Angeles and Tokyo devices all showed the Colorado date (`vsclock.log`, `vstz.log`).

**4. Hide shifts edge cases: nothing found.**
- Fast switching through the board menu (9 switches about 120 ms apart): the setting ends correct for the board you land on.
- Fast switching by URL (5 aborted navigations), plus back/forward: the board title and the switch state always match.
- Phone views: covered in S186.
- Day with only an event (10/19): only the event line shows.
- Day with only open shifts (Sat 10/17): the header box is removed.
- Day with an event plus people (10/14): only the event shows.

## Put back (rule 4)

- **Themes:** I never changed one. At the end, `brewer1`, `owner` and `breweryMgr` show Light selected. In Admin → Shared devices, both the Brewhouse tablet and Taproom tablets show Theme Light.
- **Tablets:** both are still signed in on their shared screens. The only SIGN OUT I clicked was the throwaway person's personal-session SIGN OUT. The personal session is stored separately from the device token.
- **Created and removed:**
  - All-day Brewery event "[TEST-TEMP] QA event-only day" on Mon 10/19 (id 17163). Published through `PATCH status: published` on that event only, so DEV staff may have had an event notification. **Deleted** (200); none remain.
  - Throwaway person "[TEST-TEMP] QA D45 sign-in" (`temp-1303663d@rockcut-test.com`, id 1864). **Deactivated** (`active: false`). Its generated password was kept only in the session scratchpad and has been deleted.
  - Hide shifts settings live in each test browser's localStorage, which was thrown away when the browser closed. I also turned them back off.
- **Not touched:** no tasks saved (the half-filled Add task dialog was cancelled, and no `[TEST-TEMP]` items are on `/tasks/brewery` 10/01–11/30 or on `/tasks/all`). No Daily ticks, no Scheduler staff order, no Brewery Daily items. No persona was signed out, deactivated, demoted or had its password changed. `newhire` and `auth/spares.json` weren't used, and no credential beyond the brief was needed.
- **Couldn't put back:** nothing. The only lasting traces are the deactivated throwaway person (deactivated as the brief instructs) and any notification the temporary event may have sent.

## Lead note (2026-10-16)

G1 → task **4318**, G2 → task **4319** (both low, older than D45); Matt
accepted both for the backlog. The prompt scenarios (S170–S177, S189) were
verified by the lead on DEV with three UI deploys (v41–v43): a profile on the
old build reloaded itself into D45 once; a person's browser showed the bar and
Reload moved it to the next build; an idle Taproom tablet reloaded itself 16 s
after the screen-wake check, with no taps. Automated: `PWA_UPDATE=1` 10/10.
