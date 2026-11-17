# D44 builder brief — Stage 1 (API)

2026-11-16 · lead → builder.

**Read first:** `docs/current_work/specs/d44_scheduler_time_off_dialogs_spec.md` (answered) and
`docs/current_work/planning/d44_time_off_plan.md`. This brief covers **plan Stage 1 only**. Stop
after it and report; Stage 2 (UI) comes as a separate brief.

**Where:** `~/src/rockcut`, branch `d44-time-off` (already checked out; don't switch). Commit your
work on it in small commits (`feat: D44 …`), staging paths by name. No push, merge or rebase. The
lead owns the servers; Stage 1 needs only `mix test`.

## Do

1. **"Past" in one place** (`lib/rockcut_api/time_off.ex`): a request is past when the Colorado day
   of `ends_at` is before today (Colorado). Add `past?/1` and a query helper for "ends on or after
   the start of today, Colorado". Reuse the Colorado-midnight helper `Scheduling` already has (see
   around `scheduling.ex:487`); expose it if it's private rather than writing a second one. Don't
   change the existing `from`/`to` filters.
2. **List filter:** `GET /api/time_off?when=current|past`. `current` = not past (keep the existing
   order), `past` = past, newest first by `starts_at`. No `when` = unchanged. Any other value → 422.
3. **Past is read-only:** `TimeOff.review/4` and `TimeOff.cancel/2` refuse a past request with
   `{:error, :past}` → 422 `"This time off has already passed"` in the controller. The check comes
   after the authorization check (a stranger still gets 403).
4. **`time_off_requested`** (spec §2.5): after a successful **own** create (status pending), notify
   every person who could review it, except the requester: active, non-device users for whom
   `Authz.can?(user, :review, req)` is true. Build the candidate set cheaply (owners + managers of
   the requester's departments), then filter with `Authz.can?` so the list can't drift from the
   rule. One notification per person. Nothing for an on-behalf create.
   Payload `%{title, body, data: %{url: "/time_off"}}`. Title e.g. "Sam Pour requested time off";
   body: type, dates and times or "All day" (Colorado), and their note if any. Look at how
   `messaging.ex` and `calendar_feeds.ex` build payloads and copy their style.
5. **`time_off_reviewed`** (spec §2.7): after a successful review (approved or denied, including
   denying an approved request), notify the requester, unless the reviewer is the requester. Title
   e.g. "Your time off was approved" / "…was denied"; body: type, dates, who decided, and
   `reviewer_note` if any. `data.url` `/time_off`.
6. Add both events to `Notifications.@events` (normal defaults, no `@event_defaults` entry).
   Delivery is best-effort: a notification failure must not fail the create or review (check how
   `notify` already behaves and keep it that way).
7. **Badge count** (spec §2.6): `pending_time_off` in the `/api/me` capabilities
   (`accounts.ex` near `pending_owner_reviews`) = count of requests that are `pending`, not past, and
   visible under `TimeOff.list_for/2`'s visibility (own + people the user manages; owners all).
   Do it as a count query, not by loading rows. `Authz.Device.capabilities/1` gets
   `pending_time_off: 0`.
8. **Tests** (ExUnit, both a refusal and an allowed case for every rule):
   - `when` filter: current/past split, a request ending 23:59 Colorado today (current) and
     yesterday (past), a request ending today early-morning UTC that is still yesterday in
     Colorado, an unknown value (422), no param (unchanged).
   - review and cancel of a past request → 422; of a current one → still works; a stranger on a
     past one → 403.
   - `time_off_requested` recipients for a request by `bartender1` (both bar managers incl.
     `dualMgr`/`splitRole` if fixtures mirror them, owners; not `breweryMgr`, not the requester,
     no devices, no inactive owner); a manager's own request reaches the other reviewers but not
     them; an on-behalf create sends nothing. Assert one notification per recipient and that the
     recipient set equals the `Authz.can?(_, :review, req)` set over all fixture users.
   - `time_off_reviewed`: approve, deny, and deny of an approved request notify the requester with
     the note in the body; a self-approval sends nothing.
   - `pending_time_off`: employee with and without a pending request, their manager, a manager of
     another department (0), an owner, a past pending request (not counted), a request that is
     both own and reviewable counts once, a device (0).

## Don't

- No UI changes (Stage 2). No migration.
- Don't touch `CLAUDE.md`, the spec, the plan or `SESSION_HANDOFF_*`.
- No repo-wide `mix format`: format only the files you change (`mix format path/to/file.ex`).

## Done when

- `mix test` green (run it twice), `mix compile --warnings-as-errors` clean.
- Commits on the branch.
- Reply with: commits (sha + subject), files touched, test counts, and anything you weren't sure
  about prefixed `LEAD:`.

---

# Stage 2 (UI)

2026-11-16 · lead → builder. Stage 1 is in (`d6d09e2`, `e1b1c29`). Your `LEAD:` notes are all
accepted: the moved test dates, `pending_time_off` in the two pinned capabilities tests (frozen
parity suite: a new key is fine, nothing else may change there), the recipient query in `Authz`,
"already passed" winning over "can no longer be cancelled", the notification text, synchronous
in-app delivery, and `when=""` as no filter.

Do **plan Stage 2** (spec §2.1, §2.2, §2.4, §2.6, §2.7's preferences, §2.8), then stop and report.
Same rules as Stage 1. The lead runs the servers from `~/src/rockcut`: API :4002, UI :5174 (both up
now). The local dev DB has the synthetic personas. Ask the lead (`LEAD:` in your reply) if anything
needs a restart.

1. **Types** (`lib/types.ts`): `pending_time_off` on the capabilities type; check `TimeOffRequest`
   has everything the dialog shows (`reviewer_note`, `reviewed_by`, `reviewed_at`, `inserted_at`).
2. **One time off dialog** (e.g. `components/timeoff/TimeOffDialog.tsx`), used everywhere below:
   - person, type, dates and times or "All day", their note, when requested;
   - approved: "Approved by …" + when + reviewer note; **Remove** for reviewers → the existing
     "Remove approved time off?" confirm → deny call, with the optional note box;
   - pending: **Approve** / **Deny** for reviewers, each with an optional note to the employee
     (`reviewer_note`);
   - past (`ends_at`'s Colorado day before today): read-only; past pending shows **"Not
     reviewed"**; no buttons for anyone;
   - who gets buttons: the same rule the Time off page uses today to show its review buttons
     (find it and share it, don't write a second one). The API decides; a 403/422 shows the API's
     message in the dialog.
   - After any action: invalidate every `['time_off', …]` query and `/api/me` (badge), so chips,
     conflict warnings, lists and badges refresh without a reload.
3. **Scheduler** (`WeekGrid.tsx` off-marker chips): clicking a chip opens the dialog for its
   request. Keep drag and the other grid clicks working; the chip click mustn't start a drag or
   open the shift dialog.
4. **View Schedule agenda** (`ViewSchedule.tsx`, spec §2.8): each day gets a row per approved or
   pending request covering it (multi-day on each day; pending styled like the Scheduler's amber
   pending chip), after the day's events and before its shifts. Data: the week's time off
   `useScheduleData` already loads (it's skipped for devices; keep that). The department filter
   keeps a person's time off when they're a member of that department; a position filter hides
   time off rows. Click → the dialog. Put the per-day row building in a pure helper with vitest.
5. **Time off page** (`pages/timeoff/TimeOff.tsx`, route `/time_off`):
   - the main view loads `?when=current`; the three sections are otherwise unchanged;
   - an **Archive** control (a toggle or tab beside the sections) loads `?when=past` only when
     opened: a plain list, newest first, read-only, past pending labeled "Not reviewed";
   - the page's own Approve / Deny gets the same optional note (reuse the dialog's piece);
   - the employee sees the reviewer note on their own requests (main view and Archive);
   - its rows can open the dialog too if that's simpler than duplicating detail, your call.
6. **Badges** (`App.tsx`): `capabilities.pending_time_off` on the Schedule section icon (the
   section `badge`, which also covers the collapsed rail) and on the Time off item's icon, like
   User change log. None at 0, none for devices.
7. **Notification preferences** (`NotificationPreferencesDialog.tsx`): add `time_off_requested`
   ("Time off requests to review") and `time_off_reviewed` ("Your time off request was decided")
   to `EVENTS`, normal defaults (no `EVENT_DEFAULTS` entry). Check the bell renders the multi-line
   body (`\n`) sensibly and that clicking opens `/time_off`.
8. **Look at it** in a browser, logged in by token injection per `rockcut-ui/tests/RUNNING.md`
   (never type passwords), as `bartender1` (request PTO, see the badge, see own time off in the
   agenda, Archive), `barMgr` (notification, badge, approve with a note from the Scheduler and
   from the agenda, Remove), `breweryMgr` (no notification, no buttons on bar time off),
   `owner`, and `taproomDevice` (agenda unchanged, no badge). Create only `[TEST-TEMP]` notes on
   requests you make, and cancel/deny only those, by id.

## Done when

`tsc` (app), `vitest run`, `pnpm lint` (no worse than `develop`), `vite build` all pass; `mix test`
still green if you touched the API. Commits on the branch. Reply with: commits, files, what you
checked in the browser per persona, and `LEAD:` notes. Playwright specs are Stage 3, so don't
write them yet.

---

# Stage 3 (past-request refusal + Playwright + coverage)

2026-11-16 · lead → builder. Stage 2 is in (`d1bbed1`..`5c96715`). Your `LEAD:` notes: all
accepted (reviews on the Time off page through the dialog with a Review button, the agenda's own
time off query, the extra agenda filters, `data-day`, the badge only above 0). The last one became a
spec rule, so do it first:

0. **Refuse past requests for oneself** (spec §2.4, last bullet, Matt 2026-11-16). In
   `TimeOff.create/2`: when the request is for the requester themselves and its `ends_at` is past
   (`past?/1`'s rule), return `{:error, :past_request}` → 422 `"This date has passed. Ask your
   manager to enter it for you."`. Owners and managers included for their own requests. On-behalf
   creates are unchanged (may be past, created approved, no notification). No notification for a
   refused create, obviously. ExUnit: own past (422, nothing stored, no notification), own ending
   today (ok), own started yesterday ending tomorrow (ok), manager on behalf with past dates (ok,
   approved), owner own past (422). The Time off form shows the API's message (check it does).
   Stage 1's tests that created past requests through `create/2` for oneself need another way in
   (insert directly in the test) — keep their assertions.

Then **plan Stage 3**, and stop and report:

1. **Specs** under `rockcut-ui/tests/regression/timeoff/`, from spec §4, one file per persona group
   (e.g. `employee.spec.ts` for `bartender1`, `manager.spec.ts` for `barMgr`, `negatives.spec.ts`
   for `breweryMgr` / `taproomDevice`, `owner.spec.ts`). Follow `tests/RUNNING.md` and the existing
   regression specs:
   - every spec declares its persona with `test.use({ storageState: authFile('<key>') })`; no UI
     login;
   - anything you create is `[TEST-TEMP]` (in the request note) and removed or cancelled by id in
     the spec's cleanup, even when the test fails. Destructive actions **only by exact id on your
     own `[TEST-TEMP]` rows**; never touch `[SEED]` rows or other personas' data;
   - past requests: create them through the API **on behalf** (a manager persona's token, past
     dates, created approved) or check whether a helper/fixture route exists for a past pending
     one; if a past **pending** request can't be made through the API any more, cover "Not
     reviewed" in ExUnit and say so;
   - notifications: assert through `/api/notifications` (in-app records), not email or push;
   - badges: assert the count on the Schedule section and the Time off item, and that it drops
     after a review without a reload;
   - negatives assert the visible absence (no buttons, no rows, no badge) and the API status where
     there's no UI path (device `GET /api/time_off` → 403, review of a past request → 422);
   - persist-verify writes (reload, then assert).
2. **`tests/COVERAGE.md`:** a D44 section, scenario → layer (ExUnit file / Playwright file /
   manual-only / GAP).
3. **Run only the new specs** locally, twice (`npx playwright test tests/regression/timeoff
   --reporter=line`). Don't run the full suite: the lead runs it in its own tab at the gate.

## Done when

`mix test` green twice (item 0), the new specs pass twice, `tsc -p tsconfig.e2e.json` has no new
errors, `tsc`/vitest/lint/build still as in Stage 2. Commits on the branch. Reply with: commits,
files, run results, anything left manual-only or GAP and why, and `LEAD:` notes.

---

# Local QA fix cycle 1

2026-11-16 · lead → builder. The full local gate passed; the local independent QA pass found 2
must-fix and 2 minor gaps. Do everything in `docs/current_work/prompts/d44_lead_decisions_1.md`,
then stop and report. Same rules as before; the local stack is free again (the QA agent is done).

- Every fix gets a test at the level the bug lived (ExUnit for items 1 and 4, vitest for item 2's
  helpers, Playwright for the UI side of item 1: a stale dialog shows the 409 and refreshes).
- **Revert-and-rerun** for items 1 and 2: show the new test fails with the fix reverted and passes
  with it restored (record both runs in your reply).
- Run `mix test` twice, vitest, tsc, lint, build, the timeoff Playwright project twice, and
  `theme.spec.ts` alone.

Reply with: commits, files, the revert-and-rerun evidence, run results, and `LEAD:` notes.
