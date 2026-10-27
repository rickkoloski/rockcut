# D46 QA report: Production setup (DEV, build 3e81989)

Tester: independent QA (automated Playwright + manual scripting), 2026-10-21 (America/Denver). Scripts are in `scripts/`, logs in `results/` and screenshots in `shots/`.

## Summary

All listed scenarios P1–P19 pass. There is **1 must-fix** (a second Transfer/Filter can be silently mis-assigned), plus several minor issues. **Incident caused by QA:** during cleanup I accidentally retired 10 tanks and deleted 5 outages that belonged to the parallel Playwright run (see the end of this report).

## Must-fix

### M1. A second Transfer/Filter can go into the tank it's already in. Its CIP is then put on the wrong tank, and the issues banner doesn't catch it
- **Path:** Template editor → Add step → Transfer (or Filter), Tank = "After transfer 1", day 39, on a template that already has a Transfer on day 35.
- **Expected:** The beer moves out of tank 1 into a new tank (after transfer 2). A CIP & Sanitize is added for tank 1, the tank it leaves. If the choice makes no sense, it's refused.
- **Observed:** Saved with `vessel_index 1`, so the beer "transfers" into the tank it's already in. The auto CIP & Sanitize was added to the **First tank**, which had already been emptied and cleaned on day 35. The banner still says only "The tank after transfer 1 has no Package, Split or Transfer." It doesn't flag the nonsense transfer. Filter behaves the same way. The Tank field on a Transfer actually means the destination tank: picking "After transfer 2" gives the correct result (Transfer v2, CIP v1). But the field is just labelled "Tank", the first Transfer's default "First tank" is quietly changed to "After transfer 1", and the bad choice is accepted.
- **Repro:** `scripts/xfer2.mjs`, `scripts/xfer3.mjs`, `scripts/misc.mjs` (Filter). Screenshot: `shots/BUG_second_transfer.png`.
- **Suggest:** Label the field "Into tank", or default it to the next new tank. Refuse a Transfer/Filter whose destination is not a new tank after its source.

## Minor

1. **Link pickers offer steps that can't be picked.** "Comes after" lists later-day steps and "Leads to" lists earlier-day steps. The server rejects them correctly ("A step can't come before the step it follows." / "That link would go in a circle."), but only after the user picks one. (`scripts/p16b.mjs`, `p16c.mjs`, `shots/link_earlier_day.png`)
2. **Link and outage changes inside an edit dialog save immediately, and Cancel doesn't undo them.** Remove link, Link, the default-answer dropdown, and Delete of an out-of-service period all fire at once, with no confirmation for the deletes. The dialog's Cancel then implies nothing was saved. (`scripts/p16*.mjs`, `oos2.mjs`)
3. **A stale editor gives a bare "Not found".** If user A removes a step and user B (page open from before) edits it, or links a new step to it, B's dialog shows only "Not found". The step still appears on B's page until a reload. Suggest "This step was removed by someone else — reload". (`scripts/conc.mjs`, `shots/conc_stale_edit.png`)
4. **The API accepts a step in a tank that doesn't exist** (`vessel_index: 5` on a template with one transfer) → 201. The editor then shows "After transfer 5" and four reasons about missing tanks. The UI can't do this, so it's API-only. (`scripts/edges2.mjs`)
5. **Ramp preview shows impossible values before it refuses them.** Start 90 → 20 previews "8 Set temp steps: 90° … 20°", and 0.5°/day previews "34°, 33.5° …". Add ramp is then blocked only by the browser's min/max popup. The ramp text should reflect the 28–80°F and ≥1° limits. (`shots/edge_ramp90.png`)
6. **Contrast:** in dark mode the "Now" out-of-service chip is white on #f44336 (3.68:1), and the "Out Oct 28–Nov 3" outline chip is 4.29:1. The "Incomplete" badge on the templates list (light mode) is 3.11:1. All phase chips and preview colors passed the 4.5:1 check in both themes (`scripts/darkphone.mjs`).
7. **Phone (412 px) preview:** the timeline scrolls sideways inside its card (no page overflow), but the "First tank" / "After transfer 1" labels scroll away with the bars, and there's no hint that it scrolls. (`shots/dark_phone_editor.png`, `shots/phone_preview_scrolled.png`)
8. **Tank capacity ≥ 10000** shows the raw server text "must be less than 10000" (other messages are friendly). A full-width "Ｆv1" is accepted as a different name from FV1 (API-only edge case).
9. **Copy text:** the "Add phase start" dialog's help text mentions "Leads to", but that dialog has no Leads to field.
10. **Accessibility:** each sortable row has `role=button` and contains other buttons (Edit, Retire, arrows). Screen readers announce the whole row as one button.
11. **Duplicate names the copy "Copy of …"**, so a duplicated `[TEST-TEMP]`/`[SEED]` template doesn't keep its prefix. That's by design, but worth knowing for test hygiene.

## Scenario results

| # | Result | Notes |
|---|---|---|
| Seed check | PASS | 9 phases and 19 step types in the spec order. 9 tanks. Serving 2 outages Oct 28–Nov 3 ("Replace door gasket") and Sep 21–23. 3 complete `[SEED]` templates. |
| P1 | PASS | Listed last; persists after reload. |
| P2 | PASS | Arrows (including 9 rapid clicks) and mouse drag both persist; brewer2 sees the same order. Order restored. |
| P3 | PASS | "A tank named FV1 already exists." Also for "  FV1  " and "FV1 " via the API. Empty name, 0, negative and missing capacity are all refused. Names are capped at 30 characters (UI maxlength, API too). |
| P5 | PASS | Confirm dialog → moves to "Retired (1)" → Restore (comes back at the end of the list). |
| P7 | PASS | Chip "Out from Oct 21"; shown under Now; persists. |
| P8 | PASS | A period starting today is deleted (as specified). A period starting Oct 15 → "Thu Oct 15 – Tue Oct 20", moves to Past. "Back in service today" appears only on current periods. |
| P9 | PASS | "That overlaps another period (Thu Oct 15 – Tue Oct 20). Change that one instead." Nothing saved. Also covers an open-ended period, Change into an overlap, end before start, and empty start. A period right after another (adjacent) is allowed. |
| P11 | PASS | Appears in the Add step picker with its full name and preset phase. Duplicate names ("pdh", "TRANSFER", "LAG") and empty names are refused. |
| P12 | PASS | Hidden from the picker; the template still shows the step, and it can still be edited. |
| P13 | PASS | No Retire on built-ins. The API also refuses ("Built-in step types can't be retired."). |
| P14 | PASS | 14 entries in day order; the Transfer added a day-35 CIP for the First tank; no banner; the preview shows both tanks colored by phase, the hatched CIP and task dots. |
| P15 | PASS | 58°, 48°, 38°, 32° on days 18–21, chained. An uneven ramp (58→33 by 10) gives 58/48/38/33. Start = target is refused. |
| P16 | PASS | The row shows "after Carb · stays". |
| P17 | PASS | Remove confirm → banner "The tank after transfer 1 has no Package, Split or Transfer."; the list shows Incomplete, and hovering it shows the reason. |
| P18 | PASS | The copy has new step IDs; after rename, edit, add and remove, the original is identical. |
| P19 | PASS | bartender1/2, barMgr, office1, sales1, noDept, hidden and dualMgr (Taproom+Office only): no Production nav, typed URLs go Home, all API calls 403 (including POST). The brewery and taproom tablets get "Not available on a shared device" and API 403. owner, owner2, floater, breweryMgr, splitRole (a Brewery employee) and brewer2 have full access. |
| Brew day | PASS | No Remove button. The API refuses moving it, changing its tank, or deleting it ("brew_day_fixed"). |
| Double-click | PASS | Double-clicking Save/Add on Add step, New template and Add tank creates only one. |
| Dark mode / phone | PASS with minor 6–7 | No horizontal page overflow at 412 px on any production page or dialog. The theme was set back to Light (`color_mode=light` confirmed). |
| Limitation 3 | PASS | Mouse drag reorders tanks and phases. |

Not tested: touch drag (that's checked by hand on a tablet), and step-type drag (no `[TEST-TEMP]` step type was active to reorder).

## QA-caused incident (please read)

During final cleanup, my script retired every tank with id ≥ 10. That included **10 `[TEST-TEMP]` tanks (ids 15–24) created by the parallel Playwright run**, and it **deleted 5 of their out-of-service periods (outage ids 7, 8, 10, 11, 12)**. I restored all 10 tanks straight away (all returned 200), but the deleted outages can't be recovered from here. If the parallel run failed around that time on tanks named like `[TEST-TEMP] FV3 back …`, `FV3 today …` or `Serving 2 …`, this is the likely cause. Their tank order may also have changed, because restored tanks go to the end of the list.

## Cleanup status

- My tanks (FV8, C25, XXXX…, Fv1-fullwidth (renamed from "Ｆv1" before retiring), P19 (created by splitRole), DblTank) are retired and their outages deleted.
- Phases `[TEST-TEMP] QA1/QA2` and step type `[TEST-TEMP] Hop check` are retired.
- Templates 4, 13, 14 and 15 are retired.
- The seed order is unchanged (FV1–Serving 2 at positions 1–9). Serving 2 still has both of its outages, 9 active phases, 19 active step types, and only the 3 `[SEED]` templates are active.
- No persona was signed out or changed. No tokens were printed (the API helper redacts them).
