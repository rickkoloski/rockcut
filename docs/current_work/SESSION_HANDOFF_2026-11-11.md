# Session Handoff: 2026-11-11

Supersedes `SESSION_HANDOFF_2026-11-10.md`. Prod and DEV are unchanged: prod is still `v2026.11.09`
(D50; rollback API v35 / UI v31), and DEV is free (not claimed).

## Done this session

- **D58 decision (Matt):** any manager can deactivate a person with **no** department. It's on task 4984,
  and D58 is still **on hold** (don't write the spec).
- **D59 Owners department** (task **5764**), branch `d59-owners-department` in `~/src/rockcut`, from
  `develop` @ `5c7fce6`. Not pushed. Spec approved, plan written, stages 1–4 built (lead mode,
  builder in the build tab):
  - Spec `docs/current_work/specs/d59_owners_department_spec.md` (decisions 1–8). Plan
    `docs/current_work/planning/d59_owners_department_plan.md`. Brief + lead decisions 1–2 in
    `docs/current_work/prompts/d59_*`.
  - Stage 1 (data): migration `20261111100001_add_owners_department.exs` (`departments.scheduling`,
    `owners_only`, the Owners row `#37474F` and its 4 starter Idea lists; `down` raises if Owners is
    in use), seeds, `Accounts.sort_departments/2` (Owners last), persona `ownersAsst` (Ellis
    Assist: Office + Owners) and `[SEED]` Owners task and card.
  - Stage 2 (API): no managers in Owners (422), only owners change Owners memberships (403 for
    managers; their saves keep it), no device home, no positions/shifts/events (422), no calendar
    feed (404), no board schedule header, every owner notified on Owners channel posts, and a
    privacy test module.
  - Stage 3 (UI): Owners off the Scheduler, dialogs, Calendar sync and the device home picker; Users &
    Roles (owners: member only; managers: read-only chip, never sent); no nav heading (deliberate).
    **Matt's decision 8:** owners are offered as assignees on the Owners boards only (task and idea
    pickers). Locks on Owners say "an owner".
  - Stage 4: Playwright `rockcut-ui/tests/regression/owners/` (O1–O13, a one-worker `owners`
    project), passed twice alone; `tests/COVERAGE.md` D59 section.
  - Gate so far: `mix test` 2284 green twice, warnings-as-errors clean, tsc, vitest 261, build,
    lint 27 (same as before).

## Stop 2 reached

- **Full local Playwright: 712 passed, 1 skipped (the DEV-only banner test), 37.6 min**, log
  `/tmp/claude-501/pwlogs/d59_full_1656.log`. Its tab is closed. The local gate is complete.
- Local servers still run from `~/src/rockcut` in the lead tab (API `w1:p2`, UI `w1:p3`).

## Next

1. **The DEV gate needs Matt's go** (outward-facing): push the branch, claim DEV in PortableMind
   discussion 80, deploy the branch to DEV, `seed_synthetic()`, then O1–O13 plus a regression sweep
   (Scheduler, Users & Roles, Messages, the other boards), and an independent qa agent. QA
   brief: destructive actions by exact id on its own `[TEST-TEMP]` rows only.
2. Then the PR to `develop`, the release from a tag and the deploy. Rollback notes are in spec §6.
3. After D59: the D56 spec (5207). D58 stays on hold until Matt lifts it.

## Notes

- The builder's `LEAD:` notes worth keeping:
  - the `owners` Playwright project runs one worker;
  - O10 turns in-app notifications on for 4 personas and restores them in `afterAll`;
  - O10's `[TEST-TEMP]` messages stay until the next synthetic setup (there's no message delete).
- Open D58 overlap: D58 edits the same membership, user and Users & Roles code. Its spec should
  cite D59 spec §4.3.
- `CLAUDE.md` names D59 (task 5764). Next new ID: **D60**.
