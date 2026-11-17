# D44 builder brief — Stage 1 (API)

2026-11-16 · lead → builder.

**Read first:** `docs/current_work/specs/d44_scheduler_time_off_dialogs_spec.md` (answered) and
`docs/current_work/planning/d44_time_off_plan.md`. This brief covers **plan Stage 1 only**. Stop
after it and report; Stage 2 (UI) comes as a separate brief.

**Where:** `~/src/rockcut`, branch `d44-time-off` (already checked out; don't switch). Commit your
work on it in small commits (`feat: D44 …`), staging paths by name. No push, merge or rebase. The
lead owns the servers; Stage 1 needs only `mix test`.

## Do

1. **"Past" in one place** (`lib/rockcut_api/time_off.ex`): a request is past when the Colorado day
   of `ends_at` is before today (Colorado). Add `past?/1` and a query helper for "ends on or after
   the start of today, Colorado". Reuse the Colorado-midnight helper `Scheduling` already has (see
   around `scheduling.ex:487`); expose it if it's private rather than writing a second one. Don't
   change the existing `from`/`to` filters.
2. **List filter:** `GET /api/time_off?when=current|past`. `current` = not past (keep the existing
   order), `past` = past, newest first by `starts_at`. No `when` = unchanged. Any other value → 422.
3. **Past is read-only:** `TimeOff.review/4` and `TimeOff.cancel/2` refuse a past request with
   `{:error, :past}` → 422 `"This time off has already passed"` in the controller. The check comes
   after the authorization check (a stranger still gets 403).
4. **`time_off_requested`** (spec §2.5): after a successful **own** create (status pending), notify
   every person who could review it, except the requester: active, non-device users for whom
   `Authz.can?(user, :review, req)` is true. Build the candidate set cheaply (owners + managers of
   the requester's departments), then filter with `Authz.can?` so the list can't drift from the
   rule. One notification per person. Nothing for an on-behalf create.
   Payload `%{title, body, data: %{url: "/time_off"}}`. Title e.g. "Sam Pour requested time off";
   body: type, dates and times or "All day" (Colorado), and their note if any. Look at how
   `messaging.ex` and `calendar_feeds.ex` build payloads and copy their style.
5. **`time_off_reviewed`** (spec §2.7): after a successful review (approved or denied, including
   denying an approved request), notify the requester, unless the reviewer is the requester. Title
   e.g. "Your time off was approved" / "…was denied"; body: type, dates, who decided, and
   `reviewer_note` if any. `data.url` `/time_off`.
6. Add both events to `Notifications.@events` (normal defaults, no `@event_defaults` entry).
   Delivery is best-effort: a notification failure must not fail the create or review (check how
   `notify` already behaves and keep it that way).
7. **Badge count** (spec §2.6): `pending_time_off` in the `/api/me` capabilities
   (`accounts.ex` near `pending_owner_reviews`) = count of requests that are `pending`, not past, and
   visible under `TimeOff.list_for/2`'s visibility (own + people the user manages; owners all).
   Do it as a count query, not by loading rows. `Authz.Device.capabilities/1` gets
   `pending_time_off: 0`.
8. **Tests** (ExUnit, both a refusal and an allowed case for every rule):
   - `when` filter: current/past split, a request ending 23:59 Colorado today (current) and
     yesterday (past), a request ending today early-morning UTC that is still yesterday in
     Colorado, an unknown value (422), no param (unchanged).
   - review and cancel of a past request → 422; of a current one → still works; a stranger on a
     past one → 403.
   - `time_off_requested` recipients for a request by `bartender1` (both bar managers incl.
     `dualMgr`/`splitRole` if fixtures mirror them, owners; not `breweryMgr`, not the requester,
     no devices, no inactive owner); a manager's own request reaches the other reviewers but not
     them; an on-behalf create sends nothing. Assert one notification per recipient and that the
     recipient set equals the `Authz.can?(_, :review, req)` set over all fixture users.
   - `time_off_reviewed`: approve, deny, and deny of an approved request notify the requester with
     the note in the body; a self-approval sends nothing.
   - `pending_time_off`: employee with and without a pending request, their manager, a manager of
     another department (0), an owner, a past pending request (not counted), a request that is
     both own and reviewable counts once, a device (0).

## Don't

- No UI changes (Stage 2). No migration.
- Don't touch `CLAUDE.md`, the spec, the plan or `SESSION_HANDOFF_*`.
- No repo-wide `mix format`: format only the files you change (`mix format path/to/file.ex`).

## Done when

- `mix test` green (run it twice), `mix compile --warnings-as-errors` clean.
- Commits on the branch.
- Reply with: commits (sha + subject), files touched, test counts, and anything you weren't sure
  about prefixed `LEAD:`.
