# D35: Cut Off Calendar Feeds When Someone Leaves — Specification

**Status:** Approved (2026-10-04, Q1–Q4 answered)
**Created:** 2026-10-04
**Author:** Matt + CC
**Depends On:** D17 (calendar feeds), D18 (notifications), D31 (`Authz`)
**Process:** `docs/process/three_environment_workflow.md` (spec with persona scenarios → local gate → DEV gate → release)
**Backlog:** PortableMind project 254, task 3992
**Branch:** `d35-calendar-feed-rotation`, cut from `develop`

---

## 1. Problem Statement

Calendar feeds (D17) are ICS URLs that Google, Apple or Outlook calendars poll.
The secret token in the URL is the only credential (`GET /calendar/:token`).
`AuthPlug` isn't involved, so deactivating a user doesn't affect a feed URL
they already have.

There are three kinds of feed, and each person sees a fixed set of them in
Schedule → Calendar sync (`CalendarFeeds.feeds_for/1`):

| Feed | Who gets the URL | What it shows |
|---|---|---|
| **My shifts** (`user`) | the person themselves | their own published shifts and approved time off |
| **Department** (`department`) | that department's managers, and owners | the department's published shifts and its members' approved time off, **with names** |
| **Whole schedule** (`all`) | owners | every published shift and all approved time off, **with names** |

**The gap:** a manager or owner who leaves keeps receiving their departments'
schedules, or the whole schedule, with names and time off, for as long as their
calendar app keeps polling. The only fix today is to remember to press
Rotate on each feed by hand.

**Matt's decision (2026-10-04):** rotate automatically, and send a
notification to everybody who might need to re-subscribe.

## 2. Decisions

| # | Decision | Source |
|---|---|---|
| D1 | **When someone is deactivated, every feed they could see gets a new token at once.** The old URLs answer 404. | Matt, 2026-10-04 |
| D2 | **Everyone else who can see a rotated shared feed gets a notification** telling them to re-subscribe. | Matt, 2026-10-04 |
| Q1 | **Losing access without leaving rotates too.** That covers a manager made an employee, someone removed from a department they managed, and the owner flag removed. The shared feeds they lost rotate and others are notified the same way. Their own "My shifts" feed is left alone. | Matt, 2026-10-04 |
| Q2 | **The notification doesn't name the person.** It says "someone who could see them no longer works here" (deactivation) or "no longer has access to them" (Q1). | Matt, 2026-10-04 |
| Q3 | **In-app and push; no email.** For this event, in-app and push are on by default and email is off. Push reaches only people who have turned on push on a device. The event is listed in Notification preferences as "Calendar link changed", so people can change it. | Matt, 2026-10-04 |
| Q4 | **No combining.** Each deactivation or access change sends its own notifications. | Matt, 2026-10-04 |

---

## 3. Requirements

### 3.1 Rotation on deactivation (D1) and on lost access (Q1)

When an owner or manager deactivates a person (`Accounts.update_user` with
`active: false`), all of the following happen in the same transaction as the
deactivation:
- **Their own "My shifts" feed** gets a new token. Nobody else is notified,
  because nobody else gets that URL.
- **Every department feed they could see** gets a new token. That means every
  department they managed, or every department if they were an owner.
- **The whole-schedule feed** gets a new token if they were an owner.
- A feed that was never created (no one ever opened Calendar sync for it)
  is skipped; there is nothing to rotate.
- **An audit entry** records the rotation:
  - action `calendar_feeds.rotated`, with `reason` `departed` or `lost_access`;
  - the target is the person who left;
  - the data lists the rotated feeds (type and id), never the tokens.

The rotation uses what the person could see **at the moment before they were
deactivated**, since afterwards they have no memberships worth checking.

**Losing access while staying (Q1).** Rotation also happens whenever a
person's set of shared feeds shrinks while they stay active. The set is
compared before and after the change, inside the same transaction:
- **Memberships change** (`Accounts.set_memberships`): a manager made an
  employee, or removed from a department they managed. That department's
  feed rotates.
- **The owner flag is removed** (`Accounts.update_user` with
  `is_owner: false`). Every department feed they don't still manage rotates,
  and so does the whole-schedule feed.

Their own "My shifts" feed is **not** rotated, because they're still here.
Gaining access rotates nothing.

Reactivating someone changes nothing. Their feeds are created or shown again
the usual way, with the current tokens.

Device accounts (D33) have no feeds and are unaffected.

### 3.2 The notification (D2)

- **Recipients** are everyone who **still** gets the URL of a rotated shared
  feed:
  - for a department feed, that department's other active managers, plus
    the active owners;
  - for the whole-schedule feed, the other active owners.
- **The actor gets one too.** They subscribed to the old URL like anyone else.
- Nobody is notified about the departed person's own "My shifts" feed.
- **We can't know who actually subscribed**, because the feed has no record of
  who uses it, so we notify everyone who gets the URL. The message says "if
  you subscribed".
- **One notification per person**, listing every feed of theirs that changed.
  For example, an owner whose Taproom and Whole-schedule feeds both rotated
  gets one message, not two.
- **Content (draft):**
  - Title: "Re-subscribe to your Rockcut calendar"
  - Body: "The link for *Taproom* and *Whole schedule* changed because someone
    who could see them no longer works here" (for Q1: "no longer has access
    to them"), followed by "If you subscribed to these in Google, Apple or
    Outlook Calendar, remove the old calendar and add the new link from
    Schedule → Calendar sync."
  - Data: a link to Schedule → Calendar sync.
- **Delivery** is best-effort and after commit, like every D18 notification.
  A failed push never blocks the deactivation or access change.
- **New event key:** `calendar_feed_rotated` (Q3).
  - Defaults: in-app **on**, push **on**, email **off**.
  - These go in the backend's `@event_defaults` and the UI's `EVENT_DEFAULTS`,
    and the two must match.
  - It's listed in Notification preferences as "Calendar link changed".

### 3.3 Manual Rotate (unchanged, but consistent)

The existing Rotate button in Calendar sync keeps working as it does today.
**Out of scope:** notifying others after a manual rotate. That's a possible
follow-up, since it has the same "everyone else must re-subscribe" effect.

### 3.4 Calendar sync screen

No change is required. It already shows the current URL for each feed. The
notification links to it.

### 3.5 Non-functional

- Rotating and notifying adds no noticeable time to a deactivation: a handful
  of feed rows plus one notification row per recipient.
- Tokens never appear in logs, audit data, notifications or emails.
- **Revert-and-rerun:** each new test is shown to fail without the change.

## 4. Persona scenarios

Seed personas (D30): `owner`, `owner2` (a second owner), `barMgr` (Taproom
manager), `dualMgr` (manages Taproom and Office), `breweryMgr`, `bartender1`.
Scenarios that deactivate use throwaway `[TEST-TEMP]` people, never a persona.

| # | Who acts | Who leaves | Expected |
|---|---|---|---|
| S1 | `owner` | a `[TEST-TEMP]` Taproom **employee** whose own feed exists | Their own feed's old URL → 404. No department or whole-schedule feed changes. **Nobody** is notified. |
| S2 | `owner` | a `[TEST-TEMP]` Taproom **manager** | The Taproom feed's old URL → 404, and the new URL works. `barMgr`, `dualMgr`, `owner` and `owner2` each get one "Re-subscribe" notification naming Taproom. `breweryMgr` and `bartender1` get nothing. The Office and Brewery feeds are unchanged. |
| S3 | `owner` | a `[TEST-TEMP]` manager of Taproom **and** Office | Both feeds rotate. `dualMgr` gets **one** notification listing both. `barMgr` gets one listing Taproom only. |
| S4 | `owner` | a `[TEST-TEMP]` **owner** | Every department feed and the whole-schedule feed rotate. Every other active owner and every manager gets one notification listing their changed feeds. |
| S5 | `barMgr` (managers may deactivate their departments' members) | a `[TEST-TEMP]` Taproom manager | Same as S2, and `barMgr` is notified too. |
| S6 | `owner` | a `[TEST-TEMP]` Taproom manager, where the Taproom feed was never created | Nothing to rotate, and nobody notified about Taproom. |
| S7 | `owner` | reactivates S2's person | No feed changes and no notifications. Their Calendar sync shows the current URLs. |
| S8 | anyone | the last-owner guard refuses a deactivation | No feed rotates and nobody is notified (the transaction rolls back). |
| S9 | `owner` | deactivation succeeds but push delivery fails | The deactivation still succeeds, and the in-app notification is still there. No email is sent (Q3). |
| S10 | `barMgr` | opens the notification | It goes to Schedule → Calendar sync, which shows the new Taproom URL. |
| S11 | `owner` | makes a `[TEST-TEMP]` Taproom manager an employee (Q1) | Same as S2, with "no longer has access to them". Their own feed is **not** rotated. |
| S12 | `owner` | removes a `[TEST-TEMP]` manager of Taproom and Office from Office, keeping Taproom (Q1) | Only the Office feed rotates. `dualMgr` gets one notification listing Office. |
| S13 | `owner` | removes the owner flag from a `[TEST-TEMP]` owner who also manages Taproom (Q1) | The whole-schedule feed and every department feed except Taproom rotate. Taproom is unchanged. |
| S14 | `owner` | makes a `[TEST-TEMP]` employee a manager (gaining access) | Nothing rotates and nobody is notified. |
| S15 | a `[TEST-TEMP]` Taproom manager | turns "Calendar link changed" off, then another Taproom manager leaves | That manager gets nothing; the others are still notified. |

## 5. Out of Scope

- Per-person subscription tokens for shared feeds. Those would let one person
  be cut off without anyone else re-subscribing. That's the longer-term fix
  in task 3992; this deliverable is the simple one Matt chose.
- Notifying others after a manual Rotate (§3.3).
- Knowing who actually subscribed to a feed.
- Changing what feeds contain (task 4055 adds events).

## 6. Open Questions

None. Q1–Q4 were answered by Matt on 2026-10-04 (§2).
