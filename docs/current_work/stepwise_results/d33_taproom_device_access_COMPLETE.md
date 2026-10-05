# D33: Taproom Device Access — Completion Record

**Status:** COMPLETE. On prod since 2026-10-02 in release `v2026.10.02`
(`5fd6b93`, PR #8; API v21, UI v17). **Tablets not yet paired on prod:** that
is a next-day step after the release log watch (see Follow-Up).
**Spec:** `specs/d33_taproom_device_access_spec.md` (approved 2026-09-30) ·
**Plan:** `planning/d33_taproom_device_access_plan.md` · **Decisions:**
`prompts/d33_lead_decisions_2.md`
**Concept:** 06_auth_roles
**Branch:** `d33-taproom-device-access` (off `d32-schedule-events`), PR #5,
merged 2026-10-01 as `073efac`. DEV gate SHA **`921dfd8`**.
**Backlog:** PortableMind project 254, tasks 3938 and 3939. Closed at release.
**QA reports:** `stepwise_results/d33_dev_pass_1_qa_report.md`,
`stepwise_results/d33_dev_pass_2_qa_report.md`

---

## Summary

The taproom's shared Samsung tablets can run Rockcut under a **device
account**: paired with a one-time code, read-only, and limited by two
deny-by-default gates to Home, View Schedule, Taproom and the All-staff and
Taproom channels. Any staff member can "Sign in as me" on a tablet; the
tablet returns to the shared screen after 5 idle minutes.

---

## What shipped

- **Device accounts:** `users.kind` (`person` | `device`) plus
  `home_department_id`. A device is never an owner, member, schedulable or
  password user, and nobody acts on its behalf (owners included). Roster,
  Users & Roles, All-staff recipients and assignee validation exclude devices.
- **Pairing and tablet tokens:** 8-character single-use codes from the OS
  CSPRNG, valid 10 minutes, stored as HMAC hashes. Tokens are `dev_…`, HMAC
  hashed, checked on every request, no expiry. Signing out on a tablet revokes
  its token. Admin → Shared devices: owners create, rename, deactivate and
  delete; owners and home-department managers pair and revoke. All audited.
- **Wrong-code limiter:** 5 per client per 10 minutes (IPv4 or IPv6 /64), a
  global cap of 50, counted atomically before the check. `fly-client-ip` is
  trusted only on Fly.
- **Two deny-by-default gates:** `DeviceGate` (13 allowed routes) and
  `Authz.Device` (explicitly denies `:post`).
- **Tablet UI:** setup from the login screen, a "Shared device · Taproom" chip,
  "Sign in as me" with a wall-clock 5-minute idle return (checked on wake,
  focus, reload and tap), a read-only schedule and channels, and a "Not
  available on a shared device" page for everything else.
- **3939 (everyone):** an unknown or forbidden channel URL redirects to
  `/messages`, and a refused send shows an error and keeps the draft.
- **People-facing changes:** a 401 signs a person out only if it came from the
  token in use; a late `/api/me` answer is dropped; plain `{error}` bodies are
  shown.
- **PWA manifest `orientation: any`** (was `portrait`, which Android enforces
  on installed apps); setup guide `docs/process/taproom_tablet_setup.md`
  (Samsung + Chrome first).

76 files changed, +5873 / −130 (`git diff --stat d4b3ef1 22c1d66`).
**Migrations (2, reversible):** `add_device_kind_to_users`,
`create_device_tokens_and_pairing_codes`. No new dependency or secret.

---

## Testing

### Local gate (2026-09-30, after review round 2)
- [x] `MIX_ENV=test mix test`: **799, 0 failures** (685 before D33). Parity
      suite unchanged; boundary test now also flags `kind` checks outside Authz.
- [x] `vite build` green. Playwright local: 76 passed, 1 skipped, two full runs in a row.
- [x] Test first, then revert-and-rerun, for each of the 7 review round 2
      items, 3939, the stale-401 fix and the late-`/api/me` fix.
- [x] `tsc` (3) and lint (27): unchanged; none in D33 files.

### DEV gate (2026-10-01)
- [x] `rockcut-api-dev` v14, `rockcut-ui-dev` v9 from a clean checkout of `921dfd8`.
- [x] Playwright on DEV: **94 passed, 0 failed, 0 skipped**.
- [x] QA pass 1: findings G1–G9, all fixed in fix cycle 1.
- [x] QA pass 2: **S1–S14 and G1–G9 all PASS**, at 1280×800 landscape.
- [x] **S13 on real hardware:** Matt's Pixel, installed Chrome app; back on the
      shared screen after more than 5 minutes with the screen off.
- [x] Wrong pairing code returns **429** within the window.
- [x] Verdict: PR #5 comment 5924449968.

### Prod (2026-10-02, release `v2026.10.02`)
- [x] Both migrations ran at boot; all 10 users are `kind = person` (no devices yet).
- [x] Manifest serves `orientation: any`.
- [x] Matt's own login check clean.

---

## Deviations from Spec

- The spec assumed iPads; the bar tablets are Samsung Android tablets in
  landscape running a Chrome-installed PWA. The manifest orientation and the
  setup guide were changed to match.
- PIN entry is deferred to the first editable taproom component (D34+).

---

## Follow-Up Items

- [ ] **Prod tablet setup (next day, after the release log watch):** Admin →
      Shared devices → create "Taproom tablets" (home: Taproom), then pair each
      tablet per `taproom_tablet_setup.md`. **If prod is rolled back after
      pairing, first set the device users `active = false`**: the old code
      treats them as ordinary users.
- [ ] **3991:** a "Sign in as me" token isn't revoked on the server when the
      tablet session ends (spec P9).
- [ ] **3992:** calendar feeds keep working after a user is deactivated.
- [ ] **4001:** a blocked or unknown channel URL on a tablet redirects silently
      instead of showing "Not available".
- [ ] **4002:** the shared-device header is cramped at phone width (412 px).
- [ ] **4003:** nginx serves `manifest.webmanifest` as `application/octet-stream`.
- [ ] The wrong-code limiter is in memory on one machine: it resets on deploy
      and would need rework if the API scaled out.

---

## Notes

- Rotating `SECRET_KEY_BASE` signs out every tablet and voids every live code
  (both are HMAC hashes keyed by it).
- A manager doesn't see "Add shared device": creating the device account is
  owner-only (spec Q2); managers pair and revoke.
