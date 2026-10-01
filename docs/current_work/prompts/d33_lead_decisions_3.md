# D33: DEV gate fix cycle 1 of 2 (lead decisions, round 3)

**Date:** 2026-09-30
**Sources:**
- DEV at `1aa70d5` (API v10, UI v6). Playwright on DEV: **77/77 passed**.
- The independent QA pass: `docs/current_work/stepwise_results/d33_dev_pass_1_qa_report.md`.
  13 of 14 scenarios pass; S12 fails.
- The lead ran the rate-limiter checks on DEV:
  - (a) six wrong codes → 422 ×5, then 429;
  - (b) with this IP limited, six requests each with a different made-up
    `fly-client-ip` → 429 ×6.

  **Conclusion: Fly's edge overwrites the header.** Record both in the handoff
  note and close LIMITATIONS item 1(a)/(b) as verified on DEV.

## Fix all of G1–G9

Per workflow §4, each fix gets a test that would have caught it, with a
revert-and-rerun, then the full local gate.

- **G1: reactivating a device revives its old tablets.**
  - Deactivating a device must **revoke every one of its tokens** (set
    `revoked_at`), not just rely on the `active` check.
  - Reactivating then needs a new pairing.
  - Also delete or expire its unused pairing codes when it's deactivated.
- **G2: a personal session survives device deactivation or revoke.**
  - While a tablet is in a "Sign in as me" session, the device token set aside
    must still be checked. Check it on each app poll or tick, or at least on
    idle return and every navigation.
  - If that token is revoked, or its device deactivated, end the personal
    session and go to the setup screen right away.
  - Spec S12 says "every tablet is signed out on its next request". A person's
    session on a dead tablet counts.
  - Cover revoke as well as deactivate.
- **G3: a stale second tab after sign-out.**
  - Listen for `storage` events on the token keys. When the token another tab
    holds is removed or changed, re-sync: reload the auth state, or go to login
    or setup.
  - Also stop swallowing the 403 on Availability. Show an error instead of
    "Available" every day. That's a person-facing bug fix, so mention it in the
    handoff note's "Behavior changes for people".
- **G4: Sign out in a stale tab unpairs the tablet silently.**
  - Resolved by the G3 re-sync.
  - In addition, a tablet's Sign out must **always** show the confirmation
    ("A manager will need to pair this tablet again").
  - If the server-side revoke fails, don't clear the local device token
    silently. Show the error, and keep the token or let the user retry.
- **G5:** Deactivate on Admin → Shared devices gets a confirmation dialog, like Revoke.
- **G6:** hide Calendar Sync (and any other control the device can't use) on the tablet.
- **G7:** a revoked or deactivated tablet lands on the **setup screen**, with a
  short explanation such as "This tablet was unpaired. Ask a manager for a new
  code." It should not land on the password login.
- **G8:** device-scoped API responses must not include staff email addresses,
  or other personal fields the UI doesn't need, anywhere the device can read:
  shifts, events, roster, channels and messages, `/api/me`. Decision Q6: assume
  customers can read anything the device can fetch. Add a test that walks every
  device-allowed route and asserts no `email` key appears.
- **G9:** hide "Pair a tablet" on a deactivated device. The API must also refuse
  to issue a code for an inactive device (422), with a test.

Then:
1. Commit per item.
2. Run the full local gate (mix test, tsc/vite/lint, full Playwright twice).
3. Update the handoff note: the evidence, the DEV rate-limit results, and cycle 1.
4. Report the new HEAD SHA to the lead. The lead redeploys it to DEV and reruns.
