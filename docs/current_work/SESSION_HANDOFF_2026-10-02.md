# Session Handoff — 2026-10-02

Follows `SESSION_HANDOFF_2026-10-01.md`.

This session: **release `v2026.10.02` (D31 + D32 + D33 + task 3999) shipped to
prod**, then the release close-out.

---

## Where things are

| Environment | State |
|---|---|
| **Prod** | `rockcut-api` **v21** / `rockcut-ui` **v17** = **`v2026.10.02`** (`5fd6b93`), deployed about 16:09 UTC Oct 2. Rollback targets: API v20 `registry.fly.io/rockcut-api:deployment-01M3TJKSAE082HF16DKYFGD6EA`, UI v16 `registry.fly.io/rockcut-ui:deployment-01M3TJRAWRRBCQWEN1VCM0PKRX`. Pre-release snapshot `vs_D77eM5Z258nIwL5X54Db4R1`. |
| **DEV** | `rockcut-api-dev` v14 / `rockcut-ui-dev` v9 = `921dfd8` (same code as the release). Free. |

**GitHub:** `main` = `5fd6b93`, tag `v2026.10.02`. PR #8 merged; versions and
smoke results are in its comments. Reported in conv 80, msg 84288.

## The release

- Pre-checks: prod's department was exactly "Bar" (key `bar`), with 4 positions
  in group "Bar". A week had been published at 15:57 UTC (31 shifts in one
  minute); the deploy waited until it had been quiet for about 10 minutes.
- Rick's review (conv 80, msg 83616) was folded into the PR body: tablets paired
  the next day, devices deactivated before any rollback after pairing, a taproom
  staff check, and the queue-drop log watch.
- Smoke, all green:
  - 5 migrations ran at boot;
  - "Taproom" department and position group; 111 shifts intact; pool size 1;
  - health and UI 200; `sw.js` `no-cache`; manifest `orientation: any`;
  - bundle check OK; `pnpm audit --prod` clean; `mix hex.audit` only `decimal`;
  - synthetic login 401, 0 synthetic users;
  - **Matt's own login check clean.**
- Logs: no errors, locks, queue drops or 5xx in the first hour.

## Still open from the release

1. **A taproom staff member opens their schedule.** As of about 17:05 UTC no staff
   activity showed in the DB since the deploy (schedule-only visits leave no
   per-user trace).
2. **Keep watching the logs** for `dropped from queue`, `database is locked`,
   `ConnectionError`. If they show up, raise `queue_target`/`queue_interval`,
   not `POOL_SIZE` (Rick).
3. **Pair the tablets (Oct 3 or later):** Admin → Shared devices → create
   "Taproom tablets" (home: Taproom), pair per `docs/process/taproom_tablet_setup.md`.

## Close-out done

- COMPLETE records: `d32_schedule_events_COMPLETE.md`,
  `d33_taproom_device_access_COMPLETE.md`; D31's record updated to released.
- CLAUDE.md: Completed table D31–D33; "Next deliverable" updated.
- Backlog tasks 3887, 3937, 3938, 3939, 3940, 3999 closed.
- Old worktrees and scratch folders removed.

## Next deliverable: not chosen

Candidates:
- **3991:** server-side revoke of a tablet's "Sign in as me" token.
- A "new version available, tap to reload" prompt (no task yet): after every
  deploy the first load shows the cached old app.
- Deferred by Matt from D32: events in calendar feeds (spec Q3); company-wide
  events (spec Q7).
- Small: 4001, 4002, 4003, 3992, 3997, 3942.
- Dated: **3994**, the monthly `decimal` advisory check, due 2026-10-30.

## Gotchas (new this session)

- **Migrations run at boot** (`Ecto.Migrator` in the supervision tree when
  `RELEASE_NAME` is set); no manual `Release.migrate()` needed.
- In `rpc` strings, use `~s|...|`: a `count(*)` closes `~s(...)` early.
- If `fly ssh console` times out with "tunnel unavailable", run `fly agent restart`.
