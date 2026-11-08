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
