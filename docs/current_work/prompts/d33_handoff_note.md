# D33: Taproom device access — PR handoff note

**Branch:** `d33-taproom-device-access` (stacked on `d32-schedule-events`)
**SHA for DEV:** the branch HEAD when the lead pushes. The code last changed at
`826ae0a`; the commits after it only touch docs (this note, the tablet guide).
**Spec:** `docs/current_work/specs/d33_taproom_device_access_spec.md` · **Plan:**
`docs/current_work/planning/d33_taproom_device_access_plan.md` · **Backlog:** 3938, 3939

## What changed

- **Device accounts.** `users.kind` (`person` | `device`) plus `home_department_id`.
  - A device is never an owner, a member, schedulable or a password user. The
    changesets and `Accounts` enforce this, and it holds even for owners.
  - Roster, Users & Roles, All-staff recipients and assignee validation exclude devices.
- **Pairing and tablet tokens.**
  - Codes are 8 characters, single use, last 10 minutes and are stored as HMAC
    hashes. At most 5 wrong codes per IP per 10 minutes (ETS).
  - Tokens are `dev_…`, stored as HMAC hashes, checked on every request, with no
    expiry. `last_seen_at` is updated at most once a minute.
  - Signing out on a tablet revokes its token.
  - `AuthPlug` refuses signed session tokens for device users.
  - Admin → Shared devices: owners do create, rename, deactivate and delete;
    owners and home-department managers pair and revoke. All of it is audited.
- **Two deny-by-default gates.**
  - `DeviceGate` in `:authenticated`: only the `:device_allowed` scope (13
    routes) is open to devices.
  - The first `Authz.can?/3` clause sends devices to `Authz.Device`, which
    explicitly denies `:post`.
  - `scope/3` has device clauses, devices get their own capabilities, and
    `/api/me` has a new top-level `shared_devices` field.
  - `authz_boundary_test` now also flags `kind` checks outside Authz.
- **Tablet UI.**
  - Setup: "Set up as a shared device" on the login screen.
  - App bar: a "Shared device · Taproom" chip, "Sign in as me", and Sign out
    with a re-pair warning. No bell.
  - Nav: Home, View Schedule, Taproom, and Messages (All-staff, Taproom).
  - Typed URLs to anything else show a device-only "Not available on a shared device" page.
  - The schedule is read-only (no claim, time off or templates), and channels
    show "Shared devices can read but not post."
  - A personal sign-in keeps the device token aside and returns to the device
    session after 5 idle minutes (`PERSONAL_IDLE_MS`).
- **3939 (every user).** An unknown or forbidden channel URL redirects to
  `/messages`. It no longer polls into 403s, and a refused send shows an error
  and keeps the draft.
- **Test support.**
  - A `taproomDevice` persona whose mint creates a real `dev_` token.
  - `mix rockcut.synthetic.pair_code` and `Release.pair_synthetic_device/1`
    print a real pairing code.
- **Docs.** `docs/process/taproom_tablet_setup.md` and `tests/COVERAGE.md`.

**Found and fixed during the local gate** (all in new D33 code, none released):
- Pair/revoke by another department's manager now returns 403, per spec S3. It was 404.
- A 401 for a request that didn't carry the current token no longer resets
  the session. Before, it bounced "Sign in as me" back to the tablet.
- A late `/api/me` answer no longer puts back a session that was set aside.
  The dev build's StrictMode double-loads `/api/me`.
- Both races have specs that fail with the fix reverted and pass with it
  restored (checked by hand, below).

## Migrations

**Two migrations, both reversible:**
- `20260930120001_add_device_kind_to_users`: `kind` (default `person`) and
  `home_department_id`.
- `20260930120002_create_device_tokens_and_pairing_codes`.

On a scratch copy of the local dev DB they went up, down two steps, and up
again. The users table was intact and all 17 existing users became `person`.
DEV is their first run at boot. No new dependency, secret or config.

## Scenarios DEV must exercise

S1–S14 from the spec, plus 3939. Personas:
- **Positive:** `owner`, `barMgr`, `taproomDevice`, `bartender1`.
- **Negative:** `breweryMgr` (S3), `floater` (3939), `bartender1` (S10), and
  `taproomDevice` against every blocked page (S9).
- **S2 and S11** need a second, signed-out browser for the tablet. Get a code
  from Shared devices as `barMgr`, or with
  `Release.pair_synthetic_device("taproomDevice")`.
- **S13** also needs a real 5-minute idle wait on a real tablet or browser.
  Locally it only ran on a mocked clock.

## ⚠ LIMITATIONS: what local could NOT tell us

1. **Whether Fly overwrites a client-supplied `fly-client-ip`. The DEV pass
   must confirm this.**
   - **Why it matters:** the wrong-code limit (5 per 10 minutes) is keyed on
     that header. `DeviceTokenController.client_ip/1` trusts it whenever it is
     present and only falls back to `conn.remote_ip` when it's absent. If
     Fly's proxy passes a client's value through, an attacker can send a new
     value on every request and never hit the limit.
   - **Test on DEV:** POST `/api/device_tokens` with a wrong code 6 times,
     each with a *different* made-up `fly-client-ip` header. The 6th must be
     **429**. If it isn't, Fly isn't overwriting the header and the limiter
     can be dodged; key it on `remote_ip` or Fly's own client-IP source instead.
   - **Where the code trusts the header without Fly setting it:**
     - Locally, where nothing sets it. The Playwright tablet contexts rely on
       this and send a random value, local profile only.
     - Any request that reaches the machine without going through Fly's
       public edge proxy: the private `.internal`/6PN address, Flycast,
       `fly proxy` port forwarding, or `curl` from `fly ssh console`. All of
       these need Fly org access.
2. **Personal tokens stay valid after a tablet session ends (backlog 3991).**
   When a person signs out on a tablet, or the tablet returns after 5 idle
   minutes, only the tablet's copy of their 30-day session token is deleted.
   The token stays valid on the server, as with every logout today. Guided
   Access is the mitigation. A related existing gap is backlog 3992: calendar
   feed URLs keep working after a user is deactivated.
3. **The rate limiter is per machine and in memory.** It resets on every
   deploy or restart, and it would be wrong if the API ever scaled to more
   than one machine. That's fine for today's single machine (D28).
4. **Rotating `SECRET_KEY_BASE` signs out every tablet.** Codes and tokens are
   HMAC hashes keyed by it, so every tablet would need pairing again.
5. **The idle return is only tested with a mocked clock.** Five real minutes
   on an iPad, and Guided Access or Android pinning, are manual only.
6. **One race spec is weaker on DEV.** The late-`/api/me` spec relies on the
   dev build's StrictMode double call. DEV serves a production build with one
   `/api/me`, so there the spec holds nothing and passes trivially: its
   annotation shows `held /api/me: 0`. The code fix doesn't depend on
   StrictMode.
7. **Installed PWA (service worker, home-screen web app) with a device token
   is untested.** The local dev server has no service worker. Also, iOS keeps
   a home-screen web app's storage separate from Safari, so the tablet guide
   says to install first and pair inside the installed app. A real iPad on
   DEV should confirm this.
8. **`last_seen_at` write load is unmeasured.** It's at most one write a minute
   per tablet, on the request path, with one SQLite connection. Real tablets
   poll `/api/channels` every 20 s.
9. **Seed tablet tokens pile up briefly.** The synthetic `[SEED] Playwright
   tablet` tokens are pruned only once they're older than 8 hours, at the next
   mint or setup. Deleting a device leaves its audit rows with no target; the
   detail keeps the name.

## Local gate evidence (2026-09-30)

| Check | Before D33 | After D33 |
|---|---|---|
| `MIX_ENV=test mix test` | 685, 0 failures | **777, 0 failures** |
| Parity dir `test/rockcut_api/authz_parity/` | — | **unchanged** (`git diff 9e28d9d` is empty) |
| `authz_boundary_test` | green | **green** (now also flags `kind`) |
| `npx tsc --noEmit -p tsconfig.app.json` | 3 errors | **3 errors** (all in `shared/ui-components/datagrid-extended`; none in D33 files) |
| `pnpm exec vite build` | green | **green** |
| `pnpm lint` | 27 problems | **27 problems** (none in D33 files) |
| `npx playwright test` (local) | 53 passed, 1 skipped | **72 passed, 1 skipped**, two consecutive full runs |

**The 3939 revert-and-rerun,** reverting only the `cfa0b17` `Messages.tsx` fix
with a temporary WIP commit that was dropped afterwards:

| Run | Result |
|---|---|
| Fix reverted | 5 failed, 1 passed |
| Fix reverted, with only the Send button's `aria-label` put back | **4 failed, 2 passed** |
| Fix restored | **6 passed** |

- **Fix reverted:**
  - floater `/messages/managers`: the URL stays on `/messages/managers`.
  - taproomDevice `/messages/managers` and `/messages/dept:brewery`: the URL
    stays on the bad key.
  - Both bartender1 specs time out on the Send button. Its `aria-label` came
    with the fix, so these two failures say nothing about behavior, which is
    why there's a second run.
- **Fix reverted, `aria-label` put back:**
  - The three redirect specs fail as above.
  - The refused-send spec fails: "Expected substring: You can't post in this
    channel. / element(s) not found".
  - The normal-post control passes (the other pass is the auth setup).
- **Fix restored:** all six pass (the auth setup and the five specs).

**Race fixes, also reverted and rerun by hand:**
- **Stale 401 (`4f5190a`):** with the fix reverted, the in-flight spec fails
  ("Execution context was destroyed", meaning the page reloaded). Restored,
  it passes.
- **Late `/api/me` (`7074c2e`):** with the fix reverted, the late-answer spec
  fails ("Expected: false, Received: true", meaning the tablet session came
  back). Restored, it passes.

**Every write was checked after a reload:**
- Device create (S1).
- Pairing, with the tablet reloaded and the manager page reloaded (S2).
- Revoke (S11) and deactivate (S12), each reloaded on both the manager and
  tablet sides.
- A personal time-off request (S13).
- A message post (3939 control).
- Each spec reads the data back through the API as well.

**Migration round trip:** on a scratch copy of the dev DB: up, down 2 steps,
up. The rows were intact.
