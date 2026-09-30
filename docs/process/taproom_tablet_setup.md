# Taproom tablet setup (D33)

How to put a tablet behind the bar that stays signed in for everyone. Written
for owners and Taproom managers. Spec: `docs/current_work/specs/d33_taproom_device_access_spec.md`.

## What a shared tablet can and can't do

- **Can:** see the published schedule (shifts and events), and read the
  All-staff and Taproom channels.
- **Can't:** post messages, claim or change shifts, see time off, change
  anything, or reach Admin, Brewery, or anyone's personal pages. Typing one
  of those addresses shows "Not available on a shared device".
- **Assume customers can read the screen.** Everything the tablet shows is
  something a customer at the bar could see.

## 1. Create the shared device (owner, once)

1. Admin → **Shared devices** → **Add shared device**.
2. Name it (for example "Taproom tablets") and pick its **home department**
   (Taproom). The home department decides which department channel and nav
   section the tablets see.

One device account can have any number of tablets paired to it.

## 2. Pair a tablet (owner or Taproom manager)

1. On your own phone or computer: Admin → **Shared devices** → **Pair a tablet**.
   A code like `K7QM-4TRX` appears. It works **once** and expires after **10 minutes**.
2. On the tablet: open Rockcut (rockcut-ui.fly.dev), tap **Set up as a
   shared device**, enter the code and a name for the tablet ("Taproom iPad 1"),
   and tap **Set up this tablet**.
3. The tablet shows **Shared device · Taproom** at the top. Back on Shared
   devices, the tablet is listed with who paired it and when it was last seen.

Wrong codes: after 5 wrong codes in 10 minutes from the same network, pairing
is paused for the rest of those 10 minutes.

Optional: add Rockcut to the tablet's home screen (Share → Add to Home Screen
on iPad; Install app on Android) so it opens full screen.

## 3. Lock the tablet to Rockcut

Do this so a customer can't leave the app, open another app or browser tab,
or open developer tools and copy the tablet's sign-in.

- **iPad — Guided Access:** Settings → Accessibility → Guided Access → on;
  set a passcode that only managers know. Open Rockcut, triple-click the side
  (or Home) button → **Start**. Triple-click and enter the passcode to leave.
- **Android — screen pinning:** Settings → Security → App pinning (or
  "Pin app") → on, with "Ask for PIN before unpinning". Open Rockcut, open
  Overview, tap the app icon → **Pin**.

## 4. A staff member using their own account on the tablet

Tap **Sign in as me** at the top and sign in with your own email and password,
for example to request time off. A banner shows who is signed in. When you
tap **Sign out**, or after **5 minutes** without anyone touching the screen,
the tablet goes back to the shared screen by itself. It doesn't need pairing again.

## 5. Signing a tablet out, and a lost or stolen tablet

- **Sign out** on the tablet itself (top right) signs that tablet out for
  good. A manager has to pair it again with a new code. It asks first.
- **Lost or stolen tablet:** Admin → Shared devices → **Revoke** next to that
  tablet. It's signed out on its very next request; the other tablets keep working.
- **Pause every tablet at once:** an owner taps **Deactivate** on the shared
  device. Every tablet is signed out on its next request. **Reactivate**, then
  pair again, to bring them back.

Every create, pair, revoke and deactivate shows in the owner's User change log.
