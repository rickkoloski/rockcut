# D59 builder brief — Stage 1 (Data)

2026-11-11 · lead → builder.

**Read first:** `docs/current_work/specs/d59_owners_department_spec.md` (approved) and
`docs/current_work/planning/d59_owners_department_plan.md`. This brief covers **plan Stage 1 only**.
Stop after it and report. Stage 2 comes as a separate brief.

**Where:** `~/src/rockcut`, branch `d59-owners-department` (already checked out; don't switch).
Commit your work on it in small commits (`feat: D59 …`), staging paths by name. No push, merge or
rebase. The lead owns the servers; Stage 1 needs only `mix test` / `mix ecto.*`.

## Do

1. **Migration** `rockcut_api/priv/repo/migrations/20261111100001_add_owners_department.exs`:
   - add `departments.scheduling` (`:boolean`, `default: true, null: false`) and
     `departments.owners_only` (`:boolean`, `default: false, null: false`);
   - insert Owners (`name "Owners"`, `key "owners"`, `color "#37474F"`, `assignable true`,
     `scheduling false`, `owners_only true`, timestamps) **unless** key `owners` exists;
   - `down`: if the Owners row is referenced by anything (grep every table with a
     `department_id`/department FK: memberships, tasks, task series, Daily items, idea board
     tables, messages/channel reads by `channel_key "dept:owners"`, devices' `home_department_id`,
     positions/shifts/events), **raise** with a clear message; otherwise delete it. Then drop
     the columns.
   - Verify up → down → up on a fresh test DB, and that `down` raises once an Owners membership
     exists.
2. **Schema/JSON:** `Accounts.Department` fields + changeset cast; `JSONHelpers.department/1` sends
   `scheduling` and `owners_only`.
3. **Seeds:** `priv/repo/seeds.exs` department list gains Owners. Heal `scheduling`/`owners_only`
   the same way `assignable` is healed. Existing departments get `scheduling: true,
   owners_only: false`.
4. **Ordering — Owners last** (spec §4.4). Add one helper in `Accounts` (e.g.
   `sort_departments(depts, :name | :id)`, sorting by `{owners_only, name|id}`) and use it in:
   - `Accounts.list_departments/0` (name order, Owners last);
   - `Tasks` board list (`tasks.ex` ~line 69, id order);
   - `IdeaBoards.all_boards/0` (id order; Company stays after Owners);
   - `Messaging.assignable_departments/0` (name order).
   Tests for each list's order.
5. **Synthetic** (`lib/rockcut_api/seeds/synthetic.ex`):
   - persona `{"ownersAsst", "owners.asst", "Ellis Assist", [{"office", "employee"}, {"owners",
     "employee"}], %{}}`;
   - a `[SEED]` Owners task (created by `owner`) and one `[SEED]` Owners Idea Board card, built and
     cleaned with the other `[SEED]` scenario data;
   - make sure `mix rockcut.synthetic.setup` runs clean twice in a row (idempotent), and update any
     test that counts personas or departments.
   - Add the persona to the UI test config too if personas are listed there
     (`rockcut-ui/tests/config/…`), so `auth.setup.ts` mints a storageState for it.

## Don't

- Don't add the membership/scheduling/device refusals yet (Stage 2).
- No UI changes beyond the test-persona config.
- Don't touch `CLAUDE.md`, the spec, the plan or `SESSION_HANDOFF_*`.
- No repo-wide `mix format`: format only the files you change (`mix format path/to/file.ex`).

## Done when

- `mix test` green (run it twice), `mix compile --warnings-as-errors` clean.
- Commits on the branch.
- Reply with: commits (sha + subject), files touched, test counts, anything you weren't sure
  about prefixed `LEAD:`.
