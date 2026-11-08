# D53 Part 2: lead decisions 2

2026-11-08 · lead → builder, answering stop 2.

1. **Leaving also removes the person from archived cards:** agreed.
2. **An archived card is read-only until restored.** Refuse edits, checklist writes and new notes on
   an archived card, or on any card in an archived list, with 422 `archived` (the UI won't offer
   them). A manager can still delete one for good, and anyone who can open the board can still
   restore it. Watch on and off is still allowed. Add the tests.
3. **No History, and so no Watch notification, for reorders within a list or of the checklist:**
   agreed.
4. **403 rather than 423 for lock, unlock and delete-for-good:** agreed.
5. **The checklist is fully frozen in a locked list for non-managers:** agreed.

## Next

Stages 4 (Watch notifications) and 5 (Send to task list), as the plan says, to **stop 3**. Spec §4.6
and §4.7; the timing is 10–15 minutes on the existing scanner. Commit the status with a message
containing `stop 3`, then stop.
