# D59 lead decisions 3: DEV fix cycle 1

2026-11-11 · lead → builder. The DEV gate at `b660fd0`:
- full DEV Playwright: 712 passed, 1 failed (S239, a touch-drag flake; it passes alone on DEV twice);
- independent QA: **fail**, report `docs/current_work/stepwise_results/d59_dev_qa_report.md`. Read it.

Fix on `d59-owners-department`. Each fix gets a test that **fails with the fix reverted and passes
with it restored** (workflow §3: actually revert and re-run, and say so in your report).

1. **Gap 5 (must-fix), Matt 2026-11-11: hide Owners from non-members.** For anyone who isn't an
   owner or a member of that department (people and devices):
   - `GET /api/departments` leaves out `owners_only` departments;
   - `GET /api/roster` (and any other people list a non-member gets, e.g. board people, user
     lists, assignee lists, history actors) leaves `owners` out of each person's `departments`.
     Grep every serializer that lists a person's departments/memberships.
   - **Managers keep the read-only chip** in Users & Roles for a person they can manage (spec §4.3):
     check where the chip gets the department name. If it relies on `/api/departments`, give the
     manager's user payload what it needs (e.g. the membership carries the department name) rather
     than putting Owners back in the list.
   - Owners and members see everything as now (Owners last).
   - Keep the rule in one place (an `Authz` predicate like `can?(user, :see, {:department, dept})`)
     and use it in each serializer. A privacy test per endpoint as `office1`, `dualMgr`,
     `taproomDevice`, plus `ownersAsst` and `owner` still seeing it.
2. **Gap 6 (must-fix):** the not-scheduled error says **"That department isn't on the schedule"**,
   without the name. Also the membership 403 `Cannot assign roles in department: owners`: keep the
   status, drop the key from the text for non-owners ("You can't assign roles in that department").
   The 403-vs-404 difference on board routes stays (it's the same for every department's board).
3. **Gap 2:** no "Hide shifts" in the Owners task board's settings (`scheduling: false`).
4. **Gap 3:** the Users & Roles grid shows an `owners_only` membership as `Owners: member`, not
   `employee`.
5. **Gap 7:** the Owners assignee refusal reads "<name> must be an Owners member or an owner". Fix
   the article for every board ("a"/"an" by the name's first letter), since it's shared text.
6. **Gap 4:** no change. Naming who locked it is better; the lead updates the spec.
7. **Gap 1:** no change. Owners have been assignable on every board through the API since D41.
   Decision 8 is about the pickers.

Then: `mix test` twice, warnings-as-errors, tsc, vitest, lint no worse, build, the `owners`
Playwright project twice, plus the specs you touched. Commits; short report with the revert checks
and `LEAD:` notes.
