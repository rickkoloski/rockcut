# D35 handoff note (PR description)

**Deliverable:** D35 — Cut off calendar feeds when someone leaves (task 3992)
**Spec:** `docs/current_work/specs/d35_calendar_feed_rotation_spec.md` · **Plan:** `docs/current_work/planning/d35_calendar_feed_rotation_plan.md`
**Branch:** `d35-calendar-feed-rotation`

## What changed

- **API: rotation.** When a person's set of shared calendar feeds shrinks,
  those feeds get new tokens and the old URLs answer 404.
  - Triggers:
    - **deactivation**, which also rotates their own "My shifts" feed;
    - **lost access** (Q1): a manager made an employee, someone removed from
      a department they managed, or the owner flag removed.
  - The before and after sets are computed with the same `Authz` rule as
    Calendar sync (`CalendarFeeds.shared_feeds/1`), inside the transaction
    of `Accounts.update_user` / `set_memberships`. A rollback, such as the
    last-owner guard, rotates nothing.
  - A feed nobody ever created is skipped.
  - Each rotation writes one audit entry, `calendar_feeds.rotated`, with the
    reason and the feed types and ids, never tokens. The User change log
    labels it "Calendar links reset".
- **API: the notification.** After commit, everyone still active who still
  gets a rotated shared feed's URL receives **one** notification listing
  their feeds. That includes the person who made the change.
  - The new event is `calendar_feed_rotated`.
  - Defaults: in-app and push on, email off (Q3).
  - It doesn't name the person (Q2), and it links to
    `/schedule?calendar_sync=1`.
- **UI:**
  - Notification preferences gains "Calendar link changed", with defaults
    that match the API.
  - `?calendar_sync=1` on the Schedule page opens Calendar sync.
  - **Clicking a bell item that carries a link now opens the link**, as a push
    click already does. This also applies to `message_posted` notifications,
    which link to their channel; that event is off in the bell by default.
- **No migration.**

## Local gate

- `mix test`: 866 tests, 0 failures, including the new
  `calendar_feed_rotation_test.exs` (15 tests).
  - Revert-and-rerun: 11 of the 15 fail without the wiring.
  - The 4 that still pass are guards: a feed never created, reactivation,
    a rollback, and gaining access.
- **Playwright,** `regression/scheduler/calendar_feed_rotation.spec.ts`:
  - S2/S10 and Q3 pass;
  - with the UI changes reverted, both fail.

## DEV gate

- **Run 1 at `bf0cba6`** (API v20 / UI v15): **123/123**, with no API errors.
- **Independent pass 1** (`stepwise_results/d35_dev_pass_1_qa_report.md`):
  PASS with gaps. 12 PASS, 0 FAIL, 1 NOT RUN (S8: setting it up would mean
  demoting personas).
  - **The core works.** The right feeds reset, old links give 404 and new
    ones 200, the right people get exactly one notice, the person who leaves
    gets none, and opting out works.
  - **G1, must-fix, predates D35; fixed in `112a715`.** Calendar sync built
    the link from the UI host, which doesn't forward `/api`, so a copied link
    returned the app's HTML. This is also broken on prod today. Links now
    use the API host.
    - The new spec fails on the old DEV build (`text/html`) and passes on the
      new one.
  - **G2/G3, fixed in `112a715`.** One Users & Roles save that changed the
    owner flag and departments reset links twice, and could reset a link the
    person kept through a new role. The save now applies a deactivation
    first, and otherwise memberships before the owner flag.
    - The new spec fails with the old order.
  - **G4, fixed:** the notification is shorter, with singular and plural
    wording.
  - **G5, fixed:** the User change log shows which links were reset and why.
  - **G6, predates D35; fixed in `e17258a` at Matt's request.** Granting or
    removing the owner flag is now logged ("Owner access granted" /
    "Owner access removed").
  - **G7, fixed in `e17258a` at Matt's request.** Reset on a shared link in
    Calendar sync now asks first. It then tells everyone else who uses the
    link who reset it, and every reset is logged.
- **Run 2 at `112a715`** (API v21 / UI v16): 124/125.
  - The failure was the intermittent DEV hang: a `GET /api/me` timed out
    at 20 s in a D34 spec. That file passed 14/14 on rerun.
  - The API log had no errors.
- **Run 3 at `e17258a`** (API v22 / UI v17): 125/126.
  - The failure was the D34 "Try now" spec: its button re-rendered under
    DEV latency until the test timed out. That file passed 14/14 on rerun;
    a test flake, not D35.
  - The API log had no errors.
- **Local gate at `e17258a`:**
  - `mix test`: 871 tests, 0 failures. Revert-and-rerun: the G6/G7 tests
    fail without the change.
  - Playwright: 125 passed, 1 skipped.
  - lint: 27, the baseline.
- **Tests now deliver notification email and push inline**
  (`config :rockcut_api, :async_delivery, false`). The first push-on-by-default
  event left tasks reading the database after their test had finished.
- **Local gate at `112a715`:**
  - `mix test`: 866 tests, 0 failures.
  - Playwright: 124 passed, 1 skipped.
  - lint: 27, the baseline.

## Scenarios DEV must exercise

S1–S15 in spec §4. Every person who leaves or loses access must be a
`[TEST-TEMP]` person; never deactivate or demote a persona.

## ⚠ LIMITATIONS: what local could NOT tell us

1. **Real calendar apps.** The test checks that the old URL gives 404. It
   doesn't check what Google, Apple or Outlook do with a dead feed: they may
   keep showing the old events. Check that the notification's instructions
   (remove the old calendar, add the new link) actually work.
2. **Push delivery** of the new event on a real device. Locally there is no
   VAPID setup.
3. **Side effects on other specs.** Every spec that retires a `[TEST-TEMP]`
   manager now rotates the Taproom feed and notifies the Taproom managers
   and owners. Specs that cache a feed token, or count persona
   notifications, may now flake on DEV.
4. **The bell now navigates.** Check that clicking any notification that
   carries a URL behaves sensibly, and that clicking one without a URL
   still only marks it read.
5. **Deep link on a phone.** Open `/schedule?calendar_sync=1` from a push
   notification with the PWA closed, then with it already open on another
   page.
6. **Owner flag removal with real data.** The rotation lists depend on
   which departments exist on DEV, including non-assignable ones.
