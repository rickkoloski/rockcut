# D63 builder brief — Stop 0 (carry-ins)

2026-11-24 · lead → builder.

## Read first

- **Spec (approved):** `docs/current_work/specs/d63_foundations_spec.md`: §3, and §12 "Stop 0".
- **Plan:** `docs/current_work/planning/d63_foundations_plan.md`: "Where things are" (the first three
  items) and Stops.
- **Reports behind the items:** `docs/current_work/stepwise_results/d64_dev_qa_report.md`, gaps 1–3.

This brief covers **Stop 0 only**. Stop after it and report. Stop 1 (catalog) comes as its own brief.

## Where and how

- Work in `~/src/rockcut` on branch **`d63-foundations`**. It's checked out. Don't switch branches.
- **Commits:** small (`fix: D63 …` / `test: D63 …`), paths staged by name. Don't push, merge, rebase
  or stash. End each message with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Servers:** the lead owns them (API :4002 in w1:p2, UI :5174). Ask if you need a restart. Stop 0 has
  **no migrations**.
- **Formatting:** no repo-wide `mix format`; format only files you touch.
- **Data:** tests never edit or delete seeded reference rows. Revoke or delete only your own
  `[TEST-TEMP]` rows, by exact id.
- Never print a synthetic token. When reading Playwright failures, filter `Authorization` and `Bearer`.

## Do

Every fix gets a test that fails with the fix reverted. Actually revert and rerun, and say which you
proved.

1. **6260: phone Back closes confirmations.** `ConfirmDialog` uses `useBackCloses`, as `FormDialog`
   does on phones.
   - Back closes only the top dialog: from Brink History → Remove (and Delete count), it closes the
     confirm and History stays.
   - While the confirm is in flight (the gate is busy), Back doesn't close it.
   - With `onCancel` (a second answer), Back only closes, as Escape does. It never runs the answer.
   - **A confirm that then navigates must still land** (5911's `history.back()` race: the entry's
     removal a tick later aborts a following navigation). List every `ConfirmDialog` whose confirm
     navigates away, and check each one at 360 px in a browser.
   - Desktop behavior doesn't change.
   - Playwright at 360 px: Dump brink, Mark clean, Remove pitch, the nested History case, and one
     that deletes and navigates.
2. **6261:** Brink History doesn't list **voided** records that have no entries. A voided record with
   entries still shows. ExUnit for both, and the dialog.
3. **6262:** the order page's footer uses the same per-unit words as New order ("20 bricks, 12
   pitchables"; tablets too). One shared helper, with vitest; a Playwright assertion.
4. **S16** (`rockcut-ui/tests/regression/d58/sweep.spec.ts`): reach the target week without 47 quick
   clicks on Next week. Use a URL or stored week if the Scheduler already has one; otherwise step with a
   wait for each week's load. **Test code only:** tell me if it would need an app change. Other callers
   of the same helper must still pass.
5. Start a **D63 section in `rockcut-ui/tests/COVERAGE.md`** mapping each item to its test.

## Done when

- `mix test` passes twice (note the seed of each run), and
  `MIX_ENV=test mix compile --warnings-as-errors --force` is clean.
- vitest, `tsc -p tsconfig.app.json` and `vite build` are clean. `pnpm lint` shows the same 8 errors.
- The specs you touched pass locally. **I run the full suite** in its own tab.
- **Reply with:** your commits; test counts before and after; item → test, saying which you proved by
  revert; the list of confirms that navigate and what you checked; and `LEAD:` notes for anything open
  or anything that didn't fit.

---

# Stop 1 (catalog)

2026-11-24 · lead. **Stop 0 reviewed** (`2356f8f` … `d1dfc4f`). Your LEAD notes:

1. **TaskBoardTest: fix it here** (Matt, 2026-11-24). Make the module `async: false`. Prove it: seed
   537802 fails before and passes after. Check the suite for other `async: true` modules that write
   through the Repo, and list them; change none without asking. Its own commit. Test code only.
2. S16: accepted; DEV decides.
3. The " · " separator is accepted.
4. Accepted: "Nothing yet" beside "has history" stays.
5. Accepted.
6. Matt checks a real phone.
7. Accepted. Don't read `.playwright-auth` files from a script; use the harness (`apiAs`, `authFile`).
8. Accepted. Say so when you start a revert run, since it hot-reloads the servers I test on.

## Read first

Spec §5 (all), §2 decisions 8 and 11–15, §9, §10's corrections, and §12 "Catalog". Plan: "Catalog data
migrations", "Units g and mL", and Risks.

## Rules for this stop

- **Ask me before running a migration on the dev database.**
- Migrations are one per topic, and read rows **by name**. They skip with `Logger.warning "D63: …"`
  when rows aren't as expected. The only one that stops is the Process Aids rename, on a duplicate.
- On an empty database, every one does nothing.
- Every rule gets a refusal test and an allowed test. Seeded reference rows are read-only in tests.

## Do

0. **TaskBoardTest** (above).
1. **Process Aids** (§5.1): the rename migration (by parent key and name, any case); `Catalog` knows
   "process aids" and still "finings"; `seeds.exs`, tests and UI wording follow. Rename in the Playwright
   specs that make ingredients in 'Finings'.
2. **Units g and mL** on Process Aids: find every place a unit is listed, labelled, parsed, summed or
   refused (API and UI) **before** adding them, and list those places in your report. Pack sizes
   250 g, 1,000 g, 1,000 mL and 10,000 mL (the `pack_size` limit is 10,000: test the edge). Totals and To
   order keep g and mL in their own subtotals. Decimals follow the existing rules.
3. **New rows** in `priv/repo/seeds/d63_reference.exs`, wired into `seeds.exs` as the other reference
   seeds are: the four process aids with their offers (§5.1), the seven spice products (§5.2; cinnamon,
   allspice and clove are **Ground**, the rest Whole; unit oz; manufacturer None; no offers), and EKG with
   its lot. No prices. EKG's lot is added only if EKG has no lot. If a row exists, leave it.
4. **Value corrections** (§5.3): only where the stored value equals Old (or is none, where Old is none).
   Edit the seeds that hold them too. Lots aren't touched.
5. **Calcium chloride** (§5.4): move the product with its offer and price; skip if it has lots or
   Anhydrous already has a product. The seed must not recreate Hydrous's product.
6. **Pink Boots** (§5.5): rename, create '24, move the 2024 lot with its movements, features and cost.
   Both lots keep their on hand (8.5 and 2.9). Only if the rows look as seeded. Skips and logs if an
   order or contract line names the product (the rename still happens; the lines stay with '23).
   `hop_reference.exs` and `hop_seeds_test.exs` follow.
7. **Seeds must agree** (§5.6): an ExUnit test that loads D64's data, runs the migrations, then the seeds
   **twice**: nothing comes back, nothing doubles, and the second run adds 0. Another with each value
   changed by hand first: it's left alone. Another on an empty database.
8. **COVERAGE:** extend the D63 section.

## Done when

As Stop 0 (with the seeds of both ExUnit runs), plus: the `ingredients` project passes locally after I've
run the migrations and seed; and a browser check at desktop and 360 px, as `brewer2`, of Process Aids,
a zinc order received as "2 bags" (500 g), EKG, calcium chloride and both Pink Boots.

**Reply with** commits, counts, rule → test (which you proved by revert), the seed's log line on the first
and second run, the unit places you found, the `async: true` list, and `LEAD:` notes.
