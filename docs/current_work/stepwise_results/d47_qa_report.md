# D47 QA report: Rockcut Production Gantt (DEV)

- **Build:** D47 @ `6e1c5ac`. Only DEV was used: https://rockcut-ui-dev.fly.dev and https://rockcut-api-dev.fly.dev.
- **Date:** 2026-10-21 (America/Denver). Tester: independent QA (Claude), running Chromium through Playwright 1.63 with timezone America/Denver.
- **Personas:** `brewer1` for most of the run. Also `brewer2` (concurrency), and `owner`, `floater`, `breweryMgr`, `bartender1`, `barMgr`, `office1`, `noDept`, `breweryDevice` and `taproomDevice` (access checks). No persona was signed out, changed or demoted. No token was printed, logged or screenshotted, and every API call ran from inside the page.
- **Scripts and evidence:** the helpers are `scripts/lib.mjs` and `scripts/driver.mjs`, a single long-lived browser closed at the end of the run. Logs are in `results/` and screenshots in `shots/`.
- **Concurrent suite:** the automated suite was active the whole time. During the run, Enos P2 was brewed as #44 and Altruism P1 as #45, and suite batches such as `[TEST-TEMP] Enos mviefazc5xb7` appeared. Some P-numbers below shifted because of this.

## Verdict

**Not ready to accept as is: 3 must-fix issues and 9 minor ones.** Most of the D47 scenarios pass. Planning, P-numbers, the move prompt, bar drags, check-offs, the batch-number rules (with one gap), dialogs, flags, CIP, out of service, Undo, access, dark mode, phone width, keyboard and performance all work.

## Must-fix

### M1. Typing a date in the batch dialog opens the move prompt mid-typing with the wrong date
- **Path:** Batch dialog (click a bar), then a step's date field. Click the month part and type `12152026` on the keyboard.
- **Expected:** the date is entered as Dec 15 and one prompt opens for that date. At most, the prompt opens on blur or Enter.
- **Observed:** the first keystroke already makes a valid date (month `1` gives 2026-**01**-05). The prompt opens at once: "Set temp - 32° moved **334 days earlier** … now Mon Jan 5", with Move all as the default and every following step listed in January. The prompt takes focus, so the rest of the keystrokes are lost. Typing `12…` from the day or year part does the same thing with other wrong dates.
- **Repro:** P29 setup. Batch 8, step 107 (Set temp - 32°, Dec 5): click the left edge of the date input and type `12152026`. The UI sent `POST /steps/move {"ids":[107],"days":-334,"preview":true}`. I pressed Undo, so nothing was applied.
- **Why it matters:** keyboard date entry is a normal path, and one wrong Apply moves a batch by nearly a year.
- **Evidence:** `shots/bug_date_typing.png`.

### M2. A batch number with a leading `#` gets around the duplicate check
- **Path:** Check off brew day of a planned batch, enter `#40`, Check off. The same happens through the API with `{"batch_number":"#qa44b"}`.
- **Expected:** refused with "#40 is already Galactic #40." The refusal message itself shows numbers with a `#`, so users will naturally type one.
- **Observed:** accepted. The batch is labelled `[TEST-TEMP] QA Lager ##40` and now duplicates Galactic #40. The same happened with `#qa44b` against an existing `QA44b`. A plain `40`, `42` or `qa44B` is correctly refused, case-insensitively. The helper text calls `#40` "Not a plain number", so the `#` is treated as part of the number.
- **Repro:** batch 11 brew day (step 140) took `#40` and got label `##40`. Batch 50 brew day (step 645) got `200` back for `#qa44b`. Both were renumbered or un-checked afterwards.
- **Evidence:** `shots/p37_hash40.png`, `results/` driver output.

### M3. A full Package checked off early leaves the batch drawn past the empty tank, and the out-of-order steps the prompt promised to flag are not flagged
- **Path:** Brewed batch (Q4), then check off **Package** (Full) 7 days early. The prompt says: "Move all following steps … Some of them would then come before the step they follow. **They'll be flagged.**" Apply.
- **Expected:** the batch is completed and the tank emptied (this part works: "Empty · dirty 0 days"). The steps left undone (Set temp 48/38/32°, Conditioning, Carb, all *before* Package in the template and now dated after it) are flagged, or dropped or closed.
- **Observed:** there are no flags (`flags` for the batch is `[]`). The completed batch's bar keeps drawing Packaging, Conditioning and Carbonating segments from Oct 22 to Oct 26, with planned dots, in a tank whose status reads "Empty · dirty 0 days" (later "Sani 0 days"). Related: on batch 19, a completed batch's leftover planned CIP step kept a "Tank overlap" flag alive against the next planned batch, even after a done CIP was recorded in that tank.
- **Evidence:** `shots/full_package_done.png`, `shots/dark_expanded.png`, `shots/p35_prompt.png`.

## Minor

1. **Moving a "Batch bigger than tank" sign-off's batch does not reopen it (P56).**
   - **Path:** Flags → my "P4 (30 bbl) is bigger than Q3" → note → Mark OK. Then drag the bar 1 day.
   - **Expected:** "Was signed off by …, but something changed since." per the brief, since its dates changed.
   - **Observed:** it stays signed off (signature `1fdc1ab7…` unchanged).
   - **Volume and step-order changes do reopen correctly:** changing the volume to 25 bbl reopened it, and moving batch 8 reopened its signed-off "Steps out of order" flag.
   - **Repro:** the too-big signature ignores dates. If that is by design, the brief and spec need updating. If not, it is must-fix for P56.
   - **Evidence:** `shots/p56_reopened.png` (still signed off), `shots/p56_volume_change.png`.
2. **The Unassigned row's label column is see-through.** When the chart is scrolled sideways, gridlines, weekend shading, bars and dots draw over "Unassigned / N parts with no tank". The tank rows are opaque. Evidence: `shots/bug_unassigned_header.png`, `shots/p25_prompt.png`, `shots/phone_prompt.png`.
3. **The empty-spot menu's "Mark out of service" ignores the day that was tapped.** Tapping Q3 on Sun Nov 1 or Wed Oct 28 always prefills From = today (Oct 21) and To = today+2. "Plan a batch" and "Add CIP & Sanitize" from the same menu do prefill the tapped day.
4. **Double-clicking Apply in the move prompt clicks through.** Only one move is sent, which is correct, but the second click lands on the bar under the closed prompt and opens the batch dialog. Double-clicking Save in Plan batch and Check off was fine, with one request each. Evidence: `shots/dbl_apply_after.png`.
5. **Dropping a dragged bar over the tank-name column still moves it.**
   - **Path:** drag a planned bar (Unassigned, Nov 5) left past the chart edge and release over the tank column.
   - **Observed:** "every step 39 days earlier". The batch landed on Sep 27, before the visible range, so the user can't see where it went. There is no warning that a planned brew day is now in the past.
   - **Expected:** clamp the drop to the visible chart, or cancel it.
6. **Names-only («) cuts long tank names with no tooltip.** All four `[TEST-TEMP] Q1…Q4` tanks show as "[TEST-TE…" and can't be told apart. Tank names can be 30 characters. Evidence: `shots/p48_after_reload.png`.
7. **The API and the UI disagree on the range limits.**
   - **UI:** correctly refuses 731 days and anything under 7 days ("Pick a range of 7 to 730 days.").
   - **API:** `GET /schedule` accepts 1-day ranges (`from=to`) and 2026-10-01 to 2028-09-30, which is 731 days inclusive.
   - **Refused correctly:** reversed or invalid dates get 422.
8. **"Removing a Transfer warns which later tanks depend on it": the warning doesn't name them.** It says "The tanks after this transfer depend on it." It should name the tank, here "After transfer 2".
9. **Small things:**
   - After a batch number with spaces is saved, the field still shows `  QA44b  `. The saved value is trimmed (`#QA44b`).
   - When a plan was saved once, two identical "P3 planned / UNDO" snackbars showed. I saw this once and could not reproduce it.
   - When a check-off moves following steps, the snackbar says only "FDH done." and doesn't mention the steps it moved. The drag version does: "…with 8 following steps".

## Observations (not filed as bugs)
- **Step names changed during the run.** "Primary Dry Hop / Final Dry Hop" turned into "PDH / FDH" (subtitle "Final Dry Hop") on my existing batches, most likely because the suite edited a step type. If renaming a step type is meant to rename steps already copied into batches, fine. Otherwise it conflicts with "editing a template never changes existing batches".
- **Templates are "complete" with a Split that has no parts.** A template with only Brew day and Split - Filter in the first tank showed no Incomplete banner. The tank picker offers only "First tank" for a Split.
- **Un-checking a full Package after a CIP is recorded puts the beer back in a tank marked clean,** and no "CIP while beer in tank" flag appears for that already-done CIP.

## Scenario results

| # | Result | Notes |
|---|---|---|
| P20 | Pass | Rows in display order + Unassigned; today line; status lines. The 6 WKS zoom shows 6 weeks over a 12-week loaded range. |
| P21 | Pass | `[TEST-TEMP] QA Lager P3` faded with a dashed outline in Q1; persists after reload. |
| P22 | Pass | Bar in Q2, "after transfer" bar in Unassigned, dashed green arrow (`#2F5A20`). |
| P23 | Pass | Two batches on Nov 16: the first planned got P5, the second P6. |
| P24 | Pass | "Brew day - 1 of 2" and "Brew day - 2 of 2". Planning an earlier batch listed every renumbering in the message. |
| P25–P28 | Pass | Default follows the link (Move all; Move only on Carb→Package). Moved dates listed. "Steps out of order" after Move only. Undo in the prompt sends only a preview and changes nothing. |
| P29 | Pass with M1 | Same prompt; the batch dialog stays. Keyboard typing is broken (M1). |
| P30–P33 | Pass | Sideways drag shifts every step with no prompt (P-numbers update). Vertical drag changes only that part's tank, to Q1 and back to Unassigned. "has no tank and fills Fri Oct 23" for a batch 2 days out. That near-term batch shifted the seed Enos P2→P3, so I deleted it at once (P60) and Enos went back to P2. |
| P35 | Pass | FDH due Oct 18, checked off Oct 21: it moved to today and the prompt listed the following steps. |
| P36–P38 | Pass with M2 | Suggests 44. "40" refused ("#40 is already Galactic #40."), and the refusal is atomic. Non-numbers accepted with "Not a plain number; the next suggestion still counts from #43." Limited to 20 characters (`maxlength`). Blank or spaces refused. Mark not done → "planned again; its number is freed". |
| P39 | Pass | `422 batch_number_required` with no body, `""` or `"   "`. |
| P40 | Pass | Number changed to `QA44b` (trimmed); `42` refused with "#42 is already Crusher #42." |
| P41–P45 | Pass | "Set temp - 52° - QA crash" shows on the dot, the expanded row and the batch dialog. "RW" initials. Notes (HTML shown as text) kept. Batch dialog "+ Note" → "Note ✎". The assignee list holds Brewery members. |
| P46–P48 | Pass | Expand (step rows with diamonds, solid and dashed links), «, 12 WKS, ‹ 4 wks (−28 days on both ends), From/To. All remembered after reload (localStorage keys are per user id). |
| P49–P51 | Pass | FV4 "Day 18 · Fermentation · 68° · set to 58° today". FV5 "Day 22 · Crash · 38° · 32° change late" in red. Serving 1 "Empty · dirty 8 days · no CIP planned" in red. |
| P52 | Pass | Already-done CIP → "Sani 0 days"; the "fills … before it's cleaned" flag cleared. |
| P53–P54 | Pass | "Tank overlap" + "Filling a dirty tank" (Q1); "(30 bbl) is bigger than Q3 (20 bbl)". |
| P55–P57 | Pass except P56 | Mark OK with a note shows "Signed off by Jake Brewer · Wed, Oct 21 · "note"". The P56 date move fails (Minor 1). Remove sign-off reopens. |
| P58–P59 | Pass | "A CIP & Sanitize in Q4 on Oct 23 while … is in it." The standalone CIP drags with no prompt; Undo restores it. |
| P60 | Pass | Confirm → deleted; the message lists the renumbering. |
| P61 | Pass | brewer1 (+2 days) and brewer2 (+1 day) applied together: both 200 and cumulative (+3). The other screen picks up an outside change in ~30 s. Undo after brewer2 changed the same step → 409 "Something changed since. Nothing was undone." Undo after 125 s → 422 "It's too late to undo that." |
| P62–P64 | Pass | owner, floater and breweryMgr: Gantt + 200. bartender1, barMgr, office1 and noDept: no Brewery nav, `/brewery/production` → `/`, API 403 on GET and POST. breweryDevice and taproomDevice: 403 "Not available on a shared device" with an in-page message, as expected before D49. |
| P109, P111 | Pass | "Split - Filter" and "Package - Partial" names shown. A partial isn't an exit (banner stays). No banner once the full Package is present. Transfers kept in day order. The ramp cap message is right. |
| P112 | Pass | Partial Package done: the tank still shows the batch ("Day 0 · Packaging"), with no dirty flag. |
| P6–P10 | Pass, with Minor 3 | ⋯ panel → Mark out of service. The dialog names what's planned ("It will be flagged; nothing is moved"). Hatched band, "OUT NOV 14–16" tag, flag on the planned batch. Band click → edit. Back in service today. Delete + Undo. |
| Set temp done | Pass | Status line went to "Day 16 · Crash · 52°". |
| Full Package done | Pass with M3 | Batch completed, tank "Empty · dirty 0 days". |

**Edge cases:**
- **Volume:** 0, −3, −5, 1e9, 99999 and 10000 are refused with "Enter a volume more than 0 and under 10,000 bbl." (the plan dialog refuses before sending).
- **Double-clicks:** single request each (see Minor 4).
- **Drags across the today line:** fine, and flagged as out of order.

**Phone, dark mode and keyboard:**
- **Phone width:** no horizontal page scroll. The Plan, Batch, prompt and Flags dialogs all fit at 412 px.
- **Dark mode:** bars, status lines, prompts, step dialog and Flags list are all readable. Planned batches look only slightly faded in dark mode.
- **Keyboard:** dots, bars, bands and CIP blocks have `tabindex=0`. Enter opens the dialog, and Escape closes it with focus back on the dot.

## LIMITATIONS checks
- **Performance:** `GET /api/production/schedule` over 12 weeks, timed 10 times from inside the page: median **56 ms**, max 85 ms (target < 300 ms). A move round trip through the UI took 122 ms; through the API, 41–46 ms (target < 500 ms). **Pass.**
- **Dark mode:** see above. The theme was put back to Light afterwards.
- **Touch long-press:** not tested, as the brief asks.

## Data I created, and cleanup
I created all of the following and removed only these ids:
- **Brand 8**, `[TEST-TEMP] QA Lager`: deleted.
- **Tanks 42–45**, `[TEST-TEMP] Q1–Q4`: retired.
- **Template 49**, `[TEST-TEMP] QA partial`: retired.
- **Batches 8, 9, 10, 11, 12, 13, 19 and 50:** brewed steps were un-checked first (batch 11: steps 151, 145, 144 and 140; batch 19: 250, 249 and 248; batch 50: 645), then all were deleted. Batch 13 was deleted during the test.
- **Standalone CIPs 643, 644 and 658:** deleted.
- **Outage 48** (Q2): deleted. **Outage 49** (Q3) was removed by "Back in service today".

None of these ids is left. No `[SEED]` batch or seeded tank was moved, checked off, signed off, planned into or edited. Two side effects reached the seed: my planned batches temporarily renumbered seed P-numbers (Enos P2/P5), which is inherent to brew-day ordering, and a 2-minute window where a near-term test batch made Enos "P3". Both were reverted by deleting my batches. No credential beyond the provided personas was needed.
