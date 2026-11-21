# D65 lead decisions 3 — DEV QA fix cycle

2026-11-21 · lead → builder.

**Source:** `~/src/rockcut-d65-devqa/results/d65_dev_qa_report.md`. You may read it.

**DEV runs `15e9c12`.**
- DEV Playwright: 952 passed. One S123 failure (temporary-password timing) passed on rerun, and the
  47 `d58` tests it held back passed too.
- **DEV QA verdict:** fail, with 1 must-fix, 1 should-fix and 4 minor gaps.
- The seeded diff was 0.

**Rules:** the same as before. Each fix gets a test that fails without it, proved by revert where
it's practical. Don't push, and never run Playwright against DEV.

## Must-fix

**Gap 2: "Other manufacturer…" ("Other maltster…" on grain) closes the product dialog.**
- What happens now: picking the option closes the whole Add/Edit product dialog and loses the
  input. The short list only shows makers already used in the category, so a product from a new
  maker can't be made in the UI at all (grain and hops require one). The API accepts it.
- Find out whether this was ever working: D60's design (the D60 spec and plan, "Other maltster…")
  and git history. Tell me what it was meant to do.
- **The fix:** choosing "Other manufacturer…" keeps the product dialog and its input. It lets the
  user pick **any company with the manufacturer role** (searchable), and offers adding a new
  company if the D60 design had that. The chosen maker then shows in the select.
- Close-on-select is probably the phone `history.back()` or a nested-dialog close bubbling to
  FormDialog. Check that the phone back button still closes only the inner picker.
- Playwright, desktop and 360 px:
  - a `[TEST-TEMP]` company with the manufacturer role, not yet used in the category, picked
    through "Other manufacturer…" on Add and Edit, for a fruit product **and a grain product**;
  - the input survives;
  - the product saves with that maker.

## Should-fix

**Gap 3: Totals Copy puts the $ grand total on the first per-unit Total row.**
- In both the Inventory and Orders Copy, the per-unit subtotal rows carry no $.
- The $ grand total gets its own row ("Total value" or the screen's label), with the quantity and
  Unit cells empty.
- Grain-only Copy keeps D61's layout if it had one total row. Check that the D61 Copy tests still
  pass unchanged.

## Minor

- **Gap 1:** the Formula field is shown and saved **only on Water Salts ingredients**. My Stop 1
  brief said "every category", which was wrong.
  - The API refuses a formula on another category with a 422.
  - Existing values elsewhere are kept and shown read-only if any exist; locally and on DEV, only
    QA rows have them.
- **Gap 4:** in Copy, a Tablet product's Unit is `tablets`, and `each` quantities have no decimals
  ("750", not "750.00"). Other units keep their decimals.
- **Gap 5:** the library's All Categories view has no sideways scroll at 360 px. Use cards, as the
  single-category lists do, or drop columns.
- **Gap 6:** the New order line summary before a quantity is typed: show nothing, or use the
  offer's pack name ("0 pails · 0 lb"), never "sacks" for a non-sack line. Check Edit order too.

## Done when

- `mix test` passes, and `--warnings-as-errors` is clean.
- vitest, tsc and the build are clean. Lint still shows the same 8 errors.
- The `ingredients` Playwright project passes.
- **Reply with:**
  - commits;
  - gap → fix → test, noting which tests you proved by revert;
  - what "Other manufacturer…" was designed to do;
  - `LEAD:` notes.

**After this,** the lead runs the full local suite, redeploys DEV, runs DEV Playwright, and DEV QA
rechecks.
