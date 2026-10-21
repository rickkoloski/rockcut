# D47 QA recheck: Rockcut Production Gantt (DEV, build `31890b6`)

- **Target:** DEV only (https://rockcut-ui-dev.fly.dev, https://rockcut-api-dev.fly.dev). Date 2026-10-21, America/Denver. Chromium through Playwright 1.63, one browser, closed at the end.
- **Persona:** `brewer1` (Jake Brewer). The fresh auth files worked; there were no 401s. No persona was signed out or changed. No token was printed, logged or screenshotted, and every API call ran from inside the page.
- **Evidence:** screenshots in `shots/recheck/`, the id list in `results/recheck/created.txt`. The first run's id list was renamed `results/created_d47_first.txt`.
- **Concurrent suite:** active throughout. It added tanks such as `[TEST-TEMP] FV4 132r2o`, planned batches that renumbered seed P-numbers, and once re-rendered rows in the middle of one of my drags.

## Verdict

**All 3 must-fix issues and all 9 minor findings are FIXED, and obs. 3 is fixed too.** The drag hint works for bars, dots and CIP blocks: dates, tanks, Unassigned, outside the chart, out of service, overlap and out of order. I found **7 new minor issues**, listed below. None is must-fix. The closest is N1, a check-off prompt that announces seed renumbering that doesn't happen.

## Re-test of my findings

| Finding | Result | Evidence |
|---|---|---|
| **M1** typing a date | **FIXED** | Details below. `m1_after_typing.png`, `m1_prompt.png`, `m1_step_moveto_*.png`, `m1_cip_typed.png`, `m1_outage_typed.png` |
| **M2** `#40` | **FIXED** | Details below. `m2_hash40_checkoff.png`, `m2_hash40_result.png`, `m2_batch_dialog.png` |
| **M3** early full Package | **FIXED** (with N4 below) | Details below. `m3_after_row.png`, `m3_overlap_check.png` |
| 1 too-big sign-off | **FIXED** | Signed off "P5 (30 bbl) is bigger than QR2" with a note, then dragged the bar +1 day (`POST /batches/59/shift {days:1}`). The signature went from `5e91…` to `8d5f…`, and the flag shows "Was signed off by Jake Brewer, but something changed since." `minor1_p56_reopened.png` |
| 2 Unassigned header | **FIXED** | The label cell is sticky (z 7) with an opaque background `rgb(225,232,215)`. Nothing draws through it. `minor2_unassigned.png` |
| 3 empty spot → Mark out of service | **FIXED** | Tapped QR3 on Mon Nov 23: From and To prefill 2026-11-23. `minor3_prefill.png` |
| 4 double-click Apply | **FIXED** | Positioned so my P5 bar sat under Apply, then double-clicked. One `answer` request, no batch dialog, no menu. `minor4_dbl_apply.png` |
| 5 drop outside the chart | **FIXED** | Released over the tank column, below the chart (legend), on the date header, past the right edge and on the toolbar. Each time the hint said "Release over the chart to move", no request was sent and the batch didn't move. `minor5_over_column.png`, `hint_edge_*.png` |
| 6 names-only | **FIXED** | Hovering a cut-off name shows a tooltip, e.g. "[TEST-TEMP] QR3 · Sani 0 days". `minor6_names_only_tooltip.png` |
| 7 API range | **FIXED** | `from=to` and 6-day ranges → 422 `range_invalid`. 7 days → 200; 730 → 200; 731 → 422. Reversed or invalid → 422. The UI agrees on every boundary. |
| 8 Remove-Transfer warning | **FIXED** (see note) | Two transfers, removing transfer 1: "…The CIP & Sanitize it added goes too. **After transfer 1 depends on it.**" plus "The template becomes incomplete" with the issues. Single transfer: the same. Note below. `minor8_two_transfers.png`, `minor8_single_transfer.png` |
| 9 small things | **FIXED** | Details below. |
| obs. 3 done CIP during a stay | **FIXED** | A done standalone CIP in QR4 today while #R61 was fermenting raised "A CIP & Sanitize in [TEST-TEMP] QR4 on Oct 21 while [TEST-TEMP] QA Recheck #R61 is in it." `obs3_done_cip_with_beer.png` |

**M1, typing a date.** I typed `12202026` into the batch dialog's date for step 765 (Set temp - 32°, Dec 15).
- **While typing:** no request and no prompt. The intermediate values (01-15, 12-02, 0002-12-20…) are ignored.
- **On blur:** one preview, `{"ids":[765],"days":5}`, and one prompt: "moved 5 days later · now Sun Dec 20".
- **Enter:** commits the same way (step 764 → +2 days).
- **Step dialog, "Or move to":** Move stays disabled until Enter or blur, then gives one prompt for Dec 20. "Done on" sends nothing while typing.
- **CIP dialog and out of service:** nothing happens until blur. The "Planned in QR2 then: …" warning appears only after blur.
- **Not tested:** "pick a day" from the native calendar, because Chromium's picker can't be driven headless.

**M2, `#40`.**
- **Brew-day check-off with `#40`:** the UI sends `"40"` and gets "#40 is already Galactic #40."
- **API check-off:** `#40`, `" # 40 "` and `##40` all return 422 `batch_number_taken`.
- **Batch dialog:** `#40` and `"  # 42 "` are refused ("#42 is already Crusher #42."). `"#R60b  "` is saved as `R60b`, with label `[TEST-TEMP] QA Recheck #R60b` (a single `#`).
- **PATCH `/batches/:id`:** `#40` and `" ## 41"` → 422.
- **Note:** `#4 0` is accepted as `4 0`. An inner space isn't normalised, so it isn't a duplicate of 40. That's harmless, but you may want to refuse it.

**M3, early full Package.** Batch 60 was brewed Sep 28. I checked off its Package as done Oct 18, 5 days early, with Move all.
- **Flag:** "Package is before Carb, the step it follows." This matches the prompt's "They'll be flagged."
- **Bar:** it ends at the Package plus its CIP, on Oct 18.
- **Leftover steps:** Set temp 32° and Carb show as red dots labelled "after the tank was emptied".
- **Tank status:** "Empty · dirty 3 days". After the CIP was done: "Sani 0 days".
- **Leftover CIP:** batch 61 was packaged with Move only, and its leftover CIP moved to Nov 28. With a planned batch in the same tank from Nov 24, there was **no "Tank overlap"**.

**Minor 9, small things.**
- **Number field:** shows the trimmed `R60b`.
- **Plan dialog:** a double-clicked Save sent one POST and showed one "P6 planned" snackbar.
- **Check-off snackbar:** now says "Brew day done · 12 following steps moved 59 days earlier. … is #R60."

**Note on 8:** the dependent-tank sentence and the issue list load about 100 ms after the dialog opens, and **Remove is already clickable before they arrive**. On my first try, under concurrent-suite load, the dialog stayed on the bare text ("Remove Transfer? The steps it linked stay linked through it. The CIP & Sanitize it added goes too.") for at least 800 ms. Consider disabling Remove until the preview is back. Also, with two transfers it names only "After transfer 1", not the tank after transfer 2 that is reached through it.

## The drag hint (new)

These cases were checked with mouse drags on my own data. Over seeded tanks I only hovered and pressed Escape; nothing was dropped.

| Drag | Hint | OK |
|---|---|---|
| Bar sideways +8 days, clear of the outage | "Fri Dec 4 · +8 days" (dark) | ✓ |
| Bar sideways into my QR2 outage | "Mon Nov 30 · +4 days · [TEST-TEMP] QR2 is out of service Dec 1–3" (red) | ✓ |
| Bar vertical → QR1 / FV6 / FV7 / FV5 | "→ [TEST-TEMP] QR1", "→ FV6"… (dark) | ✓ |
| Bar vertical → QR2 (out of service) | "→ [TEST-TEMP] QR2 · [TEST-TEMP] QR2 is out of service Dec 1–3" (red) | ✓ |
| Bar vertical → QR2 onto my other batch | "→ [TEST-TEMP] QR2 · overlaps [TEST-TEMP] QA Recheck P5 in [TEST-TEMP] QR2" (red) | ✓ |
| Bar → Unassigned | "→ Unassigned" | ✓ |
| Bar over the tank column, legend, header, toolbar or past the right edge | "Release over the chart to move" (red); release does nothing | ✓ |
| Dot −3 days before its predecessor | "Mon Dec 14 · −3 days · before Set temp - 38°, the step it follows" (red) | ✓ |
| Dot +2 days | "Sat Dec 19 · +2 days · Move only: after Conditioning, which follows it" (red) | ✓ |
| Dot onto the outage days | "Wed Dec 2 · −1 day · [TEST-TEMP] QR2 is out of service Dec 1–3" (red) | ✓ (see N6) |
| CIP block ±days | "Mon Dec 7 · +2 days", "Tue Dec 1 · −4 days" | ✓ (see N5) |
| Escape during a drag | Hint gone, no request, nothing moves | ✓ |

Screenshots: `hint_*.png`.

## New issues (all minor)

- **N1. The brew-day check-off prompt announces seed renumbering that doesn't happen.**
  - **Path:** check off Brew day of a planned batch (P6, brewing Nov 26) with Done on Sep 28.
  - **Observed:** the prompt says "Batch numbers updated: [TEST-TEMP] QA Recheck P6 → P1, Altruism P1 → P2, Enos P2 → P3, Enos P3 → P4, … P4 → P5, … P5 → P6." The preview treats the batch as still planned at the new date. After Apply, the real result was only "Batch numbers updated: [TEST-TEMP] QA Recheck P7 → P6", which is correct.
  - **Why it matters:** a brewer would read this as "checking off renumbers everyone's planned batches".
  - **Evidence:** `m2_r60_prompt.png`. The preview request was `POST /steps/783/complete {"done_on":"2026-09-28","preview":true}`.
- **N2. The bar's hover tooltip covers the drag hint.**
  - **Observed:** while dragging a bar, the hover tooltip ("[TEST-TEMP] QA Recheck P4 · planned · Tue Nov 24 – Mon Dec 21") stays up and sits over the start of the drag hint. That hides the key part, the date and "+2 days", or "→ [TEST-TEMP] QR2". Only the end ("…overlaps … in QR4") is readable.
  - **Fix:** suppress the hover tooltip during a drag.
  - **Evidence:** `hint_plus2.png`, `hint_overlap_QR2.png`.
- **N3. The drag hint is clipped at the right edge of the window.** Dragging a bar on the right side of the chart puts the hint past the viewport, and it's cut off at "…overlaps [TEST-TEMP] QA Recheck P5 in [T". Keep it inside the viewport. Evidence: `hint_overlap_QR2.png`.
- **N4. A completed batch's leftover CIP is handled inconsistently.**
  - **Setup:** completed #R61, with its leftover planned CIP on Nov 28 in QR4. Planned P4 in QR4 from Nov 24.
  - **Correct:** the server gives no Tank overlap.
  - **Drag hint:** while dragging P4 it says "overlaps [TEST-TEMP] QA Recheck #R61 in [TEST-TEMP] QR4" (red), for a position the server does not flag.
  - **No flag for a CIP inside another batch's stay:** the leftover CIP falls inside P4's stay and raises no "CIP while beer is in the tank". A standalone planned CIP in the same situation does (`cip_with_beer:cip809:58.0`).
  - **Drawing:** the grey "waiting for CIP" band of #R61 runs to Nov 28 and P4 is drawn in a second lane, so it looks like an overlap.
  - **Ask:** decide what a completed batch's leftover CIP means, and make the hint, the flags and the drawing agree.
  - **Evidence:** `m3_leftover_cip_overlap.png`, `m3_overlap_check.png`, `hint_plus2.png`.
- **N5. After Escape cancels a drag, the next drag of a CIP block does nothing.**
  - **Observed:** after any Escape-cancelled drag (a CIP or a dot), the next drag on CIP block 809 shows no hint, and releasing it sends no request and opens nothing. The attempt after that works.
  - **Reproduced** three times, as the sequences "CIP ok → Esc → CIP dead → CIP ok" and "dot → Esc → CIP dead". Bars and dots are not affected.
- **N6. A dot's out-of-service hint only considers the dot's own day.**
  - **Observed:** dragging PDH of a batch whose stay covers the QR2 outage is red only when the dot itself lands on Dec 1–3. At +1 day (Dec 4) or −6 days (Nov 27) the hint is dark, although the batch is still in QR2 during the outage and the flag stays.
  - **Ask:** either intended (only new problems are red) or the hint should reflect the part's stay.
- **N7. A drag that ends where it started opens the batch dialog.** Dragging a bar away and back to its start, then releasing, opens the batch dialog like a click. A user who changed their mind expects nothing to happen. Escape works as the cancel. Evidence: `hint_return_origin_dialog.png`.

## Observations
- **The seeded signed-off flag shows as reopened:** "Enos P2 (35 bbl) is bigger than FV1 (30 bbl). Was signed off by Jake Brewer, but something changed since." I never touched Enos P2.
  - Early in my run, a check-off/un-check API test on my batch 59 left it planned on today's date for about 1 minute. During that minute, Altruism P1→P2, Enos P2→P3 and Enos P3→P4 were renumbered. I shifted it back +35 days, and the numbering returned to P1/P2/P3.
  - If the new too-big signature includes anything that changed then, that may have reopened the seed sign-off. The concurrent suite may also have changed it. Please check whether the seed's stored signature matches the new signature formula.
- **QR4 reads "Sani 0 days" after its Package was done the same day as a done standalone CIP** that had been recorded while the beer was in. Same-day ordering is ambiguous. Arguably that CIP shouldn't count as cleaning after the exit, since its own flag said the beer was in.
- **Duplicate on the template list** makes "Copy of [SEED] Lager with transfer" at once, with no confirmation or name prompt. I renamed mine to `[TEST-TEMP] QA RC transfer` (id 101) and retired it.
- **Plan dialog:** once, "Ferment in" showed **FV7** after I picked `[TEST-TEMP] QR1`, while the suite was adding tanks. Nothing was sent (Save sent no request), I cancelled, and I could not reproduce it. Possibly the open tank list re-rendered under the click.
- **The out-of-service dialog keeps its length** when From changes: typing From = Dec 1 moved "Last day out" from Oct 23 to Dec 3. That's useful.

## Not tested
- The native date picker "pick a day" path, because it can't be driven headless.
- The drag hint in dark mode and at phone width.
- Touch long-press.

## Data I created, and cleanup
All of these were created by me, and only these ids were removed:
- **Brand 36**, `[TEST-TEMP] QA Recheck`: deleted (204).
- **Tanks 93–96**, `[TEST-TEMP] QR1–QR4`: retired (200).
- **Template 101**, made by Duplicate of seed 76 and renamed `[TEST-TEMP] QA RC transfer`: retired (`retired_at` set). Seed templates 74–76 are untouched.
- **Batches 58, 59, 60, 61 and 101:**
  - Batch 60: un-checked 795 (CIP), 794 (Package) and 783 (Brew day) first, then deleted.
  - Batch 61: un-checked 807 (Package) and 796 (Brew day) first, then deleted.
  - Batches 58, 59 and 101: deleted.
  - All returned 200.
- **Standalone CIPs 809** (planned) **and 810** (done): deleted.
- **Outage 52** (QR2, Dec 1–3): deleted.

**Check after cleanup:** planned batches are Altruism P1, Enos P2 and Enos P3. Tanks are FV1–FV7 and Serving 1–2. None of my ids remain.

**Seed side effects:**
- The 1-minute renumbering described above.
- Two windows of a few seconds each during cleanup, while an un-checked past brew day existed before its delete.
- No seed batch or seeded tank was moved, checked off, signed off, planned into or edited. Hovers over FV5–FV7 were cancelled with Escape.

No credential beyond the provided personas was needed.
