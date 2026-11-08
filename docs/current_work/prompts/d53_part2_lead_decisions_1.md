# D53 Part 2: lead decisions 1

2026-11-08 · lead → builder, answering stop 1.

1. **Archived is for people only:** agreed.
2. **Unique label names per board:** yes, but **case-insensitive** ("Equipment" and "equipment" are the
   same label). Trim the whitespace too.
3. **No separate board GET:** agreed.
4. **LEAD-1, yes:** a sent task keeps "From idea: <title>" (no link) after its card is deleted for good.
   Make `idea_card_tasks.card_id` nullable with `nilify_all` and keep a `card_title` copy. Change the
   stage 1 migration in place, since nothing has shipped. The task dialog shows the plain title when
   the card is gone or the viewer can't open its board.
5. **Picker people in stage 3:** agreed.
6. **Reseed in stage 8:** agreed. `cleanup_temp` must cover `[TEST-TEMP]` lists, cards and labels on
   every board too.

## Next

Stage 3 (the write API) to **stop 2**, as the plan says. The rules are in spec §4.1–§4.5, plus
§2's decisions 13, 14 and 16. Commit the status with a message containing `stop 2`, then stop.
