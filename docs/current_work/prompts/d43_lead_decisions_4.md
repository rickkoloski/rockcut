# D43 lead decisions 4 (DEV run 1, 2026-10-15)

DEV (`7249387`, API v40 / UI v38): **377 passed, 1 failed, 2 did not run**
(board-replace, gated on a green chromium project). Log:
`~/src/rockcut-d43-scratch/dev-run-1.txt`.

**Failure (box-only, passed locally):** `devices/device_signout.spec.ts:64`
G4 "a stale tab's person Logout never unpairs the tablet". Tab A's Logout
worked; tab B's `getByTestId('logout-button')` was never found (60 s
timeout). The failure snapshot shows a page already back on the tablet's own
header ("Shared device · Taproom", Sign in as me, Sign out). Trace:
`rockcut-ui/test-results/regression-devices-device_-617cf-ut-never-unpairs-the-tablet-chromium/trace.zip`
(`npx playwright show-trace` won't work headless; unzip it and read the
network / actions JSON). Don't print tokens from it.

**Do (cycle 1 of 2):**
1. Find why tab B left the personal session before its Logout: which request
   re-synced it (e.g. a `/api/me` fetch D43 added: `ThemeRoot`, the color
   mode cache, a focus/visibility refetch), and whether `develop` would do the
   same (read the code; you can't check it out).
2. If D43 introduced it: decide whether it's a bug (a stale tab should stay
   stale until it acts, per D36's design) or harmless (the tab simply syncs
   sooner). Fix the app if it's a bug; if it's harmless, make G4 robust (B
   must not be re-synced by anything but its own action, e.g. freeze B before
   A's logout) and say why in a comment. Either way G4 must still prove a
   stale tab's Logout never unpairs the tablet.
3. Run G4 locally 5 times, then `E2E_TARGET=dev` for `device_signout.spec.ts`
   only (workers=1). The DEV tokens in `tests/.playwright-auth/` are the
   DEV-minted ones from the run; don't re-run setup against local in between
   (it would overwrite them) — or if you need local, re-run setup for the
   target you use.
4. Commit (`fix: D43 …`), stop and report. The lead redeploys DEV.
