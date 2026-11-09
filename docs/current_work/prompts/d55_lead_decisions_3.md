# D55: lead decisions 3

2026-11-08 · lead → builder. D53 is on prod (`v2026.11.08`) and `develop` is merged into this branch.

## What the lead did (read, don't redo)

- **`a341dad`: merge of `develop`.** Conflicts resolved:
  - `App.tsx`: `personRoutes` gained D53's `/boards`, `/boards/:board`, `/boards/:board/cards/:cardId`
    (the tablet routes already had them).
  - `useAuth.ts`: yours kept (§2.1: `loadMe` never drops the token; the interceptor's `/api/me`
    recheck decides). D53's `isRefused` branch is gone; `logout()` already clears `ideaBoards`.
  - `tests/COVERAGE.md`: D53 Part 2's section, then D55's.
  - Gate after the merge: tsc clean, Vitest 230, `mix compile --warnings-as-errors` clean,
    `mix test` **2141 passed**.
- **`564015c`: the `test.fixme` in `devices/unknown_url.spec.ts` is a real test** (taproomDevice opens
  `/boards`, `/boards/bar`, `/boards/company` and a seeded card's URL: the board shows, never "Page
  not found" or "Not available"). Not run yet; the COVERAGE row is updated.
- Branch pushed.

Pull nothing: you're in the same worktree. Start from `564015c`.

## Your work: §2.11 + T13 (spec §2.11)

1. **URL ids: one plug, 404 before any controller runs.** In the `:api` pipeline (after auth is fine,
   before the controller), look at `conn.path_params`: every param named `id` or ending in `_id` must
   pass `RockcutApi.Ids.parse/1`, else halt with 404 and the app's usual not-found JSON. Params that
   are keys, not ids (`:dept`, `:board`, `:key`, tokens, codes) are left alone. If a route's `*_id`
   param is legitimately not a number, list it in the plug as an exception with a comment saying why.
   Remove nothing from D53's own `Ids` calls in the Boards and task boards; they stay as a second line.
2. **Body and query ids: 422.** Where a context or controller turns a body/query id into a query
   (`*_id` fields in shift, time off, Buy-a-Beer, schedule events, production, users/memberships,
   devices…), an out-of-range one is 422 on that field, or 404 where the route already answers 404 for
   a missing reference. Use `RockcutApi.Ids`. `before_id` keeps D38's rule (unknown → end of the day).
3. **History filters (gap 10):** task-board History `task_id` and Boards History `card_id` that
   `Ids.parse` refuses (`1e20`, `abc`, `-1`, `0`, `99999999999999999999`) → **422** on that param
   (decided: 422, not "no rows", so a bad link is visible). An absent param still means the whole
   board's History.
4. **`Ids.page/1`:** a string of digits beyond the range (or beyond `@max_page`) is `@max_page`, so a
   huge page is an empty page, not page 1. Junk (`abc`, `-1`, empty) stays page 1. Unit-test both.
5. **T13, the sweep test** (ExUnit): walk `RockcutApiWeb.Router.__routes__()`; for every route with an
   `id`/`*_id` path param, substitute `99999999999999999999` (and keep valid keys for the other
   params, e.g. a real department key), call it as the owner (and, for routes a tablet can reach, as
   `taproomDevice`), and assert **404**, never 500. The test must fail if a new route is added that the
   plug doesn't cover: build the route list from the router, not by hand. Record a revert check (the
   plug disabled → the sweep fails) in the status file.
6. ExUnit for 2–4, each with a revert check where it's cheap.

## Rules (unchanged)

- Still **no servers and no Playwright**: the local servers run D53 until the lead hands them over
  after this stop. Don't touch :4002/:5174.
- `mix format` only on files you change, never repo-wide (it reformats the legacy tree).
- No push, merge, rebase, checkout, stash.
- `tests/COVERAGE.md`: a T13 row and rows for the gap-10 and `page` cases.

## Then

Run `mix compile --warnings-as-errors`, `mix test`, tsc and Vitest once. Append a "Lead decisions 3
done" section to `prompts/d55_builder_status.md` (what changed, the exceptions list from item 1 if
any, test counts, revert checks), commit with a message containing `decisions 3 done`, and stop. The
lead then moves the servers here and runs the full local Playwright (T1–T13).
