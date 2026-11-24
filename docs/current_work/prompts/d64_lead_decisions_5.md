# D64 lead decisions 5: gap 3 (Matt, 2026-11-23)

Part of the decisions 3 cycle. Nothing is held now.

**Gap 3: a brink pitch or a cell count dated before the record's first harvest is refused** (422,
nothing written): "YB2's yeast was harvested 11/23. Pick that day or later."

- First harvest = the earliest `harvested` date on the open record. The same day is allowed.
- Applies to adding a pitch, adding a count, and editing a count's date. The dialogs set the
  date's minimum and show the sentence; the API enforces it.
- Purchased-yeast pitches are unchanged.
- **Keep the rule in the Pitch and count actions, not in a shared layer brew day will need.** Matt's
  D63 rule: a brew is never left unrecorded because there's no yeast record.
- Do Dump and Adjust take a user-entered date? If so, tell me in the reply; don't change them.

Tests: the day before (refused), the same day (allowed), after a harvest on top dated later and
one dated earlier than the first, a count edit, and the dialogs. Prove by revert.
