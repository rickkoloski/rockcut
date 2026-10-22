# D48 lead decisions 1, 2026-10-21

**Flag signature version tag** (Matt, after Rick's questions in discussion 80):
- **The prefix:** `Flags.signature/1` adds a recipe version as the first part, so the string reads `v1|…`. Put the version in one module attribute (`@signature_version "v1"`), with a doc comment explaining what follows from it. Changing which values go into any flag's signature, or how they're written, means **bumping the version and shipping a data migration that recomputes the stored `flag_signoffs.signature` values** for sign-offs that still match under the old recipe. Without that migration, every sign-off would read as reopened.
- **ExUnit:**
  - the signature starts from the `v1` tag (assert it on the canonical string, before hashing);
  - an existing sign-off made with the current recipe stays signed off;
  - a moduledoc check isn't needed.
- **Existing DEV and local sign-offs** get new signatures. The reseed restores the seed's, as in D47 cycle 3. Prod has no sign-offs yet.
- **When:** in Task 4, as its own small commit. It doesn't matter whether it goes before or after the UI work.

## After Task 4 (`fa21c12`, `13ad04f`, `a6745d6`)

- **Production project:** 116 passed, 0 failed (13.5 min). The API was restarted and reseeded first.
- **Choice 1** (an out-of-service tank offers both marks; the server guards with `tank_in_use`): accepted.
- **Choice 2, the part that stays drawn on a second lane: change it.** A part's fill that **is** its parent's Split (or a Transfer's hand-off in the same tank) doesn't count as an overlap for lane stacking. The parent's bar ending on the split day and the staying part's bar starting that day share one lane. Use the same occupancy helper (D47 cycle-2 rule: the exit day belongs to the leaver; the fill on that day is the hand-off). Add a Vitest test for the lane layout and a Playwright assertion that the row height doesn't grow.
- **Choice 3,** Escape also closing the Undo message: accepted (D47 behavior).
