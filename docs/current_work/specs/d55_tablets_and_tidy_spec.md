# D55: Tablets and tidy-up — Spec

**Status:** APPROVED by Matt 2026-11-08.
**Backlog:** PortableMind project 254, tasks 5120, 5119, 4985, 4983, 4981, 4993, 5165, 4963.
**Order:** after D53 is on prod; its own release. Branches from `develop` once D53 is merged.
**Shape:** small, independent fixes. No new screens, no new data. One migration (drop two unread
columns).

## 1. Why

Each item was found by a QA pass and parked. One carries real risk at the bar (5120: a tablet can
unpair itself mid-shift); the rest are wrong messages, 500s that should be 422s, and leftovers from
earlier releases. Bundled, they're one cheap release.

## 2. Items

### 2.1 One stray 401 shouldn't unpair a tablet or sign a person out (5120)

**Today:** `src/lib/api.ts` treats any 401 for the current token as "signed out": a tablet forgets its
pairing (`markUnpaired()`, so it needs a new pairing code) and a person is sent to the login page.
D54's QA forced a 401 on one route (`/api/channels`) with `/api/me` fine, and the tablet unpaired. A
proxy or deploy blip returning 401 would do the same at the bar.

**Change:**
- On a 401 for the current token (not the login request), **ask `GET /api/me` once** with the same
  token before doing anything.
  - `/api/me` 401 → the token really ended: unpair (tablet) or sign out (person), as today.
  - `/api/me` 200 → keep the token; the original request fails with its normal error.
  - `/api/me` fails another way (network, 5xx) → keep the token; the next request will try again.
- Several 401s at once share one check (no burst of `/api/me` calls).
- Unchanged: a 401 for an older token or no token is ignored (D33); the 403
  `password_reset_required` handling (D42); a revoked or deactivated tablet still shows "This tablet
  was unpaired".

**Tests:** a 401 on another route with `/api/me` 200 keeps the pairing and the session (tablet and
person); a real revoke still unpairs; a deactivated person is still signed out; a burst of 401s makes
one `/api/me` call.

### 2.2 An unknown URL on a tablet says "not found" (5119)

**Today:** on a paired tablet, a route that doesn't exist (`/nonexistent-xyz`) shows "Not available
on a shared device. This page needs your own account…", sending staff to their phone for a page that
doesn't exist.

**Change:** unknown routes on a tablet show the app's normal "not found" page (with Go to Home). Real
pages a tablet can't use keep today's message.

**Tests:** both cases on a tablet; a person's unknown URL unchanged.

### 2.3 Errors from the request parser reach the UI (4985)

**Today:** malformed JSON (400) and too-large bodies (413) are refused by `Plug.Parsers`, which runs
**before** `CORSPlug` in `endpoint.ex`. Those answers carry no CORS headers, so the browser reports
"Failed to fetch" instead of the error.

**Change:** `CORSPlug` runs before `Plug.Parsers`, so every answer carries the same CORS headers.
No change to which origins are allowed.

**Tests:** malformed JSON and an oversize body from an allowed origin get 400/413 **with**
`access-control-allow-origin`; a disallowed origin still gets none.

### 2.4 Bad `memberships` on a new person is a 422, not a 500 (4983)

**Today:** `POST /api/users` with malformed `memberships` (a map, a string, `[null]`, form-encoded)
returns 500 for owners and managers. Nothing is saved. The UI never sends these.

**Change:** 422 with a field error on `memberships`. Same for `PATCH`/`PUT` if it shares the path.

**Tests:** each malformed shape → 422, nothing saved.

### 2.5 Recipe ingredient with no sort order saves (4981)

**Today:** Recipe → Grain bill → Add ingredient with Sort Order empty sends `"sort_order": null` →
500; the dialog stays open with no message, because the UI's error helper can't read a 500 body
(console `i.join is not a function`). `PUT … {sort_order: null}` → 500 too.

**Change:**
- `null` (or a missing value) means **the end of the list**, on create and update.
- `parseApiError` copes with any error body (500, HTML, empty) and shows a general message instead
  of throwing.

**Tests:** create and update with `null`; `parseApiError` with odd bodies (vitest).

### 2.6 A category that doesn't exist says so (4993)

**Today:** `/ingredients/categories/999999` (or an old `/settings/categories/999999` link) gets a 404
from the API and the page spins forever.

**Change:** "Category not found" with a link back to Ingredient categories.

**Test:** the 404 path shows the message and the link.

### 2.7 Warnings-as-errors compiles again (5165)

Remove the unused `require Logger` at `reminders.ex:12`. **The gate adds `mix compile
--warnings-as-errors`** so it stays clean.

### 2.8 Remove D51 and D54 leftovers (4963, D54's follow-ups)

- `users.legacy_tokens_revoked_at`: unread since D51 part 2 (prod since October).
- `user_sessions.device_token_id`: unread since D54 (prod since 2026-11-04).
- `rockcut-ui/src/lib/leftoverTabletSession.ts`: D54's start-up shim that settles a tablet left in
  the middle of a personal session. Every tablet has started the D54 app by now (**confirmed by
  Matt's check, task 5164**), so it has nothing left to do. Remove it and its call and tests.

One reversible migration removes both columns. **Rollback note for the release PR:** rolling the API back
past D55 needs the pre-deploy snapshot (an older image selects these columns).

### 2.9 The app is called "Rock Cut Brewing" (Matt, 2026-11-08)

"Rockcut Scheduler" dates from when the app was only the staff scheduler.

| Where | Today | Now |
|---|---|---|
| `<title>` (browser tab, install prompt) | Rockcut Scheduler | Rock Cut Brewing |
| Manifest `name` (`vite.config.ts`) | Rockcut Scheduler | Rock Cut Brewing |
| Manifest `short_name` (home-screen label) | Rockcut | Rock Cut (launchers cut about 12 characters) |
| Manifest `description` | Rockcut Brewing Co — staff scheduling | Rock Cut Brewing Co — brewery and staff app |
| `apple-mobile-web-app-title` | Rockcut | Rock Cut |
| Push title fallback (`sw.ts`) | Rockcut | Rock Cut Brewing |
| Home greeting / tablet fallback (`Home.tsx`) | Welcome to Rockcut / Rockcut | Welcome to Rock Cut Brewing / Rock Cut Brewing |

Installed Android apps (the tablets) pick up the new name by themselves after the release; iPhones keep
the old label until re-added. Code names (`rockcut_api`, `rockcut-ui`, Fly apps, storage keys) don't
change.

**Test:** the built manifest and the page title (Playwright, PWA project).

### 2.10 Field definition with no sort order saves (added at stop 1, lead decisions 1)

**Today:** Ingredient categories → a category → Add Field with Sort Order empty sends
`"sort_order": null` → 500 (`NOT NULL constraint failed: category_field_definitions.sort_order`,
confirmed by a test before the fix). Same for `PUT … {sort_order: null}`.

**Change:** as §2.5: `null` (or missing on create) means the end of the category's fields; left out
of an update, the position stays.

**Tests:** create and update with `null`, missing on create, missing on update (ExUnit); T12
(Playwright).

### 2.11 Out-of-range ids are 404, not 500, everywhere (found in D53's DEV gate)

D53 added `RockcutApi.Ids` (`parse/1`: a positive integer within SQLite's range, else nil) and used it
on the Boards and the task boards. The rest of the app still answers 500 (`Exqlite.Error`) to an id
like `99999999999999999999` in the URL: shifts, users, Buy-a-Beer, schedule events, time off,
availability, notifications, production tanks and templates, brands, recipes, departments, devices
(13 of 13 routes sampled).

**Change:** a URL id beyond the range is 404 on every route, and a body id beyond it is 422 (or 404 where
the route already answers 404 for a missing reference). Prefer one plug over the router's `:id`-style
params that answers 404 before any controller runs, plus `RockcutApi.Ids` where contexts parse body ids.
Never a 500. **Test:** a route-table sweep with an out-of-range id on every `:id`-style route.

## 3. Not in D55

- Task-board settings and the View filter (4994, 4991), the manager/no-department person (4984), the
  31-day range (4992), the repeat twin (5202): each needs a decision from Matt first.
- Brewing-side items (4982, 4986, 4987, 4989): a bundle of their own.

## 4. Scenarios

| # | Scenario |
|---|---|
| T1 | A tablet gets a 401 on one route while `/api/me` is fine: it stays paired and keeps working |
| T2 | A person gets a 401 on one route while `/api/me` is fine: they stay signed in |
| T3 | A tablet revoked in Admin → Shared devices still unpairs on its next request |
| T4 | A deactivated person is still signed out on their next request |
| T5 | A tablet typing an unknown URL sees "not found" with Go to Home |
| T6 | A tablet opening a real personal page still sees "needs your own account" |
| T7 | Malformed JSON from the UI's origin shows the server's error, not "Failed to fetch" |
| T8 | Malformed `memberships` → 422 |
| T9 | Add a grain bill ingredient with Sort Order empty → saved at the end of the list |
| T10 | A missing ingredient category → "Category not found" |
| T11 | The browser tab and a fresh PWA install say "Rock Cut Brewing"; an installed tablet shows the new name after the update |
| T13 | An out-of-range id on any route → 404, never 500 |
| T12 | Add a field to an ingredient category with Sort Order empty → saved at the end of its fields |

## 5. Gate

The usual three-environment workflow. DEV QA is a short targeted pass (T1–T10 plus a regression sweep
of tablets and sign-in); **T1–T3 on the Pixel** if Matt has time, otherwise Playwright's tablet
projects.
