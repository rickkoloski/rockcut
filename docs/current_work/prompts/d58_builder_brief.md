# D58 builder brief — Stage 1 (Board settings)

2026-11-11 · lead → builder.

**Read first:** `docs/current_work/specs/d58_board_settings_and_managers_spec.md` (approved,
decisions 1–8) and `docs/current_work/planning/d58_board_settings_and_managers_plan.md`. This brief
covers **plan Stage 1 only** (spec §3.1, §3.2). Stop after it and report.

**Where:** `~/src/rockcut`, branch `d58-board-settings-and-managers` (checked out; don't switch).
Small commits (`feat: D58 …`), staging paths by name. No push, merge or rebase. The lead runs the
servers (API :4002, UI :5174); ask with `LEAD:` if you need a restart or migration on the dev DB.
**Only `mix format` the files you change** (a repo-wide format reflows the legacy tree).

## Do

1. **Migration** `users.board_settings` (`:map`, default `%{}`, `null: false`). Reversible.
2. **`Accounts.BoardSettings`** (or similar): one closed schema per board key.
   - `span` 7|14;
   - `hide_completed`, `hide_shifts` boolean;
   - `first_day` "today"|"sunday"|"monday";
   - `view` "all"|"mine"|"unassigned" ("mine" not allowed on `all`);
   - `phone_view` "vertical"|"day".
   - Unknown keys or values → 422 (field errors), nothing saved. Merging keeps the other keys and
     boards.
3. **API:** `PUT /api/me/board_settings/:board` (merge the given keys; answer the board's full map,
   defaults filled in). `GET /api/me` adds `board_settings` (the stored map; the UI fills defaults).
   `board`:
   - **a person:** any department board they can `:read` (`Authz`, as the board routes check), or
     `all` (owners only);
   - **a device:** only its home board, no staff code (`Authz.Device`). Anything else is 403;
   - an unknown key is 404.
   ExUnit for each rule, both allowed and refused, plus a device on another board.
4. **UI** (`pages/tasks/useBoardView.ts`, `lib/tasks.ts`, `TaskBoard`, `AllBoard`, `BoardToolbar`):
   - settings come from `/api/me`'s `board_settings` with defaults (2 weeks, off, off, Today, All,
     vertical), and changes save through the new route: optimistic, with a quiet "Not saved" toast
     on failure (the change stays for this page);
   - the **View filter** is now one of them (it wasn't remembered before);
   - **Carry-over:** if `/api/me` has no entry for this board and this browser has the old local keys
     for it (D41/D42/D45, incl. the shared/legacy fallbacks `readFor` handles), PUT them once, and
     clear those local keys **only after the PUT succeeds**. Never PUT a carry-over when the server
     already has that board. The last-board key (`rockcut.tasks.board`) stays local.
   - Remove the now-dead local read/write helpers, but keep what the carry-over needs.
   - **31-day clamp** (spec §3.2): over 31 days, show `from` + 30, with a notice "Showing 31 days
     (the most a board shows)", and correct the URL with `replace`. An invalid range falls back to
     the default and is corrected the same way. Same on All departments.
   - Vitest: carry-over (has local + no server → one PUT, then cleared; server has it → no PUT; a
     failed PUT → keys kept), the clamp and invalid-range math, defaults.
5. Look at it in a browser (token injection per `rockcut-ui/tests/RUNNING.md`):
   - as `brewer1`: change settings and confirm they hold after a reload and in a fresh context;
   - as `taproomDevice`: change View;
   - try a 40-day URL.

## Don't

- No manager or positions work (Stage 2) and no backlog items (Stage 3).
- No Playwright specs yet (Stage 4).
- Don't touch `CLAUDE.md`, the spec, the plan or the handoffs.

## Done when

`mix test` twice green, `mix compile --warnings-as-errors`, tsc, vitest, lint no worse than 27, build.
Commits on the branch. Reply with: commits, files, test counts, what you checked in the browser,
and `LEAD:` notes.
