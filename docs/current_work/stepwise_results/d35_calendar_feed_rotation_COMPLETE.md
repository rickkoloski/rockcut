# D35: Calendar Feed Links Reset When Someone Leaves — Completion Record

**Status:** COMPLETE. On prod since 2026-10-05 (~00:30 UTC) in release
`v2026.10.04` (`e35fd3f`, PR #11; API v22, UI v18). Matt's prod check
passed: a link copied from Calendar sync downloads an `.ics` file.
**Spec:** `specs/d35_calendar_feed_rotation_spec.md` (approved 2026-10-04,
Q1–Q4) · **Plan:** `planning/d35_calendar_feed_rotation_plan.md`
**Concept:** 07_scheduling
**Branch:** `d35-calendar-feed-rotation`, PR #10, merged 2026-10-04 as
`b8421e4`. DEV gate SHA **`e17258a`**.
**Backlog:** PortableMind project 254, task 3992 (closed).
**QA report:** `stepwise_results/d35_dev_pass_1_qa_report.md`

---

## Summary

Calendar feed URLs are bearer credentials that calendar apps keep polling.
When someone is deactivated, or loses manager or owner access, every shared
feed they could see gets a new link at once, and the old link answers 404.
Everyone who still uses a reset feed gets one "Re-subscribe to your Rockcut
calendar" notification, and tapping it opens Calendar sync.

## What shipped

- **Rotation (D1, Q1).** When a person's set of shared feeds shrinks, those
  feeds get new tokens in the same transaction as the change.
  - The set is computed with the same `Authz` rule as Calendar sync.
  - Triggers: deactivation, which also resets their own "My shifts" link; a
    manager made an employee or removed from a department; the owner flag
    removed.
  - Gaining access, reactivation, a rolled-back change, and feeds nobody ever
    created reset nothing.
- **Notification (D2, Q2–Q4):** `calendar_feed_rotated`.
  - One per recipient per change, listing their feeds.
  - In-app and push, not email. It's listed in Notification preferences as
    "Calendar link changed".
  - It never names the person.
  - It links to `/schedule?calendar_sync=1`.
  - It goes out after commit.
- **The Reset button (G7, at Matt's request)** in Calendar sync:
  - for a shared link it asks first, then notifies everyone else ("… Casey
    Tap reset it.");
  - resetting your own link notifies nobody;
  - every reset is logged.
- **User change log:**
  - "Calendar links reset", with the feed names and why (left, lost access,
    or reset by hand);
  - "Owner access granted" / "Owner access removed" (G6, at Matt's request).
- **Fixes along the way:**
  - **Calendar sync links were built on the UI host**, which serves the
    app's HTML. On prod they never worked. They now use `VITE_API_URL`.
  - **Users & Roles save order:** a deactivation first, otherwise memberships
    before the owner flag. One save then resets each lost link once, and never
    a link the person keeps through a new role.
  - **The bell opens a notification's link**, as a push click does.
  - **Tests deliver notification email and push inline** (`async_delivery:
    false`). A push task that outlived its test had broken the sandboxed
    database.

16 files changed, +1331 / −14 (merge `b8421e4`). **No migration**, no new
secret.

## Testing

- **Local:**
  - `mix test`: 871 tests, 0 failures, including
    `calendar_feed_rotation_test.exs` (20 tests);
  - Playwright: 125 passed, 1 skipped.
- **Revert-and-rerun:** every new test fails without its change, except the
  guard tests. The link-host test failed against the old DEV build
  (`text/html`).
- **DEV:**
  - run 1: 123/123;
  - run 2: 124/125, the intermittent hang;
  - run 3 at `e17258a`: 125/126, the flaky D34 "Try now" spec (task 4057).
  - The flaky files passed on rerun.
- **Independent pass 1:** PASS with gaps. 12 PASS, 0 FAIL, 1 NOT RUN (S8).
  All seven gaps were fixed.
- **Prod smoke:** green. Matt's Calendar sync check passed.

## Follow-Up

- **Tell staff to copy their Calendar sync links again.** The old links never
  worked on prod.
- **Not done (spec §5):** per-person subscription tokens for shared feeds, so
  one person can be cut off without everyone else re-subscribing. That's the
  longer-term option noted in task 3992.
