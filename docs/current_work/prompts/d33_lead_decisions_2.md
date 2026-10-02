# D33: reviewer findings and lead decisions (round 2)

**Date:** 2026-09-30
**Reviewer:** a fresh read-only agent. The verdict was "ready for DEV, fix 1–3 before prod".
**Lead verification:** items 1 and 2 were checked in code (`devices.ex:288`,
`time_off.ex:94` with the owner clause at `authz.ex:187`).

## Decisions: fix everything before DEV

Fixing locally is cheaper than spending one of the two DEV fix cycles.

1. **Pairing code randomness:** use `:crypto.strong_rand_bytes`, with rejection
   sampling so there's no modulo bias.
2. **Owner acting on a device:** add an Authz clause that binds owners too, placed
   before the owner shortcut. It denies `{:user_for, device_id}`, which covers time
   off, availability and calendar feeds (check every `{:user_for, _}` caller and any
   other "on behalf of" path). Add owner → device cases to `authz_device_test`.
   Write the test first and do revert-and-rerun.
3. **Idle return survives iPad sleep:** keep a wall-clock `lastActivity`. Check it on
   every tick, on `visibilitychange` and on `focus`, and return to the device session
   immediately once `Date.now() - lastActivity >= PERSONAL_IDLE_MS`. The Playwright
   spec needs to cover a "sleep" (advance the clock without firing timers, then
   dispatch `visibilitychange`).
4. **Write lock:** look up the live code with a plain read, and open the
   `:immediate` transaction only when a candidate row exists. Re-check `used_at`
   inside the transaction.
5. **Rate limiter:** take the reviewer's recommendation in full:
   - trust `fly-client-ip` only when running on Fly (`FLY_APP_NAME` present, read in
     runtime config); otherwise use `remote_ip`;
   - key IPv6 addresses by their /64;
   - count atomically with `:ets.update_counter/4` and a default, then decide;
   - sweep expired rows every window;
   - add a **global** cap of 50 wrong codes per 10 minutes, across all IPs.

   Replace the test and Playwright dependence on the spoofed header with a test-only
   limiter reset or config. No request header may bypass the limiter locally either.
6. **Home department must be assignable** (decision 6): add the check to `device_common`.
7. **Membership changeset** rejects a device `user_id`, matching the shift changeset.
8. **Handoff note:** mention the 401 behavior change for people. Update LIMITATIONS
   for everything above that's still relevant, including anything the DEV pass must check.

Then re-run the **full local gate** (mix test, tsc/vite/lint, full Playwright
twice) and update the handoff note's evidence.

## Reviewer output (verbatim)

```
● D33 review (d32-schedule-events..HEAD)
  What holds up. Both gates deny by default. DeviceGate is in :authenticated, the brewery scope pipes through
  :authenticated, and the :device_allowed scope has exactly the 13 spec routes. The device clause comes first in can?/3,
  scope/3, can_manage_user?/2 and counts_as_manager?/1, so it sits above the owner clause at authz.ex:187. Tokens and
  codes are HMAC-hashed and looked up on every request. Codes are single use: they're redeemed under :immediate, so
  there's no double spend, and they expire. AuthPlug refuses session tokens for device users. Password login is refused
  with no_user_verify, which keeps timing constant. The four listing fixes are in and tested, and the parity files are
  untouched.
  Blockers: none found.
  Should-fix
  1. The pairing code isn't generated with secure randomness. At rockcut_api/lib/rockcut_api/devices.ex:288,
     Enum.random/1 uses :rand, which is predictable once its internal state is known. Anyone who learns that state can
     guess the codes, and the rate limit doesn't help because they only need a few guesses.
     - Fix: for <<b <- :crypto.strong_rand_bytes(8)>>, into: "", do: <<Enum.at(@code_alphabet, rem(b, 31))>>. The slight
       bias from rem is fine here, or use rejection sampling to remove it. One line.
  2. An owner can create time off, availability and a calendar feed for a device. time_off.ex:94 and availability.ex use
     can?(owner, :manage, {:user_for, device_id}), and the owner clause says yes.
     - Scenario: an owner POSTs /api/time_off with user_id set to the device's id. The row is created, shows in lists and
       feeds the conflict checks.
     - This breaks "a device gains nothing a person has, through any path", and no test covers a device as the target.
     - Fix: add a "binds owners too" clause before line 187 that denies {:user_for, id} when Accounts.device_id?(id), or
       refuse in each resolve_target. Add the owner → device case to authz_device_test.
  3. The idle return breaks when the iPad sleeps (rockcut-ui/src/hooks/useIdleReturn.ts:13).
     - Scenario: a bartender signs in, the iPad auto-locks at 2 minutes, and someone wakes it 20 minutes later. Safari
       pauses timers while locked, so the bartender's personal session is still on the bar-facing screen for up to 3 more
       minutes, and a tap resets the timer.
     - Fix: store lastActivity = Date.now(), and on visibilitychange, focus and every tick, return right away if
       Date.now() - lastActivity >= ms. Limitation 5 in the handoff doesn't mention this.
  4. Any unauthenticated attempt takes SQLite's write lock. At devices.ex:181, every POST /api/device_tokens, including
     wrong codes, opens a mode: :immediate transaction. With the limiter bypassable (item 5), an anonymous client can
     keep the app's single writer busy.
     - Fix: run find_live_code as a plain read first, and open the immediate transaction only when a candidate row
       exists. Re-check used_at inside it.
  5. The rate limiter's IP source (device_token_controller.ex:56).
     - On Fly's public edge, I expect the risk to be low: fly-proxy sets Fly-Client-IP itself. I couldn't confirm that
       from here, so keep the DEV spoof test from the handoff.
     - The IP source isn't the real weakness. The limiter is weak in three other ways:
       - (a) IPv6. rockcut-api.fly.dev has an AAAA record, and one attacker holds a whole /64 of addresses, so a
         per-address counter is effectively unlimited.
       - (b) Check-then-record race. limited? and record_failure at pairing_rate_limiter.ex:17 and :31 are separate
         steps, so a burst of concurrent requests all pass the check.
       - (c) Unbounded ETS table. Rows are never evicted, so rotating addresses grows memory without limit.
     - Brute force is still out of reach. There are 31^8 ≈ 8.5e11 possible codes, and usually about one is live per 10
       minutes. Even at 1,000 guesses a second with no limit, the chance of hitting a code is about 7e-7. The practical
       risks are load (item 4) and memory, not guessing a code.
     - Recommendation:
       - Trust fly-client-ip only behind a runtime flag set when FLY_APP_NAME is present; use remote_ip otherwise.
       - Key IPv6 by /64.
       - Count with :ets.update_counter/4 and a default, before deciding.
       - Sweep expired rows every window.
       - Add a global cap on wrong codes, such as 50 per 10 minutes. Real pairing is rare, so this makes the IP source
         nearly irrelevant.
     - Test impact: the Playwright tablet helpers depend on the spoof locally
       (rockcut-ui/tests/regression/devices/helpers.ts:51). So does device_controller_test.exs:133, which keys on a
       header IP. Both would need a limiter reset or a test-only config instead.
  Nits
  6. user.ex:95 (device_common) doesn't check that the home department is assignable, as decision P6 requires. An owner
     can PATCH a non-assignable home, and the device's department channel then doesn't exist.
  7. The membership refusal is only in Accounts.set_memberships. Membership.changeset doesn't reject a device user_id, so
     any future insert path skips the check. Add the same validate_change the shift changeset uses.
  8. api.ts: a 401 now signs a person out only if the request carried the current token. That's intended, but it's a
     small behavior change for people that the handoff doesn't mention.
  Spec coverage. The API and Authz tests cover S1–S12 and S14 meaningfully:
  - The route matrix is generated from the router.
  - The S7 test checks drafts both in the list and by id.
  - The rate-limit test checks 422 → 429.
  Gaps:
  - S13 only ran on a mocked clock, and misses item 3.
  - The late-/api/me spec passes trivially on DEV (the handoff admits this).
  - No test covers an owner acting on a device as the target (item 2).
  Is the LIMITATIONS section honest? Yes, as far as it goes: items 1–9 are accurate. It's incomplete on four counts:
  - Item 1 treats header spoofing as the only way around the limiter. It leaves out IPv6 rotation, the race, the
    unbounded memory and the write lock.
  - It doesn't say the local Playwright suite relies on the spoof.
  - It doesn't mention the iPad sleep case (item 3) or the owner on-behalf path (item 2).
  - It doesn't mention that pairing codes use :rand.
  Verdict: ready for DEV. The gates and token handling are sound. Fix items 1–3 before the prod release (1 and 2 are
```
