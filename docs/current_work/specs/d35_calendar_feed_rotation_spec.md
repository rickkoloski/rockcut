# D35: Cut Off Calendar Feeds When Someone Leaves — Specification

**Status:** Draft — Q1–Q4 for Matt
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
| Q1 | *Open.* Should the same happen when someone **loses access without being deactivated**? For example, a manager made an employee, a department membership removed, or the owner flag removed. | Matt |
| Q2 | *Open.* Should the notification **name the person who left**? | Matt |
| Q3 | *Open.* Which **channels** should the notification use, and **can people turn it off**? | Matt |
| Q4 | *Open.* An owner may deactivate several people at once, for example at the end of a season. Should the notifications for one feed be **combined**? | Matt |

## 3. Requirements

### 3.1 Rotation on deactivation (D1)

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
  - action `calendar_feeds.rotated_on_departure`;
  - the target is the person who left;
  - the data lists the rotated feeds (type and id), never the tokens.

The rotation uses what the person could see **at the moment before they were
deactivated**, since afterwards they have no memberships worth checking.

Reactivating someone changes nothing. Their feeds are created or shown again
the usual way, with the current tokens.

Device accounts (D33) have no feeds and are unaffected.

### 3.2 The notification (D2)

- **Recipients** are everyone who **still** gets the URL of a rotated shared
  feed:
  - for a department feed, that department's other active managers, plus
    the active owners;
  - for the whole-schedule feed, the other active owners.
- **The actor gets one too,** unless they choose otherwise in Q3. They
  subscribed to the old URL like anyone else.
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
    who could see them no longer works here. If you subscribed to these in
    Google, Apple or Outlook Calendar, remove the old calendar and add the new
    link from Schedule → Calendar sync."
  - Data: a link to Schedule → Calendar sync.
- **Delivery** is best-effort and after commit, like every D18 notification.
  A failed email never blocks the deactivation.
- **New event key:** `calendar_feed_rotated`. See Q3 for its defaults and
  whether it shows in the notification preferences.

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
| S9 | `owner` | deactivation succeeds but email delivery fails | The deactivation still succeeds, and the in-app notification is still there. |
| S10 | `barMgr` | opens the notification | It goes to Schedule → Calendar sync, which shows the new Taproom URL. |
| S11 | (Q1, if yes) `owner` | demotes a `[TEST-TEMP]` Taproom manager to employee | Same as S2. Their own feed is **not** rotated, because they're still here. |

## 5. Out of Scope

- Per-person subscription tokens for shared feeds. Those would let one person
  be cut off without anyone else re-subscribing. That's the longer-term fix
  in task 3992; this deliverable is the simple one Matt chose.
- Notifying others after a manual Rotate (§3.3).
- Knowing who actually subscribed to a feed.
- Changing what feeds contain (task 4055 adds events).

## 6. Open Questions

**Q1. Losing access without leaving.** The same leak happens when someone stays
but loses access to a shared feed:
- a manager made an employee;
- removed from a department they managed;
- the owner flag removed.

*Recommendation:* **yes**. Rotate the shared feeds they lost, notify the
same way, and leave their own feed alone. Otherwise a demoted manager keeps
seeing the department's schedule with time off.

**Q2. Name the person who left?** *Recommendation:* **no**. Say "someone who
could see them no longer works here" (or "no longer has access", for Q1).
Managers learn who left in other ways, and a notification email isn't a good
place for a name.

**Q3. Channels and opting out.** *Recommendation:*
- **in-app and email on, push off**, like the other D18 events;
- show it in Notification preferences as "Calendar link changed", so people
  can mute it;
- the actor gets it too, because they need to re-subscribe as well.

**Q4. Several departures at once.** *Recommendation:* **don't combine** in
D35. Each deactivation sends its own notification, and each one says the
link changed. Combining needs a delay or a queue. A burst of departures is
rare, and the latest notification always points to the current link.
