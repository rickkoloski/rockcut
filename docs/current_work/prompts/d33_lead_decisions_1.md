# D33: lead decisions on the plan's questions (round 1)

**Date:** 2026-09-30
**From:** the lead, with Matt deciding the business questions (Q1, Q5, Q6, Q9).
The plan (`c0f56d2`) is **approved** with these answers.

1. **Blocked URL:** option (b), a **device-only** "Not available on a shared
   device" page. People keep today's redirect to Home. *(Matt)* Update spec S9 and
   §3.5 wording to match.
2. **Test persona token:** yes. `mint_token taproomDevice` creates a real `dev_`
   tablet token, and `AuthPlug` refuses normal session tokens for device users.
3. **Boundary test:** yes. Extend `authz_boundary_test.exs` to flag `kind` checks
   outside `Authz`, and mark the list filters as data invariants. Parity files
   stay frozen.
4. **Number of device accounts:** allow any number. M2 describes how Matt will use
   it, not a limit to enforce.
5. **Personal sign-in:** a **"Sign in as me"** button that opens the normal email
   and password form. It returns to the device session after 5 idle minutes. *(Matt)*
6. **Home department:** **any** assignable department, chosen by the owner. *(Matt)*
7. **Pairing codes:** a new code does not invalidate earlier unused ones. Each
   expires on its own after 10 minutes.
8. **Managers:** yes. Managers of a device's home department see Admin → Shared
   devices, limited to their own departments' devices (this follows from spec Q2).
9. **Server-side revocation of personal tokens:** **deferred** *(Matt)*. The
   tablet deletes the personal token locally on sign-out or idle return; Guided
   Access covers copying. The lead files a backlog task. Note it in the handoff
   note's LIMITATIONS.

Record these in the plan (a "Decisions" section, or update the existing
proposed-decisions list) and the spec where wording changes, then start
Phase 2.
