# D55: lead decisions 4

2026-11-08 · lead → builder, answering stop 3 (`ee7d592`). §2.11 and T13 are accepted.

## Your questions

1. **Body ids: 422 everywhere.** Keep it. An out-of-range number is malformed input, not a missing row.
2. **The missing-parent 500: into D55** (Matt). The spec has a new **§2.12** and **T14**; read them.
3. Auth before the id check: fine as it is.

## A correction to stop 3's diagnosis

`Recipe.changeset` **does** have `foreign_key_constraint(:brand_id)`, and every legacy brewing schema
declares its constraints. The likely cause is SQLite: its `FOREIGN KEY constraint failed` error
doesn't name the constraint, so Ecto can't match it and raises `Ecto.ConstraintError`. **Confirm that
first** (a failing ExUnit test for a recipe with `brand_id: 12345`; read what the error says). If the
cause turns out to be something else, write it in the status file and say how it changes the plan
before going further.

## Your work: §2.12 + T14

1. **Probe** before changing anything: which writes 500 on a missing parent. Use the router (as T13
   does) or the schemas' `belongs_to` lists, not a hand-picked sample. Include the newer areas too
   (scheduling, tasks, Boards, production, Buy-a-Beer), not just brewing. Record the list.
2. **One shared helper** (e.g. `RockcutApi.Changeset.validate_parents/2`, or a better name that
   matches the codebase): for each named `*_id` field that changed and isn't nil, check that the
   parent exists and add `{field, "does not exist"}` otherwise. Call it from every changeset the probe
   found. Keep the existing `foreign_key_constraint` calls (harmless; they'd work on another DB).
   Where a context already looks the parent up and answers 404 (e.g. access checks before the id),
   leave that route's answer as it is.
3. Ids that are 0 or negative: they're in range, so `ParamIds` lets them through; they must also end
   in the 422 here, not a 500.
4. **T14** (ExUnit): a sweep over the writable schemas' `belongs_to` fields with a missing parent,
   built from the schemas (`__schema__(:associations)`), so a new `belongs_to` without the helper fails
   the test. Revert check: the helper turned off → the sweep shows the 500s.
5. A `tests/COVERAGE.md` row for T14.

## Rules

Unchanged. A heads-up: **the lead's full local Playwright run is going now**, against the servers in
this worktree. The dev server recompiles when a request comes in after you save a file, so keep
edits compiling (no half-finished saves to files the running app loads for long), and **don't** run
`mix ecto.*` against the dev DB. `MIX_ENV=test` is yours as before.

## Then

`mix compile --warnings-as-errors`, `mix test`, tsc and Vitest once. Append "Lead decisions 4 done"
to the status file (the probe list, the cause, what changed, counts, revert check), commit with a
message containing `decisions 4 done`, and stop.
