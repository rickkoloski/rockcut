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

---

# Stop 3 (the Yeast harvest step, the batch page, un-check and Undo)

2026-11-22 · lead. **Stop 2 accepted** (`7346625` … `918b019`; ExUnit 2,903 ×2, vitest 532,
ingredients Playwright 152, brewery-board 436). Your LEAD notes:

1. Accepted. "tasks" meant `brewery-board`. At this stop, also run **`production`** on its own.
2. Accepted. There's no `Pitches` module.
3. Accepted: `Tasks.do_complete` hook and `Tasks.complete_as/3`.
4. Accepted.
5. Accepted (40 characters).
6. Accepted. `lock_version` is checked only when it's sent.
7. **Decided here (item 3 below).**
8. **Decided here (item 7 below).**

**You're starting fresh** (the lead cleared your context). Read the spec, the plan, and the Stop 1
and Stop 2 sections above, then `git log --oneline cc58b81..HEAD` for what's built. The yeast code
is in `rockcut_api/lib/rockcut_api/yeast/`.

## Do (plan Stop 3; spec §2 decisions 10–17 and 19, §4.8, §5, §6.6, §8)

Every rule gets a refusal test and an allowed test.

1. **Migrations 11–12** (plan). **Ask me before running them on the dev database.**
   - `production_steps.yeast_outcome` + `yeast_note`;
   - the `yeast_harvest` behavior.
     - The migration sets `behavior` and `built_in` on the non-retired type whose
       `lower(name) = 'yeast harvest'`. It **stops**, with nothing changed, naming what it found,
       if there's none.
     - It logs pre-brew steps of that type.
     - Add `yeast_harvest` to `StepType`'s `@behaviors`.
2. **`Yeast.Generations.for_batch/1`** (plan): it turns lot pitches (`used` movements with
   `batch_id`, Mother = gen 0) and brink pitches (their snapshots) into `Rules.from_sources/1`'s
   defaults. No sources → `nil`.
3. **The check-off** (plan, "The step check-off"):
   - **The new fields:** `complete_fields/0` gains the flat `yeast_*` params. A `yeast_harvest`
     step needs `yeast_outcome` (`:yeast_required`).
   - **Harvested:** `harvested` calls `Harvests.harvest/2` inside `complete/4`'s transaction, with
     `production_step_id`, `batch_id` and `done_on` as the date.
   - **Dumped:** `dumped` writes only the step's `yeast_outcome` / `yeast_note`.
   - **Preview:** for a `yeast_harvest` step it returns `needs_yeast` and `yeast: %{brinks (with
     state and empty weight), default_brink_id, defaults, products}`. The default brink is the one
     this batch's earlier harvest went into, if it's still open.
   - **The two questions:** map `{:yeast_question, :dirty | :has_yeast, brink}` in the fallback to a
     **409** whose body carries `code: "yeast_question"`, `question: "dirty" | "has_yeast"`, and
     the sentence:
     - "YB2 is marked as dirty, record harvest anyway?"
     - "YB2 shows yeast in brink. Do you want to harvest on top or is this brink empty?"

     The dialog asks, then resends with `yeast_dirty_ok` / `yeast_brink_answer`. One question at a
     time: dirty first.
   - **Who:**
     - on a device, the acting staff-code person must pass `Authz` for ingredients **edit**.
       Otherwise it's D50's "can't do this here", and the code isn't counted;
     - entries get `device_id`;
     - check both the schedule controller and the task-board controller paths.
4. **Un-check and Undo** (spec §5.4, plan):
   - **Un-check:** `uncomplete/1` calls `Harvests.unrecord_step/1` first.
     - It's refused with a **409** "YB2 has been pitched from or counted since this harvest. The
       harvest can't be un-checked." when a pitch or count on that record was entered after the
       step's entry.
     - Otherwise it removes the entry, then refolds or voids the record, and deletes the open Count
       task if nothing else needs it.
     - A `dumped` outcome just clears the columns.
   - **Undo:**
     - an Undo that flips a `yeast_harvest` step done → not done runs the same un-check in its
       transaction, with the same refusal;
     - an Undo that would flip one back to done is **refused**: "Check it off again to record the
       harvest.";
     - test both through the controller, with the token, expiry and `undo_not_yours` unchanged.
5. **`HarvestDialog`:** one shared component in the check-off flows on the **Gantt**
   (`StepDialog` / `flows`) and on the **board** (`LinkedTaskDialog` / `TaskCard`), which is the
   device path too.
   - Harvest yeast / Yeast dumped, each with a note.
   - Harvest yeast shows:
     - the brink picker with states ("YB1 · empty", "YB2 · 42 lb US-05 gen 2", "YB3 · dirty");
     - "Yeast weight (lb)" with "YB2 empty: 148 lb" beside it;
     - strains and generation, prefilled from `defaults` and editable. When `defaults` is null,
       they're asked: strain picker (one or more) and generation, starting at 1 (A5);
     - the questions as `ConfirmDialog`s ("Record anyway" / "Cancel"; "Harvest on top" / "This
       brink is empty").
   - One press at a time, and it works at 360 px.
6. **The batch page** (spec §6.6): `BatchDetail.tsx` gets a **Yeast** section, from
   `GET /api/yeast/batches/:id`.
   - **Pitched:** lots ("2 bricks Chico Ale US-05, lot F123 · Mother") and brinks ("38 lb from YB2 ·
     US-05 gen 2").
   - **Harvested:** one line per pull ("11/20 · 30 lb → YB2", "11/22 · 12 lb → YB2 (on top)"), and
     "Yeast dumped · <note>".
7. **Removing a mistaken pitch, dump or adjustment** (spec §8, A8). This is new detail, the lead's
   call:
   - **Remove** on a brink's History removes a `pitched`, `dumped` or `adjusted` entry, under these
     conditions:
     - only by its maker or a Brewery manager (`{:yeast_record, _}`);
     - only when it's the **latest entry** of its record and no count was entered after it;
     - **closing entries:** if it closed the record (emptied), it reopens the record. That's only
       when the brink has no newer record. It also deletes the open "Clean" task and clears the
       dirty mark that closing set;
     - harvested entries are removed only by un-checking their step;
     - "Emptied when the … harvest went in" adjustments aren't removable.
   - Refusals are 409s with a sentence.
   - Add a History "Remove" button with a confirm.
8. **Tests:**
   - ExUnit for all of the above;
   - Playwright in `production` and `brewery-board` for the check-off flows (Gantt, board, and the
     device with a staff code), the questions, un-check refused / allowed, and Undo refused;
   - Playwright in `ingredients` for the batch page and Remove;
   - COVERAGE.

## Done when (Stop 3)

- `mix test` passes twice, and `--warnings-as-errors` is clean. Vitest, tsc, the build and lint (8)
  read as before.
- `ingredients`, `brewery-board` and `production` Playwright pass, with nothing else touching the
  UI while they run.
- **Browser check** at desktop and 360 px, with `[TEST-TEMP]` data cleaned up by id:
  - **As `brewer1` on the Gantt:**
    - pitch 2 bricks into a batch, then check off its Yeast harvest into YB1. The dialog prefills
      gen 1, and the Count task appears;
    - a second harvest on that batch defaults to YB1 → "Harvest on top";
    - un-check it (allowed), then add a count and try to un-check the first (refused).
  - **As `breweryDevice` with `brewer2`'s staff code:** check off a Yeast harvest on the board. It
    shows "· on Brewhouse tablet". A bartender's code gets "can't do this here".
  - **A harvest into a dirty brink** asks the dirty question.
  - **The batch page** shows the pitches and both pulls.
- **Reply with:** commits, counts before and after, rule → test with revert proofs, and `LEAD:`
  notes.
