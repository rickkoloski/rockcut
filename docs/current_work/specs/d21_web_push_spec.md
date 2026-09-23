# D21: Web Push Notifications — Specification

**Status:** Complete (2026-09-22) — see `stepwise_results/d21_web_push_COMPLETE.md`
**Created:** 2026-09-22
**Author:** Matt + CC
**Depends On:** D18 (Notifications core), D19 (PWA / service worker)

---

## 1. Problem Statement

Deliver **push notifications for schedule changes** to staff phones/desktops even
when the app isn't open. D21 adds a **`web_push` channel** to the existing D18
dispatcher (Web Push / VAPID — the right fit for our PWA), reusing the D18 events
(`shift_published`, `shift_assigned`, `open_shift`). No new events.

This is **Web Push**, not native APNs: it rides the D19 service worker and needs
no app store. On iOS, web push works **only for the installed PWA** (iOS ≥ 16.4);
Android/desktop Chrome work in-browser. Native push (Capacitor + Apple Developer)
stays deferred.

---

## 2. Requirements

### Functional

- [ ] **New channel `web_push`** in the dispatcher, alongside `in_app` + `email`.
      Default **off** (opt-in; requires browser permission + a device subscription).
- [ ] **Per-device subscriptions:** a user may subscribe multiple devices; each is
      stored and delivered to independently. Dead subscriptions (410/404) are
      pruned automatically on send.
- [ ] **Preferences:** the existing per-event × channel grid gets a real **Push**
      column (replacing "coming soon"). A pref of "push on for event X" only
      delivers to devices that have an active subscription.
- [ ] **Subscribe flow (frontend):** an "Enable push on this device" action that
      requests notification permission, subscribes via the service worker's
      `PushManager` with the VAPID public key, and registers the subscription with
      the API. An unsubscribe/disable path removes it.
- [ ] **Service worker** handles `push` (show an OS notification: title, body,
      icon/badge) and `notificationclick` (focus/open the app at the schedule).
- [ ] Delivery is **best-effort + non-blocking** (like email): a push failure
      never breaks the triggering request; sends run in a Task.

### Non-Functional

- [ ] **VAPID** keypair: public key served to clients; private key + subject from
      config/secrets (dev: config; prod: Fly secrets). Never commit the private key.
- [ ] Elixir side sends via **`Req`** (per repo guidelines) using a web-push
      encryption library that builds the encrypted request (intended:
      **`web_push_elixir`**/**`WebPushEx`**-style "build request, you send it");
      final lib picked at implementation. **Avoid HTTPoison.**
- [ ] Reuses D18 authz/recipient scoping; notification body/times consistent with
      D18 (Denver-local where shown).
- [ ] Push requires a **secure context** (HTTPS or localhost) + the D19 SW — so it
      is testable via `vite preview`/deploy, not the plain dev server.
- [ ] ExUnit covers subscription CRUD, dispatch honoring the push pref, and dead-
      subscription pruning (HTTP send is injected/stubbed in tests — no real network).

---

## 3. Design

### Data model

```
push_subscriptions
  id
  user_id     -> users (required)
  endpoint    :string   (unique; the push service URL — the subscription identity)
  p256dh      :string   (client public key, from subscription.keys.p256dh)
  auth        :string   (client auth secret, from subscription.keys.auth)
  user_agent  :string   (nullable; for display / debugging)
  timestamps
  unique_index(endpoint), index(user_id)

user has_many :push_subscriptions
```

### VAPID / config

- Generate a VAPID keypair once. Config keys: `:vapid_public_key`,
  `:vapid_private_key`, `:vapid_subject` (a `mailto:` or app URL).
- Dev: values in `config/dev.exs` (a dev-only keypair, committable — not prod).
- Prod: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` Fly secrets read
  in `runtime.exs`.

### Dispatcher (`RockcutApi.Notifications`)

- Add `:web_push` to `@channels`. `enabled?/3` already defaults unknown channels
  off, so `web_push` is opt-in without other changes.
- `deliver(:web_push, user, event, payload)` → `Task.start`: load the user's
  subscriptions; for each, build a JSON message `%{title, body, data}` (data holds
  `shift_id` and a target `url`, e.g. `/schedule`); encrypt with the sub's keys +
  VAPID and `Req.post` to `endpoint`; on **404/410** delete that subscription; log
  other errors. Rescued/best-effort, mirroring the email channel.
- **Testability:** the HTTP send goes through a small indirection (a `sender`
  function/module, configurable) so tests assert calls + pruning without network.

### Context `RockcutApi.PushSubscriptions` (or within Notifications)

- `subscribe(user, %{endpoint, p256dh, auth, user_agent})` → upsert by `endpoint`.
- `unsubscribe(user, endpoint)` → delete.
- `list(user)` → the user's subscriptions.
- `vapid_public_key/0`.

### API

```
GET    /api/push/public_key            # { public_key } for the client to subscribe
POST   /api/push/subscriptions         # { endpoint, keys: { p256dh, auth } } -> upsert
DELETE /api/push/subscriptions         # { endpoint } -> remove
```

### Frontend — service worker (D19 change)

- Switch `vite-plugin-pwa` from **`generateSW` → `injectManifest`** with a custom
  `src/sw.ts` that:
  - keeps D19 behavior: `precacheAndRoute(self.__WB_MANIFEST)` + SPA
    `navigateFallback` (denylist `/api`, `/dev`);
  - `addEventListener('push', …)` → `showNotification(title, { body, data, icon,
    badge })`;
  - `addEventListener('notificationclick', …)` → focus an existing client or open
    the app at `data.url`.

### Frontend — subscribe + prefs

- `usePushSubscription` util/hook: feature/permission detection; `subscribe()`
  (request permission → `registration.pushManager.subscribe({ userVisibleOnly:
  true, applicationServerKey })` → `POST /api/push/subscriptions`); `unsubscribe()`.
- **NotificationPreferencesDialog:** enable the **Push** column; add an "Enable
  push on this device" control showing permission/subscription state. Per-event
  push toggles behave like other channels once the device is subscribed. Copy notes
  the iOS "install first" caveat.

---

## 4. Success Criteria

- [ ] With push enabled + permission granted on a device, publishing an assigned
      shift delivers an OS notification to that device (app closed); reassigning a
      published shift notifies the new assignee; an open shift notifies department
      members who opted in.
- [ ] Clicking the notification opens/focuses the app on the schedule.
- [ ] Turning the push pref off (or revoking permission / unsubscribing) stops
      delivery; a 410 from the push service prunes that subscription.
- [ ] A push send failure never fails the publish/assign request.
- [ ] ExUnit green (incl. new tests); `vite build` + lint/type clean; existing
      suite unaffected.

---

## 5. Out of Scope (later deliverables)

- **Reminders** (`shift.reminder`, time-based) — needs Oban.
- **SMS** (Twilio + 10DLC).
- **Native APNs push** (Capacitor + Apple Developer path).
- Notification **action buttons**, grouping, and rich media.
- Managing/list of a user's devices in the UI (beyond enable/disable on the
  current device).

---

## 6. Resolved Decisions

1. **Web Push (VAPID)** over native — rides the D19 PWA/service worker, no app store.
2. Reuse the **D18 events**; add only the **`web_push`** channel (default off).
3. **Per-device** subscriptions; prune on 410/404. Prefs are per-user intent;
   delivery needs a live subscription on a device.
4. Switch the service worker to **`injectManifest`** to host push handlers while
   keeping D19 precaching.
5. Send from Elixir via **`Req`** + a web-push encryption lib (no HTTPoison);
   VAPID private key via Fly secrets in prod.

## 7. Open Questions

- [ ] Final Elixir web-push library choice (confirm it pairs with `Req` and current
      OTP) — resolved during implementation.
- [ ] Notification target URL — `/schedule` (agenda) for everyone vs `/scheduler`
      for managers? Default: `/schedule`.
