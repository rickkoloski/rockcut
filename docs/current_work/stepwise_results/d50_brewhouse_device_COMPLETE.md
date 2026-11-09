# D50: The brewhouse device on the production schedule — Complete

**Spec:** `specs/d50_brewhouse_device_spec.md`
**Plan:** `planning/d50_brewhouse_device_plan.md`
**Completed:** 2026-11-09 (on prod as `v2026.11.09`). Matt's device checks passed the same day.

---

## Summary

A shared device whose home department is the Brewery works the production schedule. Every change
needs a staff code and is made as that person, with the device recorded beside them. Setup stays
read-only on the device, and every other device is refused. The Brewery board's linked tasks can be
changed on the device. Also in this release:
- the template link fix (§2.6) and links on a batch's steps (§2.7);
- a valid code from someone who may not make the change no longer counts toward the lockout;
- a confirm before removing a tank condition mark;
- D54's tablet shim is removed (task 5209).

## What Was Built

- **Access:**
  - `Authz.Device`: a Brewery-home device may `:read` and `:write` `:production`; `:setup` falls
    through to the catch-all.
  - Production reads and schedule writes moved into a `[:api, :device_allowed, :brewery]` scope.
    Setup writes stay people-only.
  - `GET /api/brands` is open to the Brewery device (for the Plan batch dialog).
- **Staff codes:**
  - Every schedule write goes through `StaffCodeActing.acting(conn, :production)` and answers
    `recorded_as`. The board's linked-task writes do the same.
  - Wrong codes share the board's lockout counter.
  - Fix cycle 1: a real person's code that may not make the change answers 422
    `staff_code_not_allowed` ("That staff code can't do this here") and isn't counted. This applies
    on every board and on Buy-a-Beer. A locked device still refuses before any code is checked.
- **Recording the device:** migration `20261108160001_add_production_device_ids` adds nullable
  `production_steps.done_on_device_id`, `production_flag_signoffs.device_id` and
  `production_undos.device_id`. The UI shows "· on <device>".
- **Undo:** someone else's change answers 403 `undo_not_yours` ("Only <name> can undo this.").
  This applies to people too.
- **Show planned batches:** per device, from the device's own `show_planned_batches`. It's set by
  an owner in Shared devices.
- **Links:**
  - `POST /api/production/steps/:id/links`, `PATCH` and `DELETE /api/production/step_links/:id`,
    all Undo-tracked.
  - Template rules apply: no loops, no later-day "comes after", and only within the batch or its
    split tree.
  - In the template editor, a picked link is saved by Save, and Links sits above Notes.
- **UI on the device:**
  - Brewery → Production, with every write going through `useActing.run` (`codedApi`). The code
    dialog comes before the move and check-off prompts.
  - The Acting-as banner shows on the Gantt.
  - The setup pages are read-only, with a note.
  - Linked tasks on the board can be changed.
  - The setup doc has a brewhouse section.

## Testing

- **Local gate:**
  - full Playwright 691 passed, 1 skipped;
  - `mix test` 2214 twice;
  - vitest 250, `tsc` and `vite build` clean, lint unchanged at 26.
  - §2.6 revert check done (L1 fails with the fix reverted).
- **DEV run 1 at `67c6629`:**
  - full DEV Playwright 694 passed;
  - independent QA: pass with gaps (`d50_dev_qa_report.md`): 0 must-fix, 1 should-fix, 3 minor.
- **Fix cycle 1 at `6593442`:**
  - gaps 1 and 4 fixed; revert checks done (7 ExUnit tests, 2 vitest tests, 1 Playwright case);
  - `mix test` 2216 twice, vitest 255.
- **DEV run 2:** 694 passed, 1 failed. S139 fails only on Mondays (today is the first day, so the
  board opens at the top, and DEV's tall Unfinished card pushed today below the fold). The fix is
  test-only (`e2423dc`).
- **QA recheck:** pass (`d50_dev_qa_recheck_report.md`).
- **Matt on prod:** the brewhouse device and Taproom tablet checks passed.

## Release

- PR #58 → `develop` (`22eff34`); release PR #62 squash `dbf80e8`; tag `v2026.11.09`.
- Prod API v36 `registry.fly.io/rockcut-api:deployment-01M70MGHPWTT121KN69NTP6DQS`, UI v32
  `registry.fly.io/rockcut-ui:deployment-01M70MJ7J1HK31XMZJHMFPX037` (build id `v2026.11.09`).
- **Rollback:** API v35 `…deployment-01M6Z7HP49YRH2YQZC1B013JVH`, UI v31
  `…deployment-01M6Z7KPQ5MA6TQG23J1GYDPP1`. The migration only adds nullable columns, so no
  snapshot restore is needed. Pre-release snapshot: `vs_jQjPb8l52evkFlYkePl5bAZX`.
- **Smoke checks:**
  - the migration is recorded;
  - the UI answers 200 and `sw.js` is served `no-cache`;
  - the bundle carries the build id, and the shim is gone from it;
  - signed out, `/api/me` and `/api/production/schedule` answer 401.
- **Prod devices:** Tablet-1 and Tablet-2 (Taproom) and "Brewery Test 1" (Brewery). Matt
  re-paired one Taproom tablet as the brewhouse device.

## Follow-ups

- **5210:** template Save isn't all-or-nothing (QA gap 2).
- **5211:** a step taken off the task list disappears from the Gantt (QA gap 3).
- **QA observations (not filed):** edge auto-scroll while dragging near the right edge; Ctrl-click
  doesn't multi-select on macOS (Shift-click does).
