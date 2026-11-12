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

## D59 DEV gate: PASSED, merged to `develop` (`058fc71`, PR #64)

- Run 1 `b660fd0`: Playwright 712/713 (S239 flake); QA **fail** (gaps 5, 6 must-fix: Owners leaked to
  non-members via `/api/departments`, `/api/roster`, error texts).
- Fix cycle 1 `f6c904f`: Owners hidden from non-members (`Authz.can?(:see, {:department, d})`, spec
  decision 9), neutral errors, gaps 2/3/7. Playwright 714/714; QA recheck fail on gap 9.
- Fix cycle 2 `dc54a18`: permission before role (gap 9). Playwright 714/714; targeted QA pass.
- Accepted: gaps 1, 4, 8. Backlog: **task 5769** (gap 10, managers can manage positions in other
  departments; predates D59). QA reports: `stepwise_results/d59_dev_qa_*.md`.
- **DEV is free** (conv 80 msg 104710), running `058fc71` = `develop` (API v82 / UI v85), reseeded.
  Pre-D59 DEV snapshot `vs_VxLXDDOL4votzbJee38g`.

## Next

1. **D59 prod release** when Matt says (workflow §5): a release PR `develop → main`, tag
   `v2026.11.1x`, deploy from a clean checkout of the tag (API, then `Release.migrate()` if the boot
   didn't migrate, then UI), smoke, a close-out PR. Take a prod snapshot first. The rollback is the
   image only once Owners is in use (spec §6). Matt should check: Owners appears for him, and he adds
   whoever he wants as members.
2. After D59: the D56 spec (5207). D58 stays on hold until Matt lifts it. D58's spec must cite D59
   §4.3 and decision 9.

## Notes

- The builder's `LEAD:` notes worth keeping:
  - the `owners` Playwright project runs one worker;
  - O10 turns in-app notifications on for 4 personas and restores them in `afterAll`;
  - O10's `[TEST-TEMP]` messages stay until the next synthetic setup (there's no message delete).
- Open D58 overlap: D58 edits the same membership, user and Users & Roles code. Its spec should
  cite D59 spec §4.3.
- `CLAUDE.md` names D59 (task 5764). Next new ID: **D60**.
