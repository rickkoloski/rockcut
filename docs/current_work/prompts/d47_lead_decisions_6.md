# D47 lead decisions 6: last leftovers (fix cycle 3, Matt-approved), 2026-10-21

**Inputs:**
- QA recheck 2, `stepwise_results/d47_qa_recheck2.md` (DEV, `143db36`): N1–N5, N7 and note 8 are FIXED.
- DEV run 3: **496 passed, 0 failed.**
- Both budgeted fix cycles are used. Matt approved this small third one.

Commit as `fix: D47 fix cycle 3 (…)`, with tests. Run the targeted production specs, then `LEAD: run` and stop.

1. **Flag signatures must be the same on every node.** Lead finding on DEV:
   - The `too_big` signature computed in a fresh `bin/rockcut_api eval` node (the seed) is `7a009f15…`. The running server gives `475316b6…` for the same rows (FV1 30, batch 108 at 35, dates unchanged).
   - Cause: `Flags.signature/1` hashes `:erlang.term_to_binary(term)`, whose bytes aren't guaranteed to be the same across nodes or OTP versions.
   - **Fix:** build a canonical string from the signature's parts (ids, dates as ISO strings, decimals normalised with `Decimal.normalize |> Decimal.to_string(:normal)` so 30 and 30.0 agree), join them with `|`, and hash that. Do it for **every** flag kind.
   - **Tests:** ExUnit checks that a signature is identical for equal values given in different forms (`Decimal.new("30")` vs `Decimal.new("30.0")`, the same `Date` built two ways). Also check that the seeded sign-off reads as signed off.
   - Existing sign-offs on DEV get new signatures; the reseed restores the seed's.
2. **N6, the fill (brew-day) dot.** When a fill or exit dot is dragged, the hint checks the stay **as the default answer would leave it**. With "Move all" as the default, that means the whole stay shifted. If the default is "Move only", it's the stay with only that step moved. Test it with the QA setup: an outage just after the stay, and the fill dragged +2 days → red, out of service.
3. **The Move-only reason is not an error.** A reason that applies only if the user picks the *non-default* answer is shown in the hint's **neutral** color, as a second line ("If you move only this step: after Lag, which follows it"), or left to the prompt. The hint is red only for problems with the default answer. Update the hint tests.
4. **Remove-Transfer button while loading:** `aria-label="Remove"` and `aria-busy="true"`.
