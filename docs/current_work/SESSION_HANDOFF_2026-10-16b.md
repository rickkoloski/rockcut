# Session Handoff — 2026-10-16 (b)

Supersedes `SESSION_HANDOFF_2026-10-16.md` (still accurate; this adds the
backlog review). **Prod is `v2026.10.16`. Nothing is in flight; DEV is free.**

## Where things are

| | State |
|---|---|
| **Prod** | **`v2026.10.16`** (PR #30, UI only): UI v23 (build id `v2026.10.16`), API v27 (`v2026.10.15`). Rollback UI v22; snapshot `vs_l03KbyLXg4j1tewzvl2XXXmw`. Matt's checks passed. |
| **DEV** | Free (conv 80 msg 90142). Runs `develop` (API v42 / UI v45). |
| **develop** | `1937ea2` (close-out PR #31) + this handoff. `main` is an ancestor; app code == prod. |
| **Local** | Checkout on `develop`; herdr `theme-servers` tab runs the local API/UI; builder idle; no other tabs. |

Shipped over the last two days: **D43** (Hop Field themes, dark mode, layout
polish; `v2026.10.15`) and **D45** (update prompt, View Schedule 7 days, Hide
shifts; `v2026.10.16`). Records in `stepwise_results/`. Task 4054 closed.

## Backlog (PortableMind project 254: 32 open, reviewed with Matt 2026-10-16)

- **Due:** **3994** (`decimal` advisory monthly check; `bandit` HTTP/2
  advisory fold-in still unconfirmed by Matt) **Oct 30**; **4058** (remove the
  pre-D34 token path) **Nov 4**.
- **Features:** 4055 (events in calendar feeds), 4056 (company-wide events);
  **D44** (time off dialogs in the Scheduler) is a draft spec, questions
  deferred.
- **Small fixes / polish:** 4231 (create-user returns the temp password in the
  API response), 4232 (Publish Week has no confirm), 4298 (Light "Acting as"
  bar contrast), 4318 (`/tasks/taproom` link), 4319 (push in private windows),
  4061, 4062, 4063, 4115, 4116, 4118, 4261, 4238.
- **Housekeeping / flakes:** 4084 (26 lint errors), 4119 + 4233
  (`source-map-js`, build-time), 4057 / 4060 / 4064 (flaky tests), 3856
  (telemetry).
- **Parked, long-term:** RBAC 3847 + 3849–3853, 3855 (SQLite → Postgres), 3843
  (malt spec reference).

**Proposed to Matt (not decided):** a small security/maintenance deliverable
(3994 + 4058 + 4231, due-date driven), and/or a D36-style backlog sweep
(4232, 4298, 4318, 4319, 4062, 4063). D46 is the next free ID.

## Open for Matt

- Pick the next deliverable (above, or D44 / 4055 / 4056).
- Confirm folding the `bandit` upgrade into 3994.
- Pair the brewhouse tablet on prod; set tablet themes in Shared devices.
- OK to delete: `~/src/rockcut-d4*-qa/`, `~/src/rockcut-d43-scratch/`, local
  branch `local/theme-preview`.

## Reminders

- Releases now announce themselves (D45). Stamp prod UI deploys with
  `--build-arg VITE_BUILD_ID=<tag>`; a UI-only release skips the API deploy.
- Memory is tight on this machine: Playwright `--workers=2`, one run at a time.
- Gotchas from the last two days are in `SESSION_HANDOFF_2026-10-15b.md` and
  `SESSION_HANDOFF_2026-10-16.md`.
