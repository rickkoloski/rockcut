# D59 lead decisions 2 (Stage 3 report)

2026-11-11 · lead → builder, on the Stage 3 `LEAD:` notes (`3e578d2`, `d05a57b`).

1. **Owners as assignees on the Owners board only (Matt, 2026-11-11).** On an `owners_only`
   department's boards, the people offered are its members **plus every active owner**:
   - the task dialog (tasks and repeating tasks) on the Owners task board;
   - the people picker on Owners Idea Board cards.
   Every other board is unchanged: members only, as today (owners stay off the Brewery/Taproom/…
   pickers). The API already accepts owners as assignees everywhere (`can_take_task?`,
   `can_take_idea_card?`), so this is the candidate list only.
   Pick the smallest clean way to give the UI the owners, e.g. `is_owner` on the roster/people
   payload the dialogs already use, or a board-level `assignable_people` list from the API. Keep the
   owner check in `Authz` (boundary test). Test the list on the API side (Owners board includes
   `owner`/`owner2`; Brewery board doesn't) and with vitest if the filter lives in a UI helper.
   Then re-check O1 in the browser as `owner`: a task assigned to `owner2` and `ownersAsst`.
2. **Lock wording on owners-only boards:** "Locked by an owner" (API, `idea_board_errors.ex`) and
   "Only an owner can change it" (UI, `lib/ideas.ts`, `IdeaBoard.tsx`, `IdeaCardDialog.tsx`), when
   the board's department is `owners_only`. Other boards keep "manager". Base it on the flag, not
   the key.
3. **Optional Department fields:** fine.
4. **`.playwright-mcp/`:** I deleted it. Add `.playwright-mcp/` to the repo `.gitignore` in your
   commit.

Then: the Stage 3 gate again (tsc, vitest, lint no worse, build) plus `mix test` twice if the API
changed, commits, and a short report.
