# Taproom tablet setup (D33)

How to put a tablet behind the bar that stays signed in for everyone. Written
for owners and Taproom managers. Spec: `docs/current_work/specs/d33_taproom_device_access_spec.md`.

The bar tablets are **Samsung Android tablets running Chrome**, mounted in
landscape. These steps assume that; iPad notes are at the end of each step.
Samsung menu names vary a little between One UI versions; search Settings for
the name if a path doesn't match.

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

## 2. Prepare the tablet (once per tablet)

1. Install **Chrome** from the Play Store. Use Chrome for Rockcut, not Samsung
   Internet: the pairing is stored in the browser that did it.
2. Don't sign Chrome (or the tablet) into anyone's personal Google account.
3. Turn **Auto rotate** on (quick settings), so Rockcut follows the tablet's
   landscape mount.
4. In Chrome, open **rockcut-ui.fly.dev** and install it: tap the **Install**
   banner, or Chrome's **⋮** menu → **Install app** (or **Add to Home screen**
   → **Install**). Open Rockcut from its home-screen icon from now on; it runs
   full screen with no address bar.

On Android the installed app shares Chrome's sign-in, so you can pair in
either and it carries over.

## 3. Pair a tablet (owner or Taproom manager)

1. On your own phone or computer: Admin → **Shared devices** → **Pair a tablet**.
   A code like `K7QM-4TRX` appears. It works **once** and expires after **10 minutes**.
2. On the tablet: open Rockcut (rockcut-ui.fly.dev), tap **Set up as a
   shared device**, enter the code and a name for the tablet ("Taproom tablet 1"),
   and tap **Set up this tablet**.
3. The tablet shows **Shared device · Taproom** at the top. Back on Shared
   devices, the tablet is listed with who paired it and when it was last seen.

Wrong codes: after 5 wrong codes in 10 minutes from the same network, pairing
from that network is paused for the rest of those 10 minutes. After 50 wrong
codes in 10 minutes from anywhere, all pairing is paused for the rest of the
10 minutes (tablets already paired keep working).

**iPad:** install first (Safari → Share → **Add to Home Screen**), open it from
the home-screen icon, and pair there. On iPad the home-screen app keeps its own
sign-in, separate from Safari: a tablet paired in Safari and then added to the
home screen opens unpaired.

## 4. Lock the tablet to Rockcut

Do this so a customer can't leave the app, open another app or browser tab,
or open developer tools and copy the tablet's sign-in.

- **Samsung — Pin windows:** Settings → **Security and privacy** → **More
  security settings** → **Pin windows** → on, with **Ask for PIN before
  unpinning** on (set a tablet PIN that only managers know). Open Rockcut, tap
  **Recents**, tap the Rockcut icon at the top of its card → **Pin this app**.
  To unpin: hold **Back** and **Recents** together, then enter the PIN.
- **Other Android:** the same feature is called **App pinning** (Settings →
  Security).
- **iPad — Guided Access:** Settings → Accessibility → Guided Access → on;
  set a passcode that only managers know. Open Rockcut, triple-click the side
  (or Home) button → **Start**. Triple-click and enter the passcode to leave.

## 5. Keep the tablet awake and Rockcut running

Samsung tablets put apps to sleep to save battery, and a sleeping Chrome can
be closed. Rockcut copes (it reopens on the shared screen), but behind the bar
it's better if it stays up:

- Settings → **Battery** → **Background usage limits** → **Never sleeping
  apps** → add **Chrome** and **Rockcut** (the installed app is listed on its own).
- Settings → **Display** → **Screen timeout**: pick the longest that suits the
  bar. For a tablet that's always on a charger, **Developer options** →
  **Stay awake** keeps the screen on while charging (leave USB debugging off).

## 6. A staff member using their own account on the tablet

Tap **Sign in as me** at the top and sign in with your own email and password,
for example to request time off. A banner shows who is signed in. When you
tap **Sign out**, or after **5 minutes** without anyone touching the screen,
the tablet goes back to the shared screen by itself — also if the tablet went
to sleep in between: it's back on the shared screen as soon as it wakes. It doesn't need pairing again.

## 7. Signing a tablet out, and a lost or stolen tablet

- **Sign out** on the tablet itself (top right) signs that tablet out for
  good. A manager has to pair it again with a new code. It asks first.
- **Lost or stolen tablet:** Admin → Shared devices → **Revoke** next to that
  tablet. It's signed out on its very next request; the other tablets keep working.
- **Pause every tablet at once:** an owner taps **Deactivate** on the shared
  device. Every tablet is signed out on its next request. **Reactivate**, then
  pair again, to bring them back.

Every create, pair, revoke and deactivate shows in the owner's User change log.
