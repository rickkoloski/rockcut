# D21: Web Push Notifications — Complete

**Spec:** `d21_web_push_spec.md`
**Completed:** 2026-09-22
**Concept:** 08_notifications

---

## Summary

Added a **`web_push` channel** to the D18 notification dispatcher so staff get OS
push notifications for schedule changes (`shift_published`, `shift_assigned`,
`open_shift`) even when the app is closed. Web Push (VAPID) over the D19 service
worker — no app store. Built in two phases (backend, then frontend).

---

## Implementation Details

### Backend (phase 1 — `8dda18f`)

- **`push_subscriptions`** table + schema (endpoint = identity, one row per
  device); `User has_many :push_subscriptions`.
- **`RockcutApi.Notifications.WebPush`**: `subscribe/unsubscribe/list`,
  `vapid_public_key/0`, and `deliver/2` — builds an encrypted, VAPID-signed
  request with **`web_push_ex`** and sends it with **`Req`**. Prunes any
  subscription the push service reports gone (**404/410**). The HTTP send is an
  injectable function so tests run offline.
- **Dispatcher**: `:web_push` added to `@channels`, **default off** (opt-in and
  needs a device subscription); delivery is best-effort in a `Task`, so a push
  failure never breaks the publish/assign request.
- **VAPID config**: a dev/test keypair in `config/config.exs` (committed, dev-only);
  prod overrides `public_key`/`private_key`/`subject` from Fly secrets
  (`WEB_PUSH_EX_VAPID_*`) in `config/runtime.exs`. When unset, the channel no-ops.
- **API**: `GET /api/push/public_key`, `POST` + `DELETE /api/push/subscriptions`.

### Frontend + service worker (phase 2 — `da0ecab`)

- **Service worker → `injectManifest`**: `src/sw.ts` keeps the D19 app-shell
  precache + SPA navigation fallback (Workbox) and adds `push`
  (`showNotification`) + `notificationclick` (focus/open `/schedule`) handlers.
- **`src/lib/push.ts`**: `pushSupported/currentPushState/subscribePush/
  unsubscribePush`. Uses `serviceWorker.getRegistration()` (not `.ready`) so it
  **no-ops gracefully with no SW** (e.g. the dev server) instead of hanging.
- **NotificationPreferencesDialog**: real **Push** column + an "Enable push on
  this device" control showing permission/subscription state; enabling subscribes
  the device and turns Push on for all events. iOS "install first" caveat in copy.

### Key Files

| File | Change |
|------|--------|
| `rockcut_api/lib/rockcut_api/notifications/web_push.ex` | channel context + delivery |
| `rockcut_api/lib/rockcut_api/notifications/push_subscription.ex` | schema |
| `rockcut_api/lib/rockcut_api/notifications.ex` | `:web_push` channel + deliver |
| `rockcut_api/lib/rockcut_api_web/controllers/push_controller.ex` | endpoints |
| `rockcut_api/config/{config,runtime}.exs` | VAPID config |
| `rockcut-ui/src/sw.ts` | custom SW (precache + push) |
| `rockcut-ui/src/lib/push.ts` | subscribe/unsubscribe helpers |
| `rockcut-ui/src/components/NotificationPreferencesDialog.tsx` | Push UI |
| `rockcut-ui/vite.config.ts` | `injectManifest` strategy |

---

## Testing

- [x] ExUnit: subscription CRUD/upsert, delivery to all devices, 410 pruning,
      opt-in gating. **150 tests, 0 failures** (was 141).
- [x] `tsc --noEmit -p tsconfig.app.json` clean (SW excluded, built separately);
      ESLint clean; `vite build` emits the injectManifest `sw.js` with push +
      notificationclick handlers.

### To verify by hand (desktop Chrome or a phone)

1. `cd rockcut-ui && pnpm build && pnpm preview` → open `http://localhost:4173`
   (secure context) and **install** the app.
2. In the installed app: bell → preferences → **Enable push on this device**
   (grant permission).
3. As an owner, publish an assigned shift for that user → an OS notification
   appears; clicking it opens the schedule. (Phones need HTTPS — use a deploy.)

---

## Deviations from Spec

- None material. Library chosen: **`web_push_ex`** (returns a request struct sent
  via `Req`). Notification click target defaults to `/schedule` (spec §7 default).

---

## Refinements (post-merge, same session)

- **Channel-key fix** (`46d1c58`): the dispatcher channel was `:web_push` but the
  prefs UI stores the key `"push"`, so `enabled?/3` never matched and the
  publish/assign path silently skipped push (in-app/email were fine). Renamed the
  channel atom to `:push`. Server delivery/VAPID/FCM were already correct
  (confirmed with a live 201 from FCM).
- **Coalesced bulk publish** (`e5e2db0`): "Publish week" / "Publish for employee"
  sent one notification per shift. Added `POST /api/shifts/publish` +
  `Scheduling.publish_shifts/1` + `Notifications.shifts_published/1`, which group
  assigned shifts by assignee and open shifts by department → **one** notification
  per recipient across all channels ("N shifts scheduled" / "N open shifts").
- **Merged + new events** (`a8a6e0d`): combined `shift_published` + `shift_assigned`
  into a single **`shift_scheduled`** ("You've been scheduled") — the published-vs-
  reassigned distinction doesn't matter to employees. Added **`shift_changed`**
  ("Your schedule has changed"): editing a published shift's time/position now
  notifies the assignee (previously silent). `update_shift/2` distinguishes
  scheduled (new assignee / newly published) from changed (same assignee, edited).
  Final events: `shift_scheduled`, `shift_changed`, `open_shift`. Suite at **152**.

## Follow-Up Items

- [ ] Set prod VAPID Fly secrets before relying on push in production.
- [ ] Reminders (`shift.reminder`, time-based) — needs Oban.
- [ ] SMS (Twilio + 10DLC); native APNs (Capacitor) if web push proves too weak.
- [ ] Optional: manage/list a user's devices in the UI; richer payloads/actions.

---

## Notes

Commits: `8dda18f` (phase 1 backend), `da0ecab` (phase 2 frontend). Push needs a
secure context (HTTPS or localhost) + the D19 SW, and on iPhone only works for the
installed PWA (iOS ≥ 16.4).
