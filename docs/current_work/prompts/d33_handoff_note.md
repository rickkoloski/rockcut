# D33: Taproom device access — PR handoff note

**Branch:** `d33-taproom-device-access` (stacked on `d32-schedule-events`)
**SHA for DEV:** the branch HEAD when the lead pushes. Code last changed at
`bbd5195` (DEV fix cycle 1); later commits touch docs only.
**History:** local gate → review round 2 → DEV pass 1 at `1aa70d5` (13/14
scenarios; S12 failed; gaps G1–G9) → **fix cycle 1 of 2** (this version).
**Spec:** `docs/current_work/specs/d33_taproom_device_access_spec.md` · **Plan:**
`docs/current_work/planning/d33_taproom_device_access_plan.md` · **Review + decisions:**
`docs/current_work/prompts/d33_lead_decisions_2.md`, `d33_lead_decisions_3.md` · **DEV QA:**
`docs/current_work/stepwise_results/d33_dev_pass_1_qa_report.md` · **Backlog:** 3938, 3939

## What changed

- **Device accounts.** `users.kind` (`person` | `device`) plus `home_department_id`.
  - A device is never an owner, a member, schedulable or a password user. The
    changesets and `Accounts` enforce this, even for owners.
  - The membership changeset refuses a device `user_id` on any insert path.
  - Roster, Users & Roles, All-staff recipients and assignee validation
    exclude devices.
  - A device's home department must be assignable.
  - Nobody acts on behalf of a device, owners included: time off,
    availability and a personal calendar feed are all refused.
- **Pairing and tablet tokens.**
  - Codes are 8 characters from the OS CSPRNG, with rejection sampling so
    there's no modulo bias. They're single use, last 10 minutes and are stored
    as HMAC hashes.
  - A wrong code is found with a plain read and never takes SQLite's write
    lock. Only a live code opens the `:immediate` transaction, which claims it
    with a conditional update.
  - Tokens are `dev_…`, stored as HMAC hashes, checked on every request, with
    no expiry. `last_seen_at` is updated at most once a minute.
  - Signing out on a tablet revokes its token.
  - `AuthPlug` refuses signed session tokens for device users.
  - Admin → Shared devices: owners create, rename, deactivate and delete;
    owners and home-department managers pair and revoke. All of it is audited.
- **Wrong-code limiter.**
  - 5 attempts per client per 10 minutes, where the client is an IPv4
    address or an **IPv6 /64**.
  - A **global cap of 50** wrong codes per 10 minutes, across all clients.
  - Counted atomically (`:ets.update_counter/4`) before the code is checked;
    a successful pairing is refunded.
  - Keyed by window and swept every window.
  - `fly-client-ip` is trusted **only on Fly** (`FLY_APP_NAME`, read in
    `runtime.exs`). Anywhere else the socket address is used and the header
    is ignored.
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
    with a re-pair warning.
  - Nav: Home, View Schedule, Taproom, and Messages (All-staff, Taproom).
  - Anything else shows a device-only "Not available on a shared device" page.
  - The schedule is read-only, and channels are read-only.
  - A personal sign-in returns to the device session after 5 idle minutes of
    **wall-clock** time. That holds across iPad sleep: the check runs on
    wake, on focus, on a reload and before counting a tap.
- **3939 (every user).** An unknown or forbidden channel URL redirects to
  `/messages`. It no longer polls into 403s, and a refused send shows an error.
- **Test support.**
  - A `taproomDevice` persona whose mint creates a real `dev_` token.
  - `mix rockcut.synthetic.pair_code` and `Release.pair_synthetic_device/1`
    print a real pairing code.
- **Docs.** `docs/process/taproom_tablet_setup.md` and `tests/COVERAGE.md`.

### DEV fix cycle 1 (gaps from DEV pass 1)

| Gap | Fix | Commit |
|---|---|---|
| **G1** | Deactivating a device **revokes every tablet token** and deletes unused codes; reactivating needs new pairings (before: old tablets came back) | `8ace5b6` |
| **G2** | During "Sign in as me" the set-aside tablet token is checked (on start, every navigation, wake/focus, every 20 s); if revoked or deactivated, the personal session ends and the setup screen shows | `4b3f15a` |
| **G3** | Other tabs re-sync on `storage` events for the auth keys (reload from `/`), so a second tab doesn't keep the last person's UI; Availability shows a load error instead of "Available" every day | `96fac99` |
| **G4** | A tablet is unpaired only by a confirmed sign-out that the server revoked: on failure the dialog shows the error and offers Try again; a person's Logout never unpairs a tablet (a stale tab re-syncs instead) | `ee7af39` |
| **G5** | Deactivate asks first ("Every tablet paired to it is signed out now…") | `e20e16b` |
| **G6** | No Calendar sync on a tablet; device pages make no refused requests | `7fb0270` |
| **G7** | A revoked, deactivated or signed-out tablet lands on **setup** with "This tablet was unpaired. Ask a manager for a new code." | `3359201` |
| **G8** | No `email` key in anything a device can read (shifts' assignee, messages' author, `/api/me`, `/api/session`, pairing response); names still show. People unchanged | `e8315eb` |
| **G9** | No "Pair a tablet" on a deactivated device (API already 422, tested) | `94d2d0e` |

### Behavior changes for people (not only devices)

- **401 handling (`api.ts`).** A 401 now signs a person out only if the
  failing request carried the token currently in use. A 401 for a request
  sent with an older token, or with none, is just an error. Before, any 401
  cleared the token and reloaded.
  - Why: a request still in flight when "Sign in as me" set the tablet token
    aside bounced the person off the login form.
  - Effect for people: none in normal use. A stale request after re-login no
    longer logs you out.
- **`loadMe` drops a late answer.** An `/api/me` answer is ignored if the token
  changed while it was in flight.
- **`parseApiError` shows plain `{error: "..."}` bodies** (403/429) instead of
  "Request failed with status code …".
- **3939 applies to everyone:** a channel URL you can't see redirects, and a
  failed send shows an error and keeps the draft.
- **Tabs follow each other (G3).** Signing in or out, or starting or ending
  "Sign in as me", in one tab reloads the app's other tabs from `/`. Before,
  other tabs kept the old session's screen until their next 401.
- **Availability shows a load error (G3).** If loading availability fails, the
  page shows "Couldn't load availability: …" instead of "Available" every day.
- **Users & Roles** refuses edit, reset and memberships for a device id (422).
  Devices aren't listed there, so people never meet this.

## Migrations

**Two migrations, both reversible:**
- `20260930120001_add_device_kind_to_users`
- `20260930120002_create_device_tokens_and_pairing_codes`

On a scratch copy of the local dev DB they went up, down two steps, and up
again; the rows were intact and all 17 existing users became `person`.

**No new dependency or secret.** One new runtime config,
`:trust_fly_client_ip`, is derived from `FLY_APP_NAME`, which Fly sets itself.
`config/dev.exs` raises the limiter's per-client limit for the local dev
server only.

## Scenarios DEV must exercise

S1–S14 from the spec, plus 3939. Personas:
- **Positive:** `owner`, `barMgr`, `taproomDevice`, `bartender1`.
- **Negative:** `breweryMgr` (S3), `floater` (3939), `bartender1` (S10),
  `taproomDevice` on every blocked page (S9), and **owner → device**: time
  off, availability and a calendar feed for the device must be 403.
- **S2 and S11** need a signed-out second browser for the tablet. Get a code
  as `barMgr`, or from `Release.pair_synthetic_device("taproomDevice")`.
- **S13** needs a real tablet: 5 idle minutes, **and lock the iPad for more
  than 5 minutes, then wake it.** It must be back on the shared screen
  straight away.
- **Cycle 1 re-checks:**
  - **S12 / G1:** deactivate, then reactivate. The old tablets must stay
    signed out, and the list shows them as Revoked.
  - **G2:** revoke *and* deactivate while a person is on the tablet. The
    tablet goes to setup on the next tap, or within 20 s when idle.
  - **G3/G4:** two tabs on one tablet. Signing out in one re-syncs the other,
    and the other tab's Logout doesn't unpair the tablet.
  - **G5:** the deactivate confirmation.
  - **G6:** no Calendar sync on the tablet.
  - **G7:** a revoked tablet shows the setup screen with the unpaired notice.
  - **G8:** `GET /api/shifts`, `/api/channels/all/messages` and `/api/me` as
    the device contain no `email`.
  - **G9:** no Pair button on a deactivated device.

## ⚠ LIMITATIONS: what local could NOT tell us

1. **The limiter's client IP on Fly: VERIFIED on DEV** (lead, DEV pass 1 at
   `1aa70d5`).
   - (a) Six wrong codes → 422 ×5, then **429**, so the limiter keys on the
     real client.
   - (b) With that IP limited, six requests each with a different made-up
     `fly-client-ip` → **429 ×6**, so Fly's edge overwrites a client-supplied
     header.
   - Still true: on Fly, a request that bypasses the public edge (6PN,
     Flycast, `fly proxy`, `fly ssh`) can set the header. All of those need
     Fly org access. Locally and in tests the header is ignored.
2. **The global cap is also a way to block pairing.** Anyone who sends 50
   wrong codes stops **all** pairing for up to 10 minutes. Existing tablets
   are unaffected. This is the trade-off the lead accepted (decision 5); the
   fix is to wait out the window or restart the API.
3. **Personal tokens stay valid after a tablet session ends (backlog 3991).**
   When a person signs out on a tablet, or the tablet returns after 5 idle
   minutes, only the tablet's copy of their 30-day session token is deleted.
   The token stays valid on the server, as with every logout today. A related
   existing gap is backlog 3992: calendar feed URLs keep working after a user
   is deactivated.
4. **The limiter is per machine and in memory.** It resets on every deploy or
   restart, and would be wrong if the API scaled to more than one machine.
5. **Rotating `SECRET_KEY_BASE` signs out every tablet** and voids every live
   code, because codes and tokens are HMAC hashes keyed by it.
6. **The idle return on real hardware is untested.**
   - It was tested with a mocked clock, including simulated sleep:
     `setSystemTime` and then a wake by visibilitychange, by a tap, or by a
     reload.
   - Real iPad sleep and wake, Safari discarding the page, and Guided Access
     or Android pinning are manual only.
   - The last-activity time is kept in `localStorage`, so it survives reloads
     but not storage being cleared.
7. **One race spec is weaker on DEV.** The late-`/api/me` spec relies on the
   dev build's StrictMode double call. DEV serves a production build, so the
   spec passes trivially there (annotation `held /api/me: 0`). The code fix
   doesn't depend on StrictMode.
8. **The installed PWA with a device token is untested.** The local dev server
   has no service worker, and iOS keeps a home-screen web app's storage
   separate from Safari. The tablet guide says to install first and then pair
   inside the app; a real iPad on DEV should confirm this.
9. **`last_seen_at` write load is unmeasured.** It's at most one write a minute
   per tablet, with one SQLite connection; tablets poll `/api/channels` every 20 s.
10. **Local timing.** The full local suite (93 tests, 4 workers) is slow on
    the local stack:
    - the API's single DB connection (one `/api/me` took up to 5 s);
    - the **Vite dev server serving unbundled modules** to every fresh
      browser context (up to 13 s before a page's first API call; API calls
      themselves took about 300 ms).

    The device specs wait on real signals, with 15 s expects and a 60 s test
    timeout, and S9 is split per URL. DEV serves a production bundle, so
    it's expected to be faster.
11. **G2 detection delay.** While a person is on a tablet and nobody touches
    it, a revoke or deactivation is noticed within 20 s (the check interval).
    With a tap or navigation it's noticed at once. The check is one
    `GET /api/session` with the tablet token every 20 s during personal
    sessions only.
12. **G3 relies on `storage` events.** A browser that doesn't deliver them
    (none known) would leave a second tab stale until its next navigation or
    401. The G4 guard still stops that tab's Logout from unpairing the tablet;
    that case has a spec that simulates missing events.
13. **Seed tablet tokens pile up briefly.** The synthetic `[SEED] Playwright
    tablet` tokens are pruned after 8 hours. A deleted device's audit rows keep
    its name in the detail, with no target.

## Local gate evidence: DEV fix cycle 1 (2026-09-30)

| Check | After round 2 | **After cycle 1** |
|---|---|---|
| `MIX_ENV=test mix test` | 799 | **804, 0 failures**; parity dir unchanged |
| `tsc` errors | 3 | **3** (all in `shared/ui-components`) |
| `vite build` | green | **green** |
| `pnpm lint` problems | 27 | **27** (none in D33 files) |
| `npx playwright test` (local) | 76 passed, 1 skipped | **93 passed, 1 skipped, two full runs in a row** (runs 12 and 13) |

**Every gap: test first, then revert-and-rerun, one commit each.** Every
new test failed on the pre-fix code before the fix was written:

| Gap | Fix reverted | Fix restored |
|---|---|---|
| G1 (ExUnit) | 30 tests, 2 failures | 30, 0 |
| G8 (ExUnit, walks every device-allowed route) | 6 tests, 1 failure | 6, 0 |
| G9 + G5 (one file; committed separately) | 2 failed | all passed |
| G6 | 1 failed | passed |
| G7 | 1 failed | passed |
| G2 (revoke and deactivate) | 2 failed | passed |
| G3 (two tabs; Availability error) | 2 failed | passed |
| G4 (failed revoke, confirmed sign-out, stale tab) | 3 failed | passed |

- **G7 was rerun.** The first G7 run showed "fix restored: 2 failed": the
  Vite dev server was still serving the reverted modules right after the
  files were copied back. The helper now waits until Vite serves the restored
  file, and the rerun gave reverted 1 failed, restored passed. S11 and S12
  also passed on their own.
- **Runs 10 and 11 failed on time, not logic** (S9, G6, S11, S12, S13; 3 and 5
  failures). The persona's seed tablet tokens were checked on the server and
  were all live. The trace shows up to 13 s of Vite module loading per page
  load, so no logic changed. `bbd5195` splits S9 per URL and gives the device
  specs 60 s test and 15 s expect timeouts. Runs 12 and 13 were fully green.

## Local gate evidence (2026-09-30, after review round 2)

| Check | Before D33 | After round 1 | After round 2 |
|---|---|---|---|
| `MIX_ENV=test mix test` | 685 | 777 | **799, 0 failures** |
| Parity dir unchanged (`git diff 9e28d9d`) | — | yes | **yes** |
| `tsc` errors | 3 | 3 | **3** (all in `shared/ui-components`; 0 in D33 files) |
| `vite build` | green | green | **green** |
| `pnpm lint` problems | 27 | 27 | **27** (none in D33 files) |
| `npx playwright test` (local) | 53 passed, 1 skipped | 72 passed, 1 skipped (×2) | **76 passed, 1 skipped, two full runs in a row** (runs 8 and 9, after the API restart with the new config) |

**Review round 2: test first, then revert-and-rerun, one commit each.** Every
test failed on the pre-fix code before the fix was written:

| Item | Commit | Fix reverted | Fix restored |
|---|---|---|---|
| 1 CSPRNG codes (the same `:rand` seed no longer gives the same code) | `93bcadc` | 17 tests, 1 failure | 17, 0 |
| 2 owner → device on-behalf (time off was **201** before) | `fd05a08` | 28 tests, 3 failures | 28, 0 |
| 3 idle return across sleep (visibilitychange, tap, reload) | `43f27de` | 3 failed, 2 passed (Playwright) | 5 passed |
| 4 no `begin` for wrong or used codes (repo telemetry) | `6b2c0a2` | 21 tests, 2 failures | 21, 0 |
| 5 limiter (key /64, burst gets exactly 5, global cap, header only on Fly, sweep) | `cea4df1` | 40 tests, 9 failures | 40, 0 |
| 6 assignable home department | `117bda1` | 34 tests, 2 failures | 34, 0 |
| 7 membership changeset refuses a device | `1b83e9b` | 22 tests, 1 failure | 22, 0 |

**Two full Playwright runs failed before the timing change (`22c1d66`):**
- Runs 4 and 5: S11's second pairing hit the 5 s wait. Its `POST
  /api/device_tokens` took 3.3 s and `/api/me` 2.3 s under load; idle, the
  same calls take about 70 ms.
- Run 7: two S13 assertions timed out behind a 5.1 s `/api/me`.

No logic change was needed. The specs now wait on the responses themselves,
with 15 s where full page loads chain. Runs 6, 8 and 9 were fully green.

**From round 1** (still valid):
- **3939 revert-and-rerun:**
  - Fix reverted: 5 failed. The two send tests only failed because the Send
    button's `aria-label` came with the fix, so they prove nothing.
  - Reverted with only the `aria-label` put back: 4 failed and 2 passed; all
    four 3939 tests fail on behavior.
  - Fix restored: 6 passed.
- **Stale 401 fix (`4f5190a`):** reverted, the page reloads; restored, it passes.
- **Late `/api/me` fix (`7074c2e`):** reverted, "Expected: false, Received:
  true"; restored, it passes.

**Every write was checked after a reload:**
- Device create (S1).
- Pairing (S2), revoke (S11) and deactivate (S12), each on both the manager
  and tablet sides.
- A personal time-off request (S13): the check waits for `GET /api/time_off`
  after the reload.
- A message post (3939 control).
- Each spec also reads the data back through the API.
