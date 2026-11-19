# D61: lead decisions 2 (DEV QA fix cycle)

2026-11-19 · lead. Source: `~/src/rockcut-d61-devqa/results/d61_dev_qa_report.md` (DEV QA on
`b64784a`: D1–D6 pass, 181 checks; D7 open hunt found gaps 1–5), plus the builder's `LEAD:` note 1
from item 22. Same rules as before: every rule gets a refusal and an allowed case, ExUnit for API
changes, Playwright for UI changes, `[TEST-TEMP]` data only.

## Fixes

1. **Gaps 1 and 2 (must-fix): a stale save must not undo someone else's change.** Orders and
   contracts are saved whole, so a dialog opened before another person's save puts the old values
   back. Refuse it instead:
   - The order and contract JSON carry a version (`lock_version` integer column, or `updated_at`
     if you can make it reliable at second precision; prefer `lock_version`, additive migration,
     default 1). The Edit dialogs send it back on PUT.
   - The API compares it inside the update's transaction; a mismatch → **409** "Someone else changed
     this order since you opened it. Close and reopen it to see their change." (contract: "this
     contract"). Nothing is written. Missing version on PUT → 422 (the UI always sends it).
   - The dialog shows the message and keeps the person's input; the order/contract page refetches
     so reopening shows the current values.
   - Order **cancel** and **receive** also bump the version (and receive/cancel already refuse a
     non-open order), so an Edit dialog open across a receive or cancel gets the 409 above or the
     existing "already received / cancelled" message, whichever applies first.
   - ExUnit: two updates from the same version → second 409, row unchanged; update after a cancel
     → refused; contract lines and the price rows they write are not touched by a refused save.
     Playwright: two browsers editing one order and one contract (the QA repro).
2. **Gap 5 (should-fix): Cancel order's confirm.** A double tap must send one cancel. Use the same
   gate as FormDialog's Save (`SubmitGate`/busy) on the confirm button. If a cancel does come back
   409 "already cancelled" for an order this person just cancelled, treat it as done (close and
   refresh, no error). Check the other D61 confirm buttons (delete contract, any other confirm in
   Purchasing) for the same pattern. Playwright with `slow()`: one POST.
3. **Gap 3 (should-fix): Contracts Year picker.** It offers this year ±2 only, so a 2029 contract
   can't be reached. List **every year that has a contract, plus this year ±2**, sorted (the API
   can return the years, or the page derives them from a list call; your choice). The New contract
   dialog's Year box gets an inline check (whole year 2000–2100, the API's range) with Save
   disabled while it's wrong, instead of only the server's 422.
4. **Builder `LEAD:` 1 (item 22 follow-up): Save dropped while a dialog's lists load.** On a slow
   connection, Save in Edit maltster product (and Add lot, Grain lot, Ingredient, Ingredient lot,
   Offer) does nothing until the required selects' options have arrived: the browser's form check
   blocks it with no message. Decision: **keep Save disabled until the dialog's lists have loaded**
   (with the existing spinner/disabled look; no new message needed), in all six dialogs. Also add
   `noValidate` to FormDialog's `<form>` so a native required check can never silently swallow a
   submit again; the app's own checks give the messages. Playwright with the lists delayed
   (route delay): Save disabled, then enabled, then one PUT.

## Waiting on Matt

5. **Gap 4: a past-year contract's price.** The spec (A2) says "Jan 1 of the year, or today if
   later", which for 2025 means a row dated today; the build writes no row for a past year. Don't
   change this until Matt answers (lead decisions 3 or an addendum here).

## Done when

`mix test` green twice; `--warnings-as-errors` clean; vitest, `tsc`, `vite build` clean; lint 8;
the ingredients Playwright folder green twice. Commit (API and UI separately is fine), don't push,
reply with commits, counts and `LEAD:` notes. Don't run the full suite (the lead does, then DEV QA
rechecks).

## Matt's answer (2026-11-19)

5. **Gap 4 → 4a: keep the build.** A past-year contract writes no price row (spec amended). Keep the
   dialog's existing "<year> is over: saving changes no offer prices." (the spec now quotes it; don't
   reword it). Make sure an ExUnit test pins "past year → no price row" (add one if
   there isn't), and a Playwright check for the dialog line.

## Local gate after the fix cycle

mix 2,686 ×2, vitest 443, build clean, lint 8; Playwright 870 passed, **1 failed: D51 G5
(`brewery/brand-ranges.spec.ts:20`)**: Target ABV 1000 now reaches the API (a PUT goes out) because
FormDialog's `noValidate` turned off the browser's range check that D51 relies on first.

6. **Drop `noValidate` from FormDialog** (lead's call; it was my addition in item 4 and it's not
   needed: the six dialogs keep Save disabled until their lists load, which is the actual fix).
   Keep everything else from item 4. Check nothing else from the fix cycle depended on it (the D4
   test in `dev-qa-fixes.spec.ts`, any new test). Then: D51 G5 green, the ingredients folder once,
   vitest/tsc/build clean. Commit, don't push, reply.

## DEV QA recheck 1 (2237ed1): pass with gaps

Gaps 1–5 closed (`~/src/rockcut-d61-devqa/results/d61_dev_qa_recheck1.md`). New: gap 6 (below);
gaps 7 and 8 (Scheduler event/shift Delete has no confirm) are pre-D61 behaviour (D11/D32 dialogs,
untouched here), so they go to Matt as a backlog item, not this cycle.

7. **Gap 6 (should-fix): Edit contract's Save before its lists load.** Same as item 4: Save stays
   disabled until the Edit contract dialog's lists (`/api/parties`, the supplier's offers,
   `/api/ingredient_products`) have loaded. Then sweep **every D61 dialog** (orders, receive,
   contracts new/edit, To order's Start an order, product minimum, company order target) for the
   same pattern so this is the last one: any dialog whose Save can be pressed before the lists it
   needs have arrived. Playwright with delayed lists for Edit contract (extend D4 in
   `dev-qa-fixes.spec.ts`). vitest/tsc/build clean, lint 8, the ingredients folder green twice.
   Commit, don't push, reply with the commit and which dialogs you changed.
