# D47 QA recheck 2: Rockcut Production Gantt (DEV, build `143db36`)

- **Target:** DEV only (https://rockcut-ui-dev.fly.dev, https://rockcut-api-dev.fly.dev). Date 2026-10-21, America/Denver. Chromium through Playwright 1.63, one browser, closed at the end.
- **Persona:** `brewer1` (Jake Brewer). The fresh auth files worked, with no 401s. No persona was changed. No token was printed, logged or screenshotted, and API calls ran from inside the page.
- **Evidence:** screenshots in `shots/recheck2/`, the id list in `results/recheck2/created.txt`.
- **Concurrent suite:** active throughout. It did not interfere with these tests.

## Verdict

- **FIXED (7):** N1, N2, N3, N4, N5, N7 and note 8.
- **Partly fixed:** N6. The exit dot is fixed, but a dragged **fill (brew-day) dot** doesn't warn about an outage that the default move causes.
- **NOT FIXED:** the seeded sign-off. It is reopened straight after the reseed, before I touched anything.

| Item | Result | Evidence |
|---|---|---|
| **N1** brew-day preview numbering | **FIXED** | Planned P4–P6 (my batches 109–111, Nov 24–26). I checked off P4's brew day, done Sep 28, with number R109. The preview said "Batch numbers updated: [TEST-TEMP] QA Recheck2 P5 → P4, [TEST-TEMP] QA Recheck2 P6 → P5." After Apply, the snackbar said the same, the seed P1–P3 were unchanged, and the batch became #R109. `n1_prompt.png`, `n1_after.png` |
| **N2** hover tooltip over the hint | **FIXED** | Details below. `n2n4_p1.png` |
| **N3** hint at the edges | **FIXED** | Details below. `n3_*.png`, `n3_700_*.png` |
| **N4** leftover CIP | **FIXED** | Details below. `n4_row.png` |
| **N5** CIP drag after Escape | **FIXED** | Escape-cancelled sequences: CIP, CIP, CIP, then a dot, then a CIP. Every drag showed its hint (e.g. "Sat Dec 12 · +2 days"). A CIP drag released straight after an Escape moved it (`steps/move {"ids":[1464],"days":2}`, "CIP & Sanitize moved 2 days later."). No stray dialogs. |
| **N6** dot out-of-service hint | **Partly fixed: NOT FIXED for the fill dot** | See the section below. `n6_*.png`, `n6_fill_prompt.png` |
| **N7** drag back to start | **FIXED** | Details below. |
| **Note 8** Remove-Transfer | **FIXED** (one accessibility point) | Details below. `note8_loading.png`, `note8_loaded.png` |
| **Obs.** seeded sign-off | **NOT FIXED** | See below. `seed_signoff.png` |

**N2, hover tooltip.**
- **Before the drag:** hovering a bar shows its tooltip.
- **During the drag:** no visible tooltip; only the hint ("Thu Nov 26 · +1 day").
- **After a real drop:** a 3 px pointer move brings the tooltip back with the new dates ("planned · Thu Nov 26 – Mon Dec …"). Leaving and re-entering also works.

**N3, hint at the edges.**
- **Right edge:** with the pointer at x=1565, the hint flips to its left (box 1411–1551).
- **Window bottom:** in a 700 px-high window, with the pointer at y=688, the hint flips above it (y 644–670).
- **Inside the window:** in every case, including bottom-right (1373–1566 × 644–670).
- **Near, but not at, the bottom:** in a 1000 px window with the pointer low on the Unassigned lane, the hint sits below the pointer, but still well inside the window.

**N4, leftover CIP.** Setup: batch 109 (brewed Sep 28) had its Package checked off today with Move only, and I moved its CIP to Dec 5. Then I put planned P4 (batch 110, Nov 25–Dec 20) into the same tank, QS1.
- **Flags:** "A CIP & Sanitize in [TEST-TEMP] QS1 on Dec 5 while [TEST-TEMP] QA Recheck2 P4 is in it." and "P4 fills QS1 before it's cleaned after #R109". There is no Tank overlap.
- **Drawing:** the QS1 row stays one lane, 54 px, the same as an empty row. The CIP is a small dot inside P4's stay, and #R109's bar ends at its exit.
- **Drag hint:** dragging P4 shows no overlap ("Thu Nov 26 · +1 day", dark).
- **CIP on the exit day:** batch 111's Package and its own CIP were both done today. QS3 reads "Sani 0 days", with no flag.

**N7, drag back to start.** Each release below sent no request and opened no dialog, and the batch didn't move:
- a bar dragged +6 days and back to its start;
- a bar dragged up two rows and back;
- +10 px and −11 px, which is under half a day (25 px per day).

Just over half a day (+14 px) moved it 1 day, as expected. A plain click still opens the batch dialog.

**Note 8, Remove-Transfer.** I used my own duplicate of the transfer template, with transfers to After transfer 1, 2 and 3, and removed transfer 1. With its preview delayed 3 s in my browser:
- **While loading:** the Remove button is disabled (`disabled=true`) with a spinner. Clicking it sent nothing and the step stayed.
- **Once loaded:** "…The CIP & Sanitize it added goes too. **After transfer 1, After transfer 2 and After transfer 3 depend on it.**" plus "The template becomes incomplete" with both issues.
- **Accessibility:** while loading, the button has no text and no `aria-label`, so a screen reader announces an unnamed button. Add `aria-label="Remove"` and `aria-busy`.

## N6: the fill dot doesn't warn about an outage its default move causes

I put my outage on QS1 for Dec 22–24, just after P4's stay (Nov 25–Dec 20, Package Dec 20). Every drag below was cancelled with Escape except the confirmation step.

| Drag | Hint | Expected |
|---|---|---|
| **Fill dot** (Brew day) +2 days | "Fri Nov 27 · +2 days · Move only: after Lag, which follows it" (red, for the Move-only reason only) | Should also say "QS1 is out of service Dec 22–24". With the default Move all, the stay becomes Nov 27–Dec 22. |
| Fill dot +4 / +6 | Same, no out-of-service | Same as above. |
| **Exit dot** (Package) +5 → Fri Dec 25 | "…QS1 is out of service Dec 22–24 · …" | ✓ The exit's own day is outside the outage, so the resulting stay is being checked. |
| Exit dot +2 / +3 | Out of service | ✓ |
| Other dot (Set temp 58°) +9 → Dec 22 | Out of service (own day) | ✓ |
| Other dot +6 → Dec 19 | No out-of-service | ✓ By the stated rule ("its own day"). |

**Confirmation:** I dropped the fill dot +2 days and applied the prompt's default, "Move all following steps 2 days later … Package → Tue Dec 22". The server then raised "[TEST-TEMP] QA Recheck2 P4 is in [TEST-TEMP] QS1 while it's out of service (Dec 22–Dec 24)." The hint had not warned about it. I put the batch back with a −2 day shift. A bar drag of +2 days does warn correctly ("Fri Nov 27 · +2 days · QS1 is out of service Dec 22–24").

**Side note:** every dot dragged more than a day later now turns red with a "Move only: after X, which follows it" reason, although Move only is not the default. Because almost every dot drag is red, red no longer signals a real problem. Consider showing the Move-only reason in a neutral colour, or only in the prompt.

## Seeded sign-off: still reopened
Right after the reseed, before I created anything, the Flags list shows "Enos P2 (35 bbl) is bigger than FV1 (30 bbl). **Was signed off by Jake Brewer, but something changed since.**"
- **API:** `signed_off:false`, `was_signed_off:true`. The sign-off has `signed_at 2026-10-21T21:10:52Z`, the reseed time, and the note "We'll top up FV1 from the second turn."
- **Signature:** the current one is `475316b63c192ba7`, identical to the previous build's.
- **Seed data unchanged:** Enos P2 has the seed values (35 bbl, brew Oct 30, FV1 then an unassigned part).
- **Same at the end** of my run.

Read only: I did not sign it off or change it. The seed's stored sign-off signature still doesn't match the current formula.

## Data I created, and cleanup
Only these ids, all mine, were removed:
- **Brand 70**, `[TEST-TEMP] QA Recheck2`: deleted (204).
- **Tanks 170–173**, `[TEST-TEMP] QS1–QS4`: retired.
- **Template 105**, Duplicate of the seed transfer template, renamed `[TEST-TEMP] QA RC2 transfer`: retired. The seed templates are untouched.
- **Batches 109, 110 and 111:**
  - Batch 109: un-checked Package 1436, then Brew day 1425.
  - Batch 111: un-checked CIP 1463, Package 1462, then Brew day 1451.
  - Then all three were deleted.
- **Standalone CIP 1464:** deleted.
- **Outage 71** (QS1, Dec 22–24): deleted.

**After cleanup:** planned batches are Altruism P1, Enos P2 and Enos P3. Tanks are FV1–FV7 and Serving 1–2. None of my ids remain.

**Seed side effects:** none. No seed batch or seeded tank was moved, checked off, signed off, planned into or edited. Because batch 109 was brewed with a past date, un-checking it before its delete left a past planned brew day for about a second. No credential beyond the personas was needed.
