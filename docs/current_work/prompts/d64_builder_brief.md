# D64 builder brief — Stop 1 (yeast products, strain types, pitch from a lot, gap 9)

2026-11-22 · lead → builder.

## Read first

- **Spec (approved):** `docs/current_work/specs/d64_yeast_harvests_spec.md`. For this stop, read
  §2 decisions 1–6 and 22, §4.1–§4.3, §4.6, §6.1–§6.2, §6.4's last paragraph, §9, §11 and the
  **Amendment** (reference data) at the end.
- **Plan:** `docs/current_work/planning/d64_yeast_harvests_plan.md`. Read "Where things are",
  "Catalog and products", migrations 1–4, Seeds, and Stop 1.
- **Gap 9:** `docs/current_work/prompts/d65_lead_decisions_5.md` (deferred from D65; build it here).
- **Background:** the D65 spec and plan, the same model one category over. D65 is on prod as
  `v2026.11.22`.

This brief covers **Stop 1 only**. Stop after it and report. Stop 2 (brinks, records, counts,
board tasks) comes as a separate brief.

## Where and how

- Work in `~/src/rockcut` on branch **`d64-yeast-harvests`**. It's already checked out and holds the
  spec, plan and this brief. Don't switch branches.
- **Commits:** keep them small (`feat: D64 …` / `fix: D64 …` / `test: D64 …`) and stage paths by
  name.
  - Don't push, merge or rebase.
- **Servers:** the lead owns them (API :4002 in w1:p2, UI :5174).
  - **Ask me before running a migration on the dev database.** They're all additive, but I restart
    the API around them.
  - Ask me if you need a restart.
- **Formatting:** don't run repo-wide `mix format`; format only the files you touch.
- **Reference files:**
  - `docs/current_work/reference/d64_yeast_matt_2026-11-22.csv` is git-excluded. Read it and
    **embed** its rows in the seed file. Don't edit it.
  - Tests never edit or delete seeded reference rows (grain, hops, D65, D64).
- **Tokens:** never print a synthetic token in your output.

## Do (plan Stop 1)

Every rule gets a refusal test and an allowed test.

1. **Migrations 1–4** (plan; timestamps `202611221200NN`):
   - **`yeast_strain_types`:**
     - seeded with Ale, Lager, Brett and Lacto;
     - names unique case-insensitive; a type in use can be renamed or retired, not deleted;
     - add `ingredients.yeast_strain_type_id`.
   - **Features:**
     - `ferm_temp_f`, `attenuation_pct` and `pitch_bbl`;
     - the Yeast Strains `category_feature_types` rows. Pitch size has `only_form: "Liquid"`, is
       optional on the product, and on the lot is copied when the product has a value and required.
   - **Yeast tidy-up:**
     - delete the five old field definitions;
     - delete WLP001, Wyeast 1056 and WLP002 where they have no products, lots or recipe lines,
       with `Logger.warning "D64: kept …"` otherwise;
     - stop with a message naming the lots if a yeast lot has no product.
   - **`ingredient_movements.batch_id`:** nullable, references `batches`.
2. **Catalog and products** (plan "Catalog and products"):
   - yeast becomes managed: Dry/Liquid, `each` only, packs brick/pitchable/case, default pack by
     form;
   - "bricks" / "pitchables" labels, and the whole-number sentence;
   - the manufacturer is required, labelled **"Lab"** on yeast screens;
   - Add subcategory and Add field are hidden on Yeast Strains, with a 422 from the API.
3. **Strain types:**
   - the API (`/api/yeast/strain_types`); **writes are Brewery managers and owners**, through a new
     `Authz` action (`:yeast_settings`), added to the D31 parity/boundary tests;
   - a minimal Yeast settings gear on the Yeast Strains view, with only the Strain types section
     for now (Stop 2 adds Brinks);
   - the Strain Type picker in the ingredient dialog for yeast; the library column and filter.
4. **Screens** (spec §6.1–§6.2):
   - the library list, the product page, and the product, offer, Add lot and Receive dialogs for
     yeast;
   - pitch size on Liquid lots (copied and editable, required).
5. **Pitch from purchased yeast** (spec §4.6 and the last paragraph of §6.4):
   - `POST /api/ingredient_products/:id/pitch` with `occurred_on` (not in the future), `batch_id`
     (required, an existing batch), `quantity` (whole), optional `lot_id`, and `note`;
   - it writes `used` movements with `batch_id`, Oldest first when no lot is given, in the same
     `BEGIN IMMEDIATE` pattern as `Inventory`;
   - yeast products only (422 otherwise);
   - the Pitch dialog on the product page: date, batch picker, count, optional lot, note.
6. **Gap 9:** as written in `d65_lead_decisions_5.md`, with the shared helper, vitest, and a
   Playwright assertion.
7. **Seeds:**
   - `priv/repo/seeds/d64_reference.exs`, wired into `seeds.exs` and `Release.seed/0` like D65's,
     per the plan's Seeds section and the spec's Amendment. The names are as in the spec: **White
     Labs**, **German Monk Lager**, "Vermont Ale Modi" kept;
   - an ExUnit test that the seed is idempotent and its counts match the log line;
   - `seeds.exs`: stop seeding the old yeast fields and the three removed strains, and seed "Chico
     Ale" in place of US-05.
8. **`tests/COVERAGE.md`:** start a D64 section mapping each Stop 1 rule → layer.

## Done when (Stop 1)

- `mix test` passes twice, and `MIX_ENV=test mix compile --warnings-as-errors --force` is clean.
- vitest, `tsc -p tsconfig.app.json` and `vite build` are clean. `pnpm lint` still shows the same
  8 errors.
- The `ingredients` Playwright project passes against the local servers, after I've run the
  migrations and the seed. I'll run the full suite in its own tab.
- **Browser check** as `brewer1`, at desktop and 360 px:
  - the 11 seeded yeast products read correctly ("Chico Ale US-05 · Fermentis", bricks /
    pitchables, Lab);
  - add a Liquid lot with a pitch size;
  - pitch 1 brick into a batch;
  - gap 9 is fixed.

  As `breweryMgr`, edit a strain type. As `brewer1`, the strain type settings are read-only.
- **Reply with:**
  - your commits;
  - test counts before and after;
  - rule → test, one line each, noting which tests you proved by revert;
  - the seed's log line on the first and second run;
  - `LEAD:` notes for anything left open or any place the plan didn't fit the code.

---

# Stop 2 (brinks, records, counts, board tasks)

2026-11-22 · lead. **Stop 1 accepted** (`e01e518` … `115e49f`; ExUnit 2,853 ×2, vitest 525,
ingredients Playwright 148/148). Your LEAD notes:

1. Accepted. The plan now says `inventory_movements`.
2. **`GET /api/yeast/batches` is accepted** as the yeast pages' batch source. Keep it, and reuse
   it for Stop 2's Pitch-from-a-brink picker and Stop 3's batch labels.
3. Accepted, all three.
4. Accepted, both.
5. Accepted. Keep the Playwright check that nothing is sent.
6. Accepted. Synthetic setup will clear the `[TEST-TEMP]` rows.
7. Accepted.
8. Accepted. Stop 2 adds Brinks to the same gear. The Lab filter behaves like grain's maltster
   filter.

## Do (plan Stop 2; spec §2 decisions 7–9 and 16–21, §4.4, §4.5, §4.7, §5.3, §6.3–§6.5, §7, §8)

Every rule gets a refusal test and an allowed test.

1. **Migrations 5–10** (plan). **Ask me before running them on the dev database**, as in Stop 1:
   - `yeast_brinks`, with YB1–YB4 seeded;
   - `yeast_harvests`, with the partial unique index (one `in_brink` record per brink);
   - `yeast_harvest_products`;
   - `yeast_harvest_entries`, including the `generation` / `product_ids` snapshots and a unique
     `production_step_id` where not null. The column exists now; Stop 3 writes it;
   - `yeast_counts`;
   - `tasks.yeast_brink_id` + `yeast_kind`, with the partial unique index.
2. **`RockcutApi.Yeast.Rules`** (pure): `from_sources/1` and `combine/2` per spec §5.3, plus the
   fold over `harvested` entries. Write **table-driven ExUnit** with one row per line of both §5.3
   tables, plus a refold after removing an entry.
3. **`Brinks`, `Harvests`, `Counts`, `Pitches` (from a brink) and `BoardTasks`**, per the plan:
   - **`Harvests.harvest!/3` is built and tested through the context now**, including:
     - the dirty question (`dirty_ok`);
     - the has-yeast question (`brink_answer` `on_top` / `empty`; `empty` closes the old record
       with an `adjusted` entry to 0 and the note, no dirty mark, no clean task);
     - the fold.

     It isn't on any route or screen yet: Stop 3 calls it from the step check-off.
   - **Every write** runs in `BEGIN IMMEDIATE`. On hand never goes below 0 ("YB2 has 18 lb", 422),
     and `lock_version` gives the stale-save 409.
   - **Closing at 0** (pitch, dump, adjust): `emptied`, `emptied_on`, the brink dirty, and the
     "Clean YB2" task.
   - **Recount task:**
     - opened by every harvest, due the harvest date;
     - ticked by Add count;
     - at most one open task per brink and kind.
   - **The task-completion hook:** ticking a `clean` task clears the brink's dirty mark, and Mark
     clean ticks the open clean task. Find the one place board tasks are completed (person and
     device paths) and hook it there.
   - **Counts:**
     - `in_effect/2`;
     - no future dates;
     - edit or delete by the maker or a Brewery manager until a pitch dated on or after the count.
4. **Authz:**
   - brink settings use `:yeast_settings` (managers and owners);
   - stock actions are for Brewery members and owners;
   - entry and count edits are for the maker or a Brewery manager, through `Authz`;
   - devices get 403 on every new route;
   - extend the parity/boundary tests and the device route matrix.
5. **Routes** (plan's table): brinks (list with state, settings CRUD, history), `pitch` / `dump` /
   `adjust` / `clean`, and counts. Use flat params.
6. **UI:**
   - **The Brinks tab** (spec §6.3): cards at 360 px, rows on desktop.
     - Each brink shows its state, strains or "Co-ferment: …", generation, on hand, the count in
       effect with "before the 11/20 harvest" and "Recount due", sources, and the harvest date.
     - Actions: Pitch, Add count, Adjust weight, Dump brink (confirm), Mark clean, History.
     - Every lb field shows "YB2 empty: 148 lb" when the brink has an empty weight.
   - **Yeast settings → Brinks:** name, empty weight, order, active; add, rename, retire (refused
     with yeast in it) and delete when unused. Read-only for non-managers.
7. **`tests/COVERAGE.md`:** add the Stop 2 rows.

## Done when (Stop 2)

- `mix test` passes twice, and `--warnings-as-errors` is clean.
- vitest, tsc and the build are clean. Lint still shows the same 8 errors.
- The `ingredients` and `tasks` Playwright projects pass. **Don't run Playwright while you're
  changing the UI or running a browser check**; Stop 1's overlap cost a rerun.
- **Browser check** at desktop and 360 px:
  - **Setup:** create the yeast in YB2 through the context in a test helper or `mix run` script
    (harvests have no screen until Stop 3). Use `[TEST-TEMP]` data only, cleaned up by id.
  - **As `brewer1`:** pitch part of YB2, add a count (the Count task ticks), adjust to 0 (dirty,
    and Clean YB2 on the board), then tick Clean YB2 on the board (YB2 is clean).
  - **As `breweryMgr`:** add YB5 with an empty weight, then retire it.
- **Reply with:**
  - your commits;
  - test counts before and after;
  - rule → test, noting the revert proofs;
  - `LEAD:` notes.
