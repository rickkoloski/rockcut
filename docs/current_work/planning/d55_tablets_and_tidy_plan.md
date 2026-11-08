# D55: Tablets and tidy-up — Plan

2026-11-08 · lead. **Spec:** `specs/d55_tablets_and_tidy_spec.md` (approved). **Tasks:** 5120, 5119,
4985, 4983, 4981, 4993, 5165, 4963, plus the app rename (§2.9). **Branch:** `d55-tablets-and-tidy` in
`~/src/rockcut-d55`, from `develop` @ `8e434ce`.

D53 Part 2 is on DEV meanwhile. D55 merges `develop` once D53 lands (overlap: `App.tsx`, `router.ex`
route lines only), and gets DEV after D53 is released.

## Stages (each its own commits; stops marked ■)

1. **API** (§2.3, §2.4, §2.5 API side, §2.7).
   - `CORSPlug` before `Plug.Parsers` in `endpoint.ex`; tests for 400/413 with and without an
     allowed origin.
   - `POST /api/users` (and update, if it shares the path): malformed `memberships` → 422 on
     `memberships`. Each shape from the spec, nothing saved. Through `Authz` as today.
   - Recipe ingredient `sort_order` `null`/missing → end of the list, create and update.
   - Remove `require Logger` (`reminders.ex:12`); `mix compile --warnings-as-errors` clean.
2. **UI** (§2.1, §2.2, §2.5 UI side, §2.6, §2.9).
   - `lib/api.ts`: one shared `GET /api/me` check before unpairing or signing out; vitest for every
     branch in the spec (200 keeps, 401 ends, network/5xx keeps, a burst makes one call).
   - Tablet unknown route → the normal not-found page; real personal pages keep
     `DeviceNotAvailable`. Decide "real page" from the route table, not a hand list, if that's simple.
   - `parseApiError` copes with any body (vitest).
   - Ingredient category 404 → "Category not found" + link.
   - The rename, exactly the table in §2.9.
   - Playwright specs for T1–T11, **written, not run** (no servers yet).
   - ■ **Stop 1.**
3. **Leftovers** (§2.8), in two separate commits so the second can be dropped:
   - a. A reversible migration dropping `users.legacy_tokens_revoked_at` and
     `user_sessions.device_token_id`, and any schema field or comment that names them. Check up,
     down, up.
   - b. Remove `lib/leftoverTabletSession.ts`, its call and its tests. **Its own commit**, because it
     waits on Matt's tablet check (task 5164).
   - `tests/COVERAGE.md` rows for D55.
   - ■ **Stop 2:** the non-Playwright gate passing. Playwright runs when the lead hands over servers.

## Gate

Workflow §3: `mix test` twice, `mix compile --warnings-as-errors`, `tsc`, `vite build`, vitest, lint
no worse than 26 errors, full local Playwright (lead, after D53 frees the servers).

## Risks

- **§2.1 is the only one with teeth:** a wrong branch either unpairs tablets (as today) or never
  signs anyone out. The tests must cover a revoked tablet and a deactivated person really ending.
- The column drop makes an API rollback past D55 need the snapshot; say so in the PR.
