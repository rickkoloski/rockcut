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
9. **The Ingredient Library's top row** (found in Stop 0's full run; its own commit, not from Stop 0). At
   1440 px as `owner`, the gear loads at x=1376; when Grains' filters arrive, the end group wraps to a
   second row and sits on the left (x=645, for good). In `PageToolbar` (`components/SettingsMenu.tsx`)
   the spacer stays on the first row. Make the end group stay on the right when it wraps (`ml: 'auto'` is
   the likely fix). It may still wrap. Check all seven pages that use it at 1440 and 360 px: nothing else
   moves. `tests/regression/ui/d52.spec.ts:30` passes only because it measures before the filters load:
   wait for the settled row (Grains' filters) on /ingredients, assert x as now, and y only where the row
   doesn't wrap. Prove it by revert.

## Files

Search only inside `~/src/rockcut` and `/tmp/claude-501`. Never `find /` or `find ~`: it sets off macOS
file-access prompts on Matt's screen.

## Done when

As Stop 0 (with the seeds of both ExUnit runs), plus: the `ingredients` project passes locally after I've
run the migrations and seed; and a browser check at desktop and 360 px, as `brewer2`, of Process Aids,
a zinc order received as "2 bags" (500 g), EKG, calcium chloride and both Pink Boots.

**Reply with** commits, counts, rule → test (which you proved by revert), the seed's log line on the first
and second run, the unit places you found, the `async: true` list, and `LEAD:` notes.

---

# Stop 2 (hop use lists)

2026-11-24 · lead. **Stop 1 reviewed and accepted** (`728088e` … `8a8afd0`), with one correction (item 0a).
You start with a cleared context: this file, the spec and the plan are all you need. The Stop 0 section's
"Where and how" and the Stop 1 section's "Files" and "Rules for this stop" still apply.

Your LEAD notes: 2–6 accepted. 7 is below. 8: the lead reseeds. **Full Playwright is the lead's**, after
this stop.

## Read first

Spec §4 (all), §2 decisions 2–10, §7, §8, §9, A1/A5/A8/A9 in §10, and §12 "Use order". Plan: "Where things are", "Use
order" and Risks.

## Do

0. Small ones, a commit each:
   a. **Top row** (`PageToolbar`): 17c166a also moved Brands' buttons at 360 px (x=24 to 150). Make
      `ml: 'auto'` apply from `sm` up only. At 360 px all seven pages are as they were before 17c166a;
      at 1440 px as now. `ui/d52` covers both widths. Prove by revert.
   b. **`purchasing_schemas_test`:** `async: false` (Matt, 2026-11-24). Test code only. Change no other.
1. **Data** (§4.1): the migration and backfill, after Stop 1's four by version. One shared function
   assigns max + 1 in the lot's own write. **List every place a lot is inserted or changes list, before
   you start**, and put the list in your report. At least: `Inventory.create_lot`, receiving a new lot
   (`orders.ex` ~756), `brewing.ex` ~285, `inventory.ex` ~684 and ~819, the synthetic, hop and d63 seeds.
   Changes of list: `update_lot` giving a lot (no movements) another product; a product's ingredient or
   form edited while it has lots; an ingredient moved into or out of Hops. Check which of these the code
   allows today. A lot that joins a list goes to its end; one that leaves Hops goes to null. Anything
   the spec doesn't decide: take that rule and say so under `LEAD:`.
   `test/support/fixtures/d64_seeds` stays as it is: the test runs the backfill on it. A null position
   on a hop lot must not crash a read.
2. **API** (§4.2): GET and PUT, the `version`, 409 with a sentence, 422 for a foreign, repeated or missing
   lot. `:read`/`:write, :ingredients`. Extend the D31 boundary/parity suite: devices and `office1` get
   403. The version is rechecked inside `BEGIN IMMEDIATE`.
3. **Allocation** (§4.3). **The trap:** `count_parts` takes "newest" from the end of `product_lots`
   (`inventory.ex` ~420 and ~427; check ~454 and ~577 too). For hops that list is now in use order, so
   overages must take newest by received date, then id. Test with a hop whose newest lot is first in use
   order, and one whose newest is expired. Yeast pitches and grain don't change: test that.
4. **Screens** (§4.4): the Use order section, `OrderedList` reuse, "In use", Used up, the Hide used-up
   lots setting (per account, beside the packs/total toggle on the Hops list and the hop's page), the
   wording in Record movement and Count. `lib/inventory.ts` `oldestFirst` is used by three dialogs; change
   only what hops see. A failed reorder puts the old order back and says so.
   A slow network: a second drag before the first save answers must not lose either.
5. **Tests:** every rule gets a refusal test and an allowed test; Playwright for §12 "Use order" on your
   own `[TEST-TEMP]` hops, at desktop and 360 px; COVERAGE. The `[SEED]` hop is Stop 3.

## Rules

- **Ask me before landing or running the migration on the dev database.** I back up, run and seed.
- Build and prove on a scratch copy while I'm not running Playwright, as in Stop 1.
- Don't start Playwright after 23:00 or run it across midnight.

## Done when

As Stop 1, plus the list in item 1, and a browser check at desktop and 360 px as `brewer1` and `brewer2`
of drag, long-press, keyboard, arrows, the two-brewer 409 and Hide used-up lots. Look at every screenshot
you take, and say so.

**Reply with** commits, counts (with seeds), rule → test (which you proved by revert), the item 1 list, and
`LEAD:` notes.

---

# Stop 3 (Brewery settings, `[SEED]` hop, COVERAGE)

2026-11-25 · lead. **Stop 2 reviewed and accepted** (`f5787f4` … `3204d0d`), all your LEAD notes included.
Full local Playwright on Stops 1 and 2: 1,056 passed, 1 skipped, 0 failed. This file, the spec and the plan
are all you need. The Stop 0 section's "Where and how" and the Stop 1 section's "Files" and "Rules for this
stop" still apply.

## Read first

Spec §6 (all), §7, §8, §9, A6/A7 in §10, and §12 "Settings". Plan: "Brewery settings", "Permissions" under
"Where things are", and Risks.

## Do

1. **Data** (§6.1): `brewery_settings`, one row, created by its migration with the starting values and
   recreated with them on first read if missing. Two first reads at once must not make two rows. The
   migration comes after `20261124120006`. Every limit in the table is inclusive and enforced by the API.
   Zinc is **stored per bbl** (0.09375) and **shown and edited per 8 bbl** (0.75): its limits apply to the
   stored value, and the screen's refusal names them in the screen's unit. Opening and saving without
   changing zinc or Clarity Ferm must not change what is stored.
2. **API** (§6.2): `GET` and `PUT /api/brewery_settings`. A stale `lock_version` is 409 with a sentence and
   the current values. A missing `lock_version` is refused, not treated as current. The version is checked
   in the write itself. `updated_by` comes from the session, never from the body.
3. **Permissions** (§6.2, §7): Authz `:brewery_settings`, `:read` and `:manage`, the same member and manager
   rules as `:yeast_settings`. The brewhouse device gets `:read` on its allowlist, with no staff code for
   the GET; its PUT is 403 even when a Brewery manager's staff code is sent. Every other device is refused
   both. Extend the D31 boundary/parity suite and cover each column of §7.
4. **Page** (§6.2): `/brewery/settings`, in the Brewery nav and `DEVICE_PAGES`. Check that the route is
   reachable on the brewhouse device: the Brewery routes are under `hasBrewery` in `App.tsx`. Everyone else's
   URL goes Home. **Don't disturb the old `/settings` redirects.** Groups, "Last changed by … on …", and the
   two lines at the top as the spec words them. Before anyone has changed it, show no "Last changed" line.
   - A refused value keeps the form open with what was typed and a sentence giving the limits. Empty, text
     and a comma decimal are refused.
   - On a 409 nobody's typing is lost silently: the sentence, the current values, and Edit still usable.
   - Phones: 360 px has no sideways scroll; Back and leaving the page with unsaved edits behave as the
     app's other edit forms do. Say which one you followed.
   - Slow network: a double-click on Save writes once.
   - Nothing else reads these values in D63.
5. **Account settings check** (Stop 2 follow-up): saving only `hide_used_up_lots` leaves
   `quantity_display` as it was, and the reverse. ExUnit, plus a Playwright check that both survive a reload.
6. **`[SEED]` hop** (§9): in `seeds/synthetic.ex`, a hop variety with one form and **three lots from two
   makers**: one used up, one expired, one with stock and not expired. Read how the other `[SEED]` rows are
   made and follow it (repeat runs add nothing and repair nothing they shouldn't). **Synthetic data only:
   nothing in `Release.seed/0` may create it.** Pick a date far enough off that the expired lot is always
   expired and the good lot never is. Check every spec that counts, totals or lists hops, lots, products or
   companies, since new rows change those numbers; fix the specs' expectations only where the new rows are
   the cause, and list each one.
   Then add a read-only Playwright spec on it (the list, "In use" on the right lot, the expired one skipped,
   Used up behind the switch). Tests don't move, count or reorder it: those stay on `[TEST-TEMP]` hops.
7. **Tests and COVERAGE:** every rule gets a refusal test and an allowed test; Playwright for §12 "Settings".
   There is one settings row and it is shared, so a spec that edits it restores the starting values by the
   API afterwards even when it fails, and doesn't run alongside another that reads them. Finish the D63
   section of COVERAGE: every §12 line for Stops 0–3 maps to a test, or says "manual" and why (long-press
   on a real phone is one).

## Rules

- **Ask me before landing or running the migration on the dev database.** I back up, run and seed.
- Build and prove on a scratch copy while I'm not running Playwright, as in Stop 2.
- **No disk-wide searches** (`find /`, `find ~`). Search only `~/src/rockcut` and `/tmp/claude-501`.
- Don't start Playwright after 23:00 or run it across midnight.

## Done when

As Stop 1 (ExUnit twice, warnings-as-errors, vitest, `tsc`, `vite build`, the same 8 lint errors), plus a
browser check at desktop and 360 px as `brewer1`, `breweryMgr`, `owner`, the brewhouse device and
`bartender1`. Look at every screenshot you take, and say so. **I run the full suite.**

**Reply with** commits, counts (with seeds), rule → test (which you proved by revert), item 6's list of
changed specs, and `LEAD:` notes for anything the spec didn't decide.

---

# Fix cycle 1 (local QA)

2026-11-25 · lead. Local QA: 17 scenarios, no defect in D63's own rules. Gap 1 was the brief's mistake (the
API's rule stands: a count's extra goes to the newest lot that isn't expired). Gap 2 is D55's behavior.

1. **Count wording** (`lib/inventory.ts` `lotChoice`, both branches): "Over: onto the newest lot that isn't
   expired." Update the tests that quote it. No API change.
2. **Back after a delete shows the deleted row** (older than D63). Delete a product, land on the list, press
   Back: the page draws the cached row with its buttons, though its GET answered 404. After a delete that
   leaves the page, Back must say not found. Drop that row's cached detail query once the page has been left,
   so the mounted page neither refetches nor flashes "not found". **Don't** make a 404 replace a page that is
   open with someone's typing in it: a row someone else deletes keeps today's behavior (D64 `goneOr`).
   Cover every detail page with a 404 branch that can be deleted: ProductPage, IngredientDetail, OrderPage,
   BatchDetail, BrandDetail, RecipeDetail, CategoryDetail. Say which delete from their own page.
   Playwright at 1366 and 360 px for a product, and one other page, proved by revert.
   Also check Forward after that Back on a phone: QA saw it stay on the deleted page. Report what you find.
3. **OfferDialog's pack-note hint** (`OfferDialog.tsx` ~167): on g and mL products it says "(5 lb)". Show the
   "(5 lb)" example only where it makes sense (tablets/each), with a fitting one or none elsewhere. vitest.

Seeded rows read only. No migration. Land when the gates in the Stop 0 "Done when" pass (the Playwright specs
you touched, plus the whole `ingredients` project on your scratch copy). Don't land until I say. Report as before.
