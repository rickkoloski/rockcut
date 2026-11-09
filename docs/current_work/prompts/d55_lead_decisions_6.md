# D55: lead decisions 6 (DEV fix cycle 1)

2026-11-08 · lead → builder. DEV gate on `1a40933`: Playwright **663 passed**, one flake (T4, below).
The independent QA pass found 13 gaps: `docs/current_work/stepwise_results/d55_dev_qa_report.md`
(read the gap sections; repro scripts are referenced there but live outside the repo, so work from the
report's paths and bodies). Matt approved this triage.

## Fix in this cycle

Every fix gets a test that fails with the fix reverted (record the revert checks).

1. **Gap 8 (must-fix) + gap 9:** ingredient **categories** with Sort Order `null` (create and
   update) → 500. Same rule as §2.5/§2.10: `null`, `""` or left out on create = the end; `null` or `""`
   on update = the end; left out of an update = stays. Apply the `""` rule to the grain bill and
   category fields too (gap 9: `""` saved 0). Through the UI too: Add Category with Sort Order empty, and
   clearing it on an existing category.
2. **Gap 11 (must-fix):** a parent id of the **wrong type** (`"abc"`, `1.5`, `true`, `[]`, `{}`) →
   **422** on that field, never 500. Seen on shift `position_id` and time off / availability `user_id`,
   but fix it where the gap is (the `ParamIds` plug, `validate_parents/2`, or the casts these contexts
   do before the changeset), so it holds for every id field. Also: `user_id: "abc"` on time off and
   availability is **silently ignored** today (created for the caller): must be 422. Extend T13/T14 (or
   a new sweep) with the wrong-type shapes so the next such field fails a test.
3. **Gap 2 (should-fix), §2.1 mid-session:** when a stray 401's `/api/me` recheck fails another way
   (5xx, offline, timeout), behave like start-up: show "Can't reach the server, retrying…", recheck on
   the same schedule, and when `/api/me` answers 200 again, clear the banner and **reload the failed
   view's data** (refetch the queries; a full reload only if that's much simpler and keeps the tablet
   paired). Still no unpair and no sign-out unless `/api/me` itself says 401. Vitest for the state
   machine; a Playwright spec for the tablet case (route-mock as QA did: `/api/beer_board` 401,
   `/api/me` 503 then 200 → banner, then the board loads with no navigation).
4. **Gap 6 (should-fix):** `memberships` naming one department twice → **422** on `memberships`, on
   create and update, nothing saved.
5. **Gap 7 (minor):** `memberships: null` → 422 "must be a list" on create too (left out on create
   still means no roles). An out-of-range `department_id` inside memberships → the error under
   `memberships`, like the other malformed shapes.
6. **Gap 10 (should-fix):** a brand, recipe or ingredient URL that names nothing (404 from the API,
   any id shape) → a "not found" page with a link back, as §2.6 did for categories. Check the other
   brewing detail pages (batches, lots) for the same spinner and fix them the same way.
7. **Gap 4 (minor):** tablet, unknown channel (`/messages/nope`) → "Page not found" (a real channel it
   can't use stays "Not available on a shared device").
8. **Gap 13 (minor), part:** `POST /api/notifications/<missing id>/read` → 404. (The shift's 403 for
   a missing position stays: access is checked first, as decided at stop 4.)
9. **The T4 flake** (`devices/stray_401.spec.ts:104`): on DEV, `page.goto('/messages/all')` failed
   with `net::ERR_ABORTED` once (3/3 alone): the app's own sign-out navigation races the test's. Make the
   test tolerate an aborted navigation (or wait for the login page without a goto race). Check T3 for
   the same pattern.

## Not in this cycle

Backlog: gap 12 (task 5204, deactivated shift assignee), gap 3 (5205, start-up blank page), gap 5
(5206, unknown card URL). Gap 1 is by design (§2.9: the home-screen label is "Rock Cut").

## Rules

As decisions 5: no servers, no Playwright, no `mix ecto.*` on the dev DB, no `mix compile --force`.
List the exact spec lines for the lead to run. DEV is the lead's.

## Then

The non-Playwright gate. "Lead decisions 6 done" in the status file (each gap: cause, fix, test, revert
check), a commit containing `decisions 6 done`, and stop.
