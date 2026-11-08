# D55: builder status

2026-11-08 · builder → lead. Branch `d55-tablets-and-tidy` in `~/src/rockcut-d55`, not pushed.

## Stop 1 (stages 1 and 2)

Gate so far: `mix compile --warnings-as-errors` clean; `MIX_ENV=test mix test` green twice (1952 tests);
`tsc -p tsconfig.app.json` clean; `vite build` OK; vitest 222/222; `pnpm lint` 26 errors + 1 warning
(the ceiling; none in files D55 touches). Playwright: specs written, **not run** (no servers, per the brief).
`tsc -p tsconfig.e2e.json` has two errors that were already there (`task-board-phone.spec.ts`,
`beer-board-import.spec.ts`), none in the new specs.

No existing test was deleted, weakened or changed.

**Revert checks.** For each one, the fix was reverted and the new tests run again.

| Fix | Tests failing with the fix reverted |
|---|---|
| §2.3 CORS on parser errors | `parser_cors_test.exs`: 2/3 fail (the 400 and 413 cases; "disallowed origin" passes either way) |
| §2.4 memberships | `user_memberships_malformed_test.exs`: 14/14 fail |
| §2.5 sort order (API) | `recipe_ingredient_sort_order_test.exs`: 4/6 fail (the 2 that pass check behaviour that hasn't changed: explicit value, update without the key) |
| §2.1 401 recheck (`api.ts`) | `api.test.ts`: 8/13 fail (the 5 that pass check behaviour that hasn't changed: T3, T4, older token, login 401, D42 403) |
| §2.1 (`useAuth.loadMe`) | `useAuth.test.ts`: 2/4 fail (the keep-token cases; revoke and deactivate pass either way) |
| §2.5 `parseApiError` | `parseApiError.test.ts`: 7/15 fail |
| §2.2 tablet not-found, §2.6 category 404 | No unit test: `App.tsx` and the pages can't be imported under vitest (the data grid pulls in CSS). Covered by Playwright T5/T6/T10; **their revert check waits for the Playwright run.** |
| §2.7 Logger | `mix compile --warnings-as-errors` (it failed on `develop`) |

### Stage 1: API

- **§2.3 (4985)** `endpoint.ex`: `CORSPlug` now runs before the parsers. **Moving it alone wasn't enough.**
  When `Plug.Parsers` raises, Phoenix renders the error from the conn the endpoint was *called*
  with, so the CORS headers were still missing (test showed it). New `RockcutApiWeb.Parsers`
  (`lib/rockcut_api_web/plugs/parsers.ex`) wraps `Plug.Parsers` and re-raises its errors as
  `Plug.Conn.WrapperError` carrying the conn, so the headers survive. Origins unchanged.
  Test: `test/rockcut_api_web/endpoint/parser_cors_test.exs` (400 and 413 with
  `access-control-allow-origin` for an allowed origin; none for another).
- **§2.4 (4983)** `accounts.ex` `resolve_desired/1`: anything but a list of objects (a map, a string,
  `[null]`, `["x"]`, form-encoded either way) → `{:invalid_membership, …}` → 422 on `memberships`.
  It's shared by `POST /api/users` and `PUT /api/users/:id/memberships` (`PATCH /api/users/:id`
  doesn't read memberships). Authorization is unchanged (`Authz` as before). Test:
  `test/rockcut_api_web/controllers/user_memberships_malformed_test.exs` (owner and manager, each
  shape, nothing saved; PUT keeps the existing membership).
- **§2.5 (4981, API)** `brewing.ex`: `create_recipe_ingredient` / `update_recipe_ingredient` put a nil
  `sort_order` after the recipe's last ingredient (max + 1, not counting itself; 0 on an empty
  list). Test: `test/rockcut_api_web/controllers/recipe_ingredient_sort_order_test.exs`
  (persist-verified from the DB).
- **§2.7 (5165)** `reminders.ex`: removed `require Logger`.

### Stage 2: UI

- **§2.1 (5120)** `src/lib/api.ts`: a 401 for the current token (not the login request) calls
  `checkTokenEnded(token)`. That asks `GET /api/me` once with `fetch`, so the check's own 401 doesn't
  come back through the interceptor. A burst of 401s shares one in-flight check. Only a 401
  from `/api/me` unpairs (tablet) or signs out (person), and only if the token in storage is still
  the one checked. A 200, 5xx, network error or timeout (10 s) keeps it. The original request
  rejects with its own error. D33's older-token rule and D42's 403 are unchanged.
  `src/hooks/useAuth.ts` `loadMe`: it used to drop the token on any 401 from `/api/me` on its
  own, which would have undone the fix when the stray 401 hits `/api/me` itself. Now a real end
  is handled by the interceptor before `loadMe`'s catch runs. If the token is still stored there,
  the check found it alive: "Can't reach the server, retrying…" and retry.
  Tests: `src/lib/api.test.ts` (tablet and person: 200 keeps, 5xx/network keep and the next 401
  checks again, revoked tablet unpairs, deactivated person signed out, a burst makes one call
  and one reload, older token / no token / login make no check, a token changed during the
  check stands, D42 event) and `src/hooks/useAuth.test.ts`.
- **§2.2 (5119)** `src/App.tsx`: the person `<Routes>` moved into `personRoutes(flags)` (same routes,
  same gates). `PERSON_PAGES` is read from that table with all gates open
  (`createRoutesFromChildren`, catch-all dropped), so there's no hand-kept list. The tablet's
  catch-all `TabletFallback`: a URL that matches a person page shows `DeviceNotAvailable` as today;
  anything else shows the new `src/pages/NotFound.tsx` ("Page not found", Go to Home). A person's
  unknown URL still redirects Home.
- **§2.5 (4981, UI)** `src/lib/parseApiError.ts`: never throws. It handles `errors` values that are
  arrays or strings, shows `{errors: {detail}}` without the field name (`Bad Request`), gives any
  5xx or unreadable body "Something went wrong on the server. Please try again.", and anything
  else its message or a general one. 422 output is unchanged. Test:
  `src/lib/parseApiError.test.ts`.
- **§2.6 (4993)** `src/pages/settings/CategoryDetail.tsx`: on a 404, "Category not found" with a
  link (`Back to Ingredient categories`); the 404 isn't retried. Any other error shows an alert
  instead of spinning.
- **§2.9 rename**: exactly the spec's table (`index.html` title and Apple title, `vite.config.ts`
  manifest name/short_name/description, `sw.ts` push fallback, `Home.tsx`). Checked: no existing
  Playwright spec asserts the old strings.
- **Playwright specs (written, not run):**
  - `tests/regression/devices/stray_401.spec.ts`: T1–T4. The forced 401 comes from `page.route`
    on `/api/channels`. T1/T2 use the shared personas (only that page's localStorage is at risk,
    never the server token). T3 uses a temp device and revokes it; T4 a temp person, deactivated.
  - `tests/regression/devices/unknown_url.spec.ts`: T5, T6, and a person's unknown URL.
  - `tests/regression/app/parser_errors.spec.ts`: T7 (cross-origin `fetch` from the page to the API,
    400 and 413 readable), T8.
  - `tests/regression/brewery/recipe_sort_order.spec.ts`: T9 (UI add with Sort Order empty,
    persist-verified through the API), T10 (both URLs).
  - `tests/pwa-update/app_name.spec.ts`: T11 in the `pwa-update` project (`PWA_UPDATE=1`): the
    built manifest and title; then the old release's manifest → this one's.

### LEAD questions

1. **§2.3:** the reorder alone doesn't do it (see above). I kept the reorder and added a small
   `RockcutApiWeb.Parsers` wrapper instead of redesigning anything. OK, or would you rather
   put the CORS headers on in `ErrorJSON`/the endpoint some other way?
2. **§2.2:** the spec says "the app's normal not-found page", but there isn't one: people get
   redirected Home. I added a small `NotFound` page, used only on tablets. The spec also says
   "no new screens", so: OK, or would you rather the tablet redirect Home like a person?
3. **§2.2 merge:** moving the person routes into `personRoutes()` re-indents the whole route block in
   `App.tsx`. The overlap with D53 is now that whole block, not just the lines with new routes.
   D53's new routes go inside `personRoutes()` when merging.
4. **§2.5:** I read "null (or a missing value) means the end" as: null → end on create and update;
   **missing → end on create, unchanged on update.** Otherwise a partial update (amount only)
   would move the row. The UI always sends the key. OK?
5. **§2.4:** `memberships: null` on **create** stays "no memberships" (it was before, and the UI may
   rely on it), so it isn't a 422. On **PUT** it is now a 422 (it was a 500), because treating it
   as `[]` would remove every membership.
6. **§2.1:** while `/api/me`'s own 401 isn't confirmed, start-up shows "Can't reach the server,
   retrying…" (D34's screen). Fine for a blip?
7. **Spotted, out of scope:** `FieldDefinitionDialog.tsx` also sends `sort_order: null`, and
   `category_field_definitions.sort_order` is NOT NULL, so it probably 500s the same way. New task?
8. Spec §5 mentions "Playwright's tablet projects". There aren't any: the tablet specs run in
   `chromium` with the device personas' storage state. T1–T3 on the Pixel would be the real check,
   and so would T11's "installed tablet shows the new name": Playwright can only check the
   manifest it's served.

Next: stage 3 (§2.8 migration; `leftoverTabletSession.ts` removal as its own commit), `COVERAGE.md`
rows, then stop 2.

## Stop 2 (lead decisions 1, stage 3, §2.10)

**Non-Playwright gate (all passing):** `mix compile --force --warnings-as-errors` clean;
`MIX_ENV=test mix test` green **twice** (1958 tests: 1952 + 5 for §2.10 + 1 migration test);
`tsc -p tsconfig.app.json` clean; `vite build` OK; vitest 218/218 (222 at stop 1, minus the 4 shim
tests removed in 3b); `pnpm lint` 26 errors + 1 warning (the ceiling, none in D55's files).
`tsc -p tsconfig.e2e.json` has only the 2 errors that were already there. Playwright: written, not run.

### Lead decisions 1

- **1. Parser wrapper:** `RockcutApiWeb.Parsers` now rescues only the parser's own errors
  (`Plug.Parsers.ParseError`, `RequestTooLargeError`, `UnsupportedMediaTypeError`,
  `BadEncodingError`, and `Plug.BadRequestError` / `Plug.TimeoutError`, which the JSON parser
  raises while reading the body). Anything else is raised as before. `parser_cors_test` still passes.
- **2. Idea Boards on tablets:** a `test.fixme` in `tests/regression/devices/unknown_url.spec.ts`
  ("after the D53 merge: a tablet opens Idea Boards, not 'Page not found'") checks `/boards`,
  `/boards/1` and `/boards/1/cards/1`, with a note on what to do at the merge. I haven't merged
  `develop`.
- **5. A session that really ended ends on the first try at start-up:** covered by
  `src/hooks/useAuth.test.ts`, "a revoked tablet: recheck 401 unpairs on the first try" and "a
  deactivated person: recheck 401 signs out on the first try". Each asserts exactly one `/api/me`
  recheck, `unreachable` false (no "retrying" screen), the token gone and one reload. After the
  reload there is no token, so the login or setup screen shows; nothing loops. On the page:
  Playwright `stray_401` T3/T4.

### §2.10 field definition sort order (T12)

- **The 500 was real.** A test was written first and failed with `Exqlite.Error NOT NULL constraint
  failed: category_field_definitions.sort_order` (3 of 5 failing: null on create, missing on create,
  null on update). Those failing runs before the fix are the revert evidence.
- Fix: `brewing.ex`. The §2.5 helper is now `put_end_sort_order(changeset, schema, parent)`, used by
  both recipe ingredients (`:recipe_id`) and field definitions (`:category_id`). It works the same
  way: null or missing on create → end; null on update → end; left out of an update → stays.
- Tests: `test/rockcut_api_web/controllers/field_definition_sort_order_test.exs` (5);
  `recipe_ingredient_sort_order_test.exs` still passes after the helper change. Playwright T12 is in
  `tests/regression/brewery/recipe_sort_order.spec.ts` (Add Field with Sort Order empty,
  persist-verified through the API).
- Spec: added §2.10 and scenario T12.

### Stage 3a: column migration (commit `8a53bec`)

- `priv/repo/migrations/20261108120001_drop_unread_session_columns.exs`: `up` drops the
  `user_sessions_device_token_id_index`, then `user_sessions.device_token_id` and
  `users.legacy_tokens_revoked_at`. `down` adds both back, empty, with the foreign key and the index.
  The `UserSession` schema comment that named the column is gone. Nothing else in `lib`, the
  seeds or the UI named either column.
- **Up, down, up on this worktree's dev DB, by hand:** after up, both columns and the index are gone;
  after down, they're back (FK `REFERENCES device_tokens ON DELETE CASCADE` and the index);
  after up again, gone. `pragma integrity_check` ok and `foreign_key_check` empty each time;
  the 19 users are kept.
- New test: `test/rockcut_api/migrations/drop_unread_session_columns_test.exs` (up → down → up
  inside the test's transaction; columns and index; a live sign-in still authenticates throughout).
- **Changed existing test (shape, not meaning):**
  `test/rockcut_api/migrations/revoke_tablet_personal_sessions_test.exs` (D54) writes
  `device_token_id`, which no longer exists. Its `setup` now runs D55's migration down first,
  inside the same transaction, so it tests D54's migration against the schema it ran on. The
  assertions are unchanged.
- **Rollback note for the release PR:** rolling the API back past D55 needs the pre-deploy snapshot,
  because an older image selects these columns. Running this migration's `down` also works; the
  columns come back empty, which is all an older image needs.

### Stage 3b: shim removal (commit `35c6c7b`, can be dropped on its own)

- Deleted `src/lib/leftoverTabletSession.ts` and `src/lib/leftoverTabletSession.test.ts` (4 Vitest
  tests), and the import in `src/main.tsx`.
- **Deleted Playwright cases**, because they test only the shim: in
  `tests/regression/devices/shared_device_no_personal_login.spec.ts`, "S249: left mid 'Sign in as
  me' at the release…" and "S251 (4988): only a stale set-aside tablet token…". Both seed the
  pre-D54 `rockcut_device_token` storage that only the shim reads. The live-revoke S251 case stays.
  A comment marks where they were.
- `tests/COVERAGE.md`: the D54 S249 and S251 rows now say what was removed and what still covers them.

### `tests/COVERAGE.md`

New D55 section: T1–T12 plus the extra cases (burst, `parseApiError`, a person's unknown URL,
the pending Idea Boards check, §2.7, §2.8), each with its layer and whether a revert check was
recorded. T5 and T10 note that their revert check waits for the Playwright run.

### LEAD questions

1. **Still open from stop 1:** the T5/T10 revert checks (Playwright only) and all of T1–T12 in a
   browser wait for servers. Tell me when D53 frees :4002/:5174, or run them yourself.
2. The migration date `20261108120001` sorts after D53 Part 1's `20261106120001`. If D53 Part 2
   adds a migration dated after 2026-11-08, the order still works (they don't touch the same tables).
   No action, just noting it for the merge.

Next: wait for the go-ahead to merge `develop` (D53), then `personRoutes` + the `/boards` routes on
tablets, un-fixme the pending check, and the full local Playwright run.

## Lead decisions 2 done

- **Migration version clash fixed:** renamed to
  `rockcut_api/priv/repo/migrations/20261108140001_drop_unread_session_columns.exs`, so it sorts after
  D53 Part 2's `20261108120001` and `…120002`. The module name (`DropUnreadSessionColumns`) and
  contents are unchanged. The version and `Code.require_file` path are updated in
  `test/rockcut_api/migrations/drop_unread_session_columns_test.exs` and
  `test/rockcut_api/migrations/revoke_tablet_personal_sessions_test.exs`. Nothing else names it; the
  stop-2 notes above still say `…120001` as a record of what was there.
- **Up/down/up again** on this worktree's dev DB, after rolling back the old version in both the dev
  and the test DB:
  - up: columns and index gone, `schema_migrations` has `20261108140001`;
  - down: both columns and the index back;
  - up again: gone.
  
  `integrity_check` ok and `foreign_key_check` empty each time; 19 users kept. The old
  `20261108120001` entry no longer exists in either DB.
- `MIX_ENV=test mix test` once: **1958 passed**.

That's everything that can be done before D53 lands. Waiting for the go-ahead to merge `develop`.

## Lead decisions 3 done (§2.11 + T13, after the D53 merge)

Started from `564015c`. The code is in `f5bf748`; this status and `COVERAGE.md` follow in the next commit.

**Gate:** `mix compile --force --warnings-as-errors` clean; `MIX_ENV=test mix test` **2157 passed**
(2141 after the merge, plus 16 new); `tsc -p tsconfig.app.json` clean; Vitest **230** passed.
No servers, no Playwright.

### What changed

1. **URL ids: `RockcutApiWeb.Plugs.PathIds`** (`lib/rockcut_api_web/plugs/path_ids.ex`). Every
   `path_params` entry named `id` or ending in `_id` must pass `RockcutApi.Ids.parse/1`, else the plug
   halts with 404 `{"errors":{"detail":"Not found"}}` (FallbackController's JSON).
   - **Placement:** last in both signed-in pipelines (`:authenticated` and `:device_allowed`), not in
     `:api`. That way 401 (not signed in), the password-reset gate and D33's tablet 403 still come
     first, and every scope that reaches a controller with an id goes through it. The public `:api`
     scope has no id params (health, session, device_tokens, `calendar/:token`).
   - **Params checked:** `id` (175 routes), `daily_item_id`, `item_id`, `link_id`, `note_id`,
     `step_id`, `user_id`.
   - **Left alone (keys, not ids):** `dept`, `board`, `key`, `token`, `on_date`, and the vessel
     `index`, a list position.
   - **Exceptions list (`@not_ids`): empty.** Every `*_id` URL param is a numeric row id.
   - D53's own `Ids` calls in the Boards and the task boards are untouched.
   - Junk in the URL (`abc`, `0`, `-1`) is now 404 too; no existing test expected anything else.
2. **Body and query ids: `RockcutApiWeb.Plugs.ParamIds`** (`plugs/param_ids.ex`), placed right after
   `PathIds`. Any key `id`, `ids`, `*_id` or `*_ids`, at any depth in the query or the JSON/form
   body, whose value (or list element) is an out-of-range number (an integer, or a string of
   digits) → **422 `{"errors":{"<key>":["is out of range"]}}`**, before the controller.
   - Only out-of-range numbers are refused. Junk keeps the route's own answer (changeset 422, 404),
     and an in-range id that names no row is the route's business, as before.
   - `before_id` is exempt (D38: unknown → end of the day; tested).
   - **Why a plug rather than per-context fixes:** a probe before the change showed the driver's 500
     on every area named in item 2, in both bodies and queries: shift `position_id`, time off
     `user_id`, devices `home_department_id`, recipes `brand_id`, `GET /api/shifts?department_id=`,
     `GET /api/recipe_ingredients?recipe_id=`. A per-context fix would have to find every cast and
     every query. This is the "one plug" approach applied to bodies.
   - **This means 422 even where a route answers 404 for a missing reference.** For an out-of-range
     value that's a malformed input, not a missing row. LEAD: say if you want specific routes to
     answer 404 instead.
   - Buy-a-Beer has no body ids; its URL `:id` is covered by `PathIds`.
3. **Ids under other key names**, fixed where they're read with `RockcutApi.Ids`:
   - memberships `department` (an id or a key) past the range → 422 "unknown department"
     (`accounts.ex`, `get_department_by_id/1`). It was a 500 on POST and PUT.
   - messages `before` (the page cursor) → 422 `before` for anything `Ids.filter` refuses
     (`message_controller.ex`). It was a 500 for both junk (`String.to_integer/1`) and range.
4. **History filters (gap 10):** `Ids.filter/1` returns `{:ok, nil}` for an absent or empty value,
   `{:ok, id}`, or `:error`. Task-board History `task_id` and Boards History `card_id` → **422** on
   that param for `1e20`, `abc`, `-1`, `0` and out-of-range values. **Absent or empty
   (`?task_id=`) is still the whole History.** I treated empty as absent, since that's what an empty
   form field sends.
5. **`Ids.page/1`:** a positive string of digits (or integer) is capped at `@max_page`, so a huge
   page is the last, empty page. Junk (`abc`, `-1`, `0`, empty, `1e3`, floats) is page 1.

### Tests

- **T13** `test/rockcut_api_web/plugs/out_of_range_ids_sweep_test.exs`: built from
  `Router.__routes__()` (no hand list). Every route with an id param (**178**, `/dev` excluded) gets
  `99999999999999999999` there and real keys for the rest (`bar`, `all`, …).
  - As the owner: all 404.
  - As `taproomDevice`: 404 or exactly DeviceGate's 403; at least 14 reach the id check and are 404
    (shifts, production steps and CIPs, Boards card reads, the tablet's task board).
  - A new route is swept automatically; one outside the plugs' pipelines would 500 and fail the
    test. A guard test asserts there are at least 178 routes, so the sweep can't go empty.
- `plugs/param_ids_test.exs`: body ids on 10 routes, 422 on the key and nothing saved
  (persist-verified by counts); query ids on 3 routes; junk not the plug's; `before_id` past the
  range moves the task last.
- `ids_test.exs` (`parse`, `filter`, `page`); `controllers/history_filter_test.exs` (both
  Histories, absent/empty/junk, huge page empty; messages `before`).
- `user_memberships_malformed_test.exs`: 2 new tests (department past the range, as an integer and
  as a string).

**Revert checks:**

| Reverted | Result |
|---|---|
| `PathIds` removed from the router | sweep 1/3 passed; both T13 tests fail with `Exqlite.Error argument error: 99999999999999999999` (the 500) |
| `ParamIds` removed from the router | `param_ids_test` 2/4 passed; body and query tests fail with the same driver error |
| `ids.ex`, both History controllers, `message_controller.ex`, `accounts.ex` back to `f5bf748~1` (plugs on) | 7 fail (`page`, `filter`, messages `before`, both History filters, both memberships `department`); the 16 that pass check behaviour that hasn't changed (`parse`, junk pages) |

### Existing tests changed

`test/rockcut_api_web/controllers/idea_board_fix_cycle_1_test.exs` (D53) asserted the old rule: a
History `card_id` / `task_id` past the range was **ignored** (200, whole History). Lead decisions 3
item 3 changes that to 422, so those two assertions now expect 422. The `page=<huge>` assertions now
also check `data: []`. Nothing else was changed or weakened.

### LEAD questions and observations

1. **Body ids answer 422 everywhere, never 404** (item 2 above). Keep, or name the routes that should
   answer 404?
2. **Spotted, outside §2.11:** a recipe with an **in-range id that names no brand** (`brand_id: 12345`,
   `-1`, `0`) still 500s (`Ecto.ConstraintError`). `Recipe.changeset` has no
   `foreign_key_constraint(:brand_id)`. Other legacy brewing schemas may have the same gap. That's
   "a missing reference", not "out of range", so I didn't fix it. A new task, or into D55?
3. Anonymous requests still get 401 before any id check, and tablets get 403 on people-only routes
   before it, because both plugs sit after auth.

Ready for the lead's full local Playwright run (T1–T13).
