# D48 lead decisions 2: DEV gate findings (fix cycle 1), 2026-10-22

**Inputs:**
- The QA report, `stepwise_results/d48_qa_report.md` (DEV, `4fce188`): 3 must-fix, 9 minor.
- DEV run 1: **516 passed, 0 failed.**
- Matt on the Pixel:
  - P87 long-press selection works;
  - **touch auto-scroll doesn't scroll down** (left, right and up work).

Fix everything below, with tests at the level each fix lives. Commit as `fix: D48 DEV QA fix cycle 1 (…)`. Run the targeted production specs, then `LEAD: run` the full suites.

## Must-fix

1. **No changes dated before the beer exists, or after it's gone.** One rule, enforced in the API and reflected in every dialog default:
   - **A transfer or filter** must fall after its vessel's fill (Brew day for the first tank, the previous transfer for later ones) and before that vessel's exit. 422 `before_fill` / `after_exit` ("The beer isn't in that tank on that day.").
   - **Add step and Add a ramp** must fall on or after brew day (`before_brew_day`).
   - **Split** must fall after brew day and before the vessel's exit. Give it a clear message ("The split has to be after brew day.") in place of "Pick the day." (minor 12).
   - **Defaults:** each dialog's day defaults to the first valid day on or after today. For a planned batch weeks out, that's brew day + 1 for steps. For a transfer or split, it's the first day after the current vessel's fill.
   - **Covers minors 4, 5 and 12.**
2. **A split parent can't be deleted while it's split.** Refuse with `split` ("Undo the split first."), in both the API and the UI: the Delete action is replaced by that note on a split parent. Parts already refuse delete; the UI hides Delete on parts too (minor 8). Also check that **Undo of a delete restores a batch with everything that hangs off it** (vessels, steps, links, and parts if a deletion ever includes them), so the 409 can't happen elsewhere. Add an ExUnit test that deletes a planned unsplit batch with vessels, links and a ramp, then undoes it.
3. **A transfer can't go into the tank the beer is already in.**
   - The Into picker leaves out the current vessel's tank (Unassigned stays allowed).
   - The API refuses with `same_tank` ("The beer is already in Q1C.").
   - **Split parts:** "(stays here)" is the only way to stay. An explicit pick of the current tank is refused too (QA saw this already refused; keep the test).

## Minor

- **6.** Lock a split parent's **volume** like its template and brand (`split`). In the UI, the field is read-only with "Undo the split first to change it".
- **7a.** The template-change message names dropped transfers: "Standard ale → Lager with transfer. Kept 1 added step; dropped the added transfer into Q1D."
- **7b.** Kept added steps **and kept ramps** are re-linked after the rebuild: each kept chain's first step comes after the latest rebuilt step on or before its date (move all). The ramp keeps its internal chain. No kept item may end up unlinked.
- **8.** The part dialog shows its P-number ("P5.2 · the real number is set when the parent's brew day is checked off") and has no Delete.
- **9.** The zoom button still shows the weeks on screen after a custom From/To. That's by design (zoom = how much fits across). Add a tooltip, "Weeks on screen", and clear the ✓ only when no zoom matches. **No other change.**
- **10.** Multi-batch moves: the prompt subtitle says "2 batches · 2 steps moved 1 day later", and the following steps are grouped under each batch's label.
- **11.** Keyboard multi-select: on a focused dot or diamond, **Ctrl/Cmd+Space** toggles it in the selection, and **Escape** clears an active selection (before closing anything else). Add a Playwright keyboard test.

## Touch auto-scroll down (Matt, Pixel)

- **Likely cause:** on a phone the chart's scroll box extends below the screen, so the 40 px bottom zone is off-screen.
- **Fix:** compute the edge zones against the **visible** part of the scroll box (its rect clipped to the viewport / `visualViewport`).
- **Also:** if the page itself can scroll, scroll the page when the grid has reached its own end.
- **Test:** Playwright at 412×915 with the grid taller than the screen. Drag a bar toward the bottom of the viewport, and the grid scrolls down. Matt rechecks on the Pixel.

## Note

QA saw the seeded Altruism #39.1's steps moved +11 days during its session, not by QA and not by the finished suite. It was most likely Matt's Pixel check. The reseed resets it. No action.
