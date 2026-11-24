# D64 lead decisions 4: gap 7 (Matt, 2026-11-23)

Part of the decisions 3 cycle. Gap 3 is **still held**.

**Gap 7: un-checking (or Undo of) a harvest saved with "This brink is empty" brings the old yeast
back.** This replaces Stop 4 decision 5 ("keep it as built"), which was the lead's call.

- In one transaction: the new record is voided, the "Emptied when …" adjustment goes, and the old
  record is open again with the same weight, strains, generation, sources and counts it had.
- Its Count task comes back if a recount was due when it closed (as gap 4's Remove).
- The existing lock still applies to the new record: any later pitch, count, dump or adjustment
  refuses the un-check with the same sentence, and nothing changes.
- If the harvest also recorded into a dirty brink, gap 8's rule holds as well.
- The adjustment still can't be removed from History by itself.
- Once restored, the first harvest un-checks by its own normal rules.
- If it needs a schema change, ask first: `20261122120013` has already run on dev.

Tests: the QA repro (40 lb, then 9 lb as "This brink is empty", then un-check → 40 lb back), the
refusal, Undo on the Gantt, the board and device path, and the count in effect after the restore.
Prove them by revert. Include the result in the decisions 3 reply.
