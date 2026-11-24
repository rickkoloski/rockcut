# D64: Yeast, brinks, harvests and cell counts — Plan

2026-11-22 · lead. **Spec:** `specs/d64_yeast_harvests_spec.md` (approved by Matt 2026-11-22: "write
the plan and continue to the builder"; Q1, A2, A5, A7, A13–A15 answered, the rest as written).
**Branch:** `d64-yeast-harvests`, from `develop` @ `cc58b81`. The builder works in `~/src/rockcut`.

## Where things are (D65, as built)

**Catalog** (`lib/rockcut_api/ingredients/catalog.ex`):
- `@managed` is every key but `yeast` and `future`;
- `forms/1`, `units/1`, the pack lists, `@default_packs` per unit and `manufacturer_required?/1`
  (grains, hops) live here;
- `unit_label/2` makes a Tablet's `each` read "tablets".

**Products** (`product.ex`, `products.ex`):
- `name` is free text (Whirlfloc's is "T"), and `display_name/1` builds "Ingredient Name ·
  Maker";
- the unique index is case-insensitive on name (`20261121140001`);
- `lock_version` is enforced.

**Movements** (`movement.ex`):
- kinds `opening received used traded_out traded_in loaned_out loaned_in count`;
- there's **no batch link** yet;
- Oldest first and `BEGIN IMMEDIATE` are in `inventory.ex`.

**Features:** `category_feature_types` has `product_mode`, `lot_mode`, `lot_required`, `only_unit`
and `only_form` (D65). `feature_types` rows carry the range and decimals.

**Parties:** the roles are `manufacturer supplier partner_brewery` (`party_role.ex`). There's **no
new role** (spec §4.2). Grain screens relabel the manufacturer as "Maltster"; yeast screens use
"Lab".

**Production check-off:**
- `Steps.complete/4` (`production/steps.ex`) takes `complete_fields/0` (`done_on batch_number answer
  result fail_action retest_days`), with a `preview: true` mode that returns what the dialog needs.
  D56's `has_result` (`needs_result`) is the model for adding inputs to a check-off.
- `Steps.uncomplete/1` reverses it.
- Callers:
  - `production_schedule_controller.ex` (~345, ~379), wrapped in `Undo.track` (`tracked/4`);
  - `task_board_controller.ex` (~380–392), for the linked task, including the brewhouse device
    with a staff code (D50);
  - in the UI: `pages/production/Gantt/StepDialog.tsx`, `flows.tsx`, `GanttGrid.tsx`,
    `BatchDialog.tsx`, `EntryDialogs.tsx`, and `pages/tasks/LinkedTaskDialog.tsx` and
    `TaskCard.tsx`, sharing `lib/testResults.ts`.
- **Undo** (`production/undo.ex`) puts back rows in `@order` tables only (batches, vessels, steps,
  links, outages, sign-offs, condition marks). **Tasks and anything else aren't tracked**; linked
  tasks follow through `TaskLink.sync!`.

**Step types** (`step_type.ex`):
- `@behaviors ~w(plain brew set_temp transfer split cip package)`;
- a built-in type is any behavior but `plain`, and can be renamed but not retired;
- "Yeast harvest" is seeded `plain` in `20261020120003`;
- `Steps.pre_brew_kind?/1` treats only `plain` (and custom-named) steps as possible pre-brew steps.

**Tasks** (`tasks/task.ex`):
- `production_step_id` links a step's task, and TaskLink inserts with
  `Tasks.next_position(brewery_id, due_on)`;
- `TaskLink.sync!` only touches tasks **with** a `production_step_id`, so yeast tasks (none) are
  safe from it.

**Seeds:** `priv/repo/seeds.exs` still seeds the Yeast Strains custom fields (Lab, Product Code,
Temp Range Low/High, Form "Dry, Liquid, Slurry") and US-05, WLP001, Wyeast 1056 and WLP002. The
reference seeds are `priv/repo/seeds/{grain,hop,d65}_reference.exs`, idempotent, run through
`Release.seed/0`.

## Shape

### Catalog and products

- **Managed:** `@managed` adds `yeast`.
- **Forms:** `forms("yeast") = ["Dry", "Liquid"]`.
- **Units:** `units("yeast") = ["each"]`.
- **Packs:** pack names `brick pitchable case`. Add `brick` and `pitchable` to `@pack_names`.
- **Default pack** by form: Dry → brick, Liquid → pitchable.
- **`unit_label`:** Dry `each` → "bricks", Liquid `each` → "pitchables" (the "brick" / "pitchable"
  singular where the UI already singularizes "tablet").
- **The manufacturer:** `manufacturer_required?("yeast") = true`. The UI labels it **"Lab"** on
  yeast screens (one helper, like "Maltster").
- **Whole numbers:** the `each` sentence reads "US-05 is counted in whole bricks" or "… whole
  pitchables".
- **No children:** Add subcategory and Add field are hidden on Yeast Strains, and the API returns
  422, as on Hops.
- **The product name is the Strain ID** (A1). There's no new column.

### Migrations (all additive or tidy-ups; `202611221200NN`)

1. **`yeast_strain_types`:**
   - `name` (unique, case-insensitive), `position`, `retired_at`;
   - seeded with Ale, Lager, Brett and Lacto;
   - add **`ingredients.yeast_strain_type_id`** (nullable, `on_delete: :restrict`).
2. **Features:**
   - feature types `ferm_temp_f` (°F, 32–100, 0 dp), `attenuation_pct` (%, 0–100, 0 dp) and
     `pitch_bbl` (bbl, 0.5–60, 1 dp);
   - Yeast Strains rows:
     - temp: product range, lot none;
     - attenuation: product range, lot none;
     - pitch size: product value **optional**, lot **copy** (prefilled when the product has one),
       **`lot_required`**, **`only_form: "Liquid"`** (spec amendment 6).
3. **Yeast category tidy-up:**
   - delete the five old Yeast Strains field definitions;
   - delete WLP001, Wyeast 1056 and WLP002 where they have no products, lots or recipe lines
     (logged "D64: kept …" otherwise);
   - **stop** if a yeast lot has no product.
   - The US-05 → Chico Ale rename is done by the **seed**, not here, as D65 did with Dextrose.
4. **`inventory_movements.batch_id`:** nullable, references `batches`, `on_delete: :restrict`.
   It's written only for yeast pitches in D64.
5. **`yeast_brinks`:**
   - `name` (unique on `lower(name)`), `empty_weight_lb` (decimal, nullable), `position`,
     `active`, `dirty` (bool), `dirty_since` (date), timestamps;
   - YB1–YB4 seeded, clean.
6. **`yeast_harvests`** (a brink's contents, spec §4.5):
   - `brink_id`, `status` (`in_brink` / `emptied` / `voided`), `generation`, `coferment` (bool),
     `emptied_on`, `notes`, `lock_version`, timestamps;
   - a **partial unique index** on `brink_id WHERE status = 'in_brink'` (one open record per
     brink).
7. **`yeast_harvest_products`** (`harvest_id`, `product_id`, unique pair): the record's strains as
   they stand now.
8. **`yeast_harvest_entries`:**
   - `harvest_id`, `kind` (`harvested pitched dumped adjusted`), `quantity_lb` (signed decimal,
     2 dp), `occurred_on`;
   - `batch_id` (nullable) and `production_step_id` (nullable, unique where not null: one harvest
     per step check-off);
   - **snapshots:** `generation` and `product_ids` (JSON). For `harvested`, these are what the pull
     brought; for `pitched`, what the brink was at that moment. Pitches need the snapshot because
     a later harvest on top can change the brink's generation;
   - `note`, `entered_by_id`, `device_id`, `inserted_at`.
9. **`yeast_counts`:**
   - `harvest_id`, `counted_on`, `viable_millions_per_ml` (1 dp, > 0), `viability_pct` (1 dp,
     0–100);
   - `note`, `entered_by_id`, timestamps.
10. **Tasks:** add `tasks.yeast_brink_id` (nullable, references `yeast_brinks`, `on_delete:
    :nilify_all`) and `tasks.yeast_kind` (`recount` / `clean`, nullable), with a partial unique
    index on `(yeast_brink_id, yeast_kind) WHERE completed_at IS NULL AND yeast_kind IS NOT
    NULL`.
11. **Production steps:** add `production_steps.yeast_outcome` (`harvested` / `dumped`, nullable)
    and `yeast_note` (text).
12. **Step type:**
    - add `yeast_harvest` to `@behaviors`;
    - the migration sets `behavior = 'yeast_harvest'` and `built_in = true` on the type whose
      `lower(name) = 'yeast harvest'` and that isn't retired;
    - **stop** (raise, nothing changed) when there's no such type, naming what it found (A10);
    - log any **pre-brew** template step or batch step of that type: a harvest step can't be
      pre-brew once it isn't `plain`.

### Domain: `RockcutApi.Yeast` (new context, `lib/rockcut_api/yeast/`)

- **`Rules`:** pure functions, the heart of §5.3. Unit-test it exhaustively:
  - `from_sources(sources)`: sources are `[%{product_ids, generation}]`, Mother = generation 0.
    It returns `%{product_ids, generation, coferment}`:
    - one strain: max + 1;
    - two or more distinct products: co-ferment, gen 1;
    - a co-ferment alone: gen + 1;
    - a co-ferment + a product not in it: a new co-ferment, gen 1.
  - `combine(brink, incoming)`:
    - same product set and same gen: unchanged;
    - same set, different gen: the max;
    - different sets: a co-ferment of the union, gen 1.
  - **The brink's state** (generation, strains, co-ferment) is **a fold of its `harvested`
    entries in id order** through `combine`, cached on `yeast_harvests` and
    `yeast_harvest_products`. It's recomputed on every write, so un-checking a harvest on top
    simply refolds (§5.4).
- **`Brinks`:**
  - list with state: empty / dirty / contents, on hand, count in effect, "Recount due", sources;
  - CRUD for settings (managers and owners);
  - retire refused while there's yeast ("YB2 still has yeast in it"); delete only with no history.
- **`Harvests`:** every write runs in **one `BEGIN IMMEDIATE` transaction** (D60's pattern), checks
  on hand ≥ 0 ("YB2 has 18 lb", 422), and bumps `lock_version`.
  - `harvest!(attrs, actor, opts)`:
    - **dirty** brink without `dirty_ok` → `{:yeast_question, :dirty, brink}`;
    - **open record** without `brink_answer` → `{:yeast_question, :has_yeast, brink}`;
    - `brink_answer: "empty"` → an `adjusted` entry to 0 ("Emptied when the 11/22 harvest went
      in"), closed `emptied`, **not** dirty, no clean task;
    - then insert or append the `harvested` entry, refold, and open the recount task;
    - recording anyway clears `dirty`.
  - `pitch!`, `dump!` and `adjust!`: each closes at 0 → `emptied`, `emptied_on`, the brink
    `dirty` + `dirty_since`, and the clean task.
  - `unrecord_step!(step_id)`:
    - **refused** when any `pitched` entry or count on that record was inserted after the step's
      entry: `{:yeast_locked, brink}` → 409 "YB2 has been pitched from or counted since this
      harvest. The harvest can't be un-checked.";
    - otherwise it deletes the entry, then refolds, or voids the record if it's now empty of
      `harvested` entries;
    - it deletes the open recount task it added if no other harvest needs it;
    - a `dumped` outcome just clears the step columns.
- **`Counts`:**
  - `in_effect(harvest, on_date)`: the latest `counted_on ≤ date`, ties to the latest id;
  - add ticks the brink's open recount task;
  - edit or delete by the maker or a Brewery manager, until a `pitched` entry dated on or after
    it.
- **`Pitches`:**
  - from a brink: lb ≤ on hand, the batch is required, and the date can't be in the future;
  - from purchased yeast: a `used` movement with `batch_id`, through `Inventory`'s Oldest first
    when no lot is picked, in whole units.
- **`Generations.for_batch(batch_id)`:** what was pitched into a batch, as sources:
  - lot movements (`used`, `batch_id`, yeast product) are gen 0 for their product;
  - `pitched` entries carry their snapshot;
  - `Rules.from_sources/1` turns them into the dialog's defaults;
  - no sources means `nil`, and the dialog asks (A5).
- **`BoardTasks`:**
  - `open!(brink, kind, due_on)`: idempotent through the partial unique index. Brewery board,
    title "Count YB2" / "Clean YB2", unassigned, `position: Tasks.next_position/2`;
  - `tick!(brink, kind, actor)`;
  - **hook into the task-completion path** (`Tasks`): ticking a `clean` task clears the brink's
    `dirty`; ticking a `recount` task does nothing else. Un-ticking the latest Clean task dirties an empty brink (decisions 3; first planned as no change).

### The step check-off

- **Inputs:** `Steps.complete_fields/0` adds flat params (CLAUDE.md "flat"):
  - `yeast_outcome` (`harvested` / `dumped`);
  - `yeast_brink_id`, `yeast_lb`, `yeast_product_ids`, `yeast_generation`;
  - `yeast_brink_answer` (`on_top` / `empty`), `yeast_dirty_ok`, `yeast_note`.
- **Preview:** `Steps.complete(preview: true)` for a `yeast_harvest` step adds:
  - `needs_yeast: true`;
  - `yeast: %{brinks: [...state...], default_brink_id, defaults: Generations.for_batch(...),
    products: [yeast products for the picker]}`.

  The default brink is the brink this batch's earlier harvest went into, when it's still open.
  This is how the **device** gets the brinks without yeast routes (spec §8).
- **The write:**
  - `complete/4` on a `yeast_harvest` step requires `yeast_outcome` (`:yeast_required`);
  - `harvested` calls `Harvests.harvest!` **inside the same transaction**;
  - a `{:yeast_question, …}` rolls back to a 409 the dialog turns into the question, then resends
    with the answer, as `answer_required` does;
  - the step gets `yeast_outcome` and `yeast_note`.
- **Who:** the actor is the person, or the acting staff-code person on a device. That person must
  pass `Authz` for ingredients **edit**. Otherwise it's the D50 "can't do this here" refusal, not
  counted against the code. Entries get `device_id` from `actor.on_device_id`.
- **Un-check:** `uncomplete/1` calls `Harvests.unrecord_step!/1` first (refusal → 409).
- **Undo:**
  - an Undo whose put-back flips a `yeast_harvest` step from done to not done calls
    `unrecord_step!` in its transaction, and refuses with the same 409;
  - an Undo that would flip one **back to done** (undoing an un-check) is **refused**: "Check it
    off again to record the harvest." Yeast rows aren't tracked, so it can't be put back
    faithfully.
  - Add both to `Undo`'s put-back, with tests.
- **`pre_brew_kind?/1`** stays `plain`-only, so a harvest step is never pre-brew.

### Authz

- **Yeast routes:** use the existing ingredients area (Brewery members and owners; devices 403).
- **New `:yeast_settings` (manage):** Brewery managers and owners. It covers brinks and strain
  types.
- **Entry and count edits:** the maker or a Brewery manager (`Authz` check, not inline).
- Add both to the D31 parity/boundary tests.

### API routes (flat params)

| Route | What |
|---|---|
| `GET/POST/PUT/DELETE /api/yeast/strain_types` | settings (manage) |
| `GET/POST/PUT/DELETE /api/yeast/brinks` | list with state (read); settings writes (manage) |
| `GET /api/yeast/brinks/:id/history` | records, entries, counts |
| `POST /api/yeast/brinks/:id/pitch` · `/dump` · `/adjust` · `/clean` | stock actions |
| `POST/PUT/DELETE /api/yeast/counts` | counts |
| `POST /api/ingredient_products/:id/pitch` | from purchased yeast (lot optional) |
| `GET /api/yeast/batches/:id` | the batch page's Yeast section: pitched (lots + brinks), harvested (entries + dumped steps) |

### UI

- **Library and product pages:** Yeast Strains uses the hop list layout:
  - columns per spec §6.1, including Strain Type;
  - filters: lab, supplier, form, type, on hand only;
  - "Lab" for the manufacturer;
  - Strain Type picker in the ingredient dialog;
  - pitch size on Liquid (product optional, lot required);
  - **Pitch** on the product page (lot optional).
- **Brinks tab:** a new tab beside Ingredient Library / Purchasing:
  - cards at phone width, rows on desktop;
  - actions per spec §6.3 (Pitch, Add count, Adjust weight, Dump brink, Mark clean, History);
  - empty weight shown beside every lb field.
- **Yeast settings:** the gear (`SettingsGear`) with Brinks and Strain types; read-only for
  non-managers.
- **`HarvestDialog`:** one shared component, used from `StepDialog`/`flows` (Gantt) and
  `LinkedTaskDialog`/`TaskCard` (board and device):
  - Harvest yeast / Yeast dumped;
  - brink picker with states, yeast weight with the empty weight beside it, strains and
    generation (prefilled; asked when null), note;
  - the two questions as `ConfirmDialog`s: "Record anyway / Cancel" and "Harvest on top / This
    brink is empty";
  - one press at a time.
- **Batch page:** `BatchDetail.tsx` gets a **Yeast** section (spec §6.6).
- **Gap 9:** an empty order line reads "Packs" / "$ / pack", or "Sacks" for a sacks-only supplier.
  It shares one helper with gap 7's `runningTotal` summary (`lib/purchasing.ts`), per
  `prompts/d65_lead_decisions_5.md`.

### Seeds

**`priv/repo/seeds/d64_reference.exs`** (every environment, idempotent by name; embeds
`docs/current_work/reference/d64_yeast_matt_2026-11-22.csv`):
- **Companies:** Inland Island (manufacturer + supplier), Fermentis (manufacturer), White Labs
  (manufacturer + supplier). BSG is reused.
- **Strains:** 11 ingredients with their Strain Type. Existing **US-05** is renamed **Chico Ale**.
- **Products:** 11, named by Strain ID, Dry or Liquid, unit `each`. No temps or attenuation were
  given, so they're left blank.
- **Offers:** 11.
  - Dry: `brick · 1` with the note "500 g".
  - Liquid: `pitchable · 1`.
  - **US-05 and S-04 are $76.99**, effective 2026-11-22. The rest have no price.
- **No lots.**
- **The seed log reads** `D64 reference: 3 companies, 10 new ingredients, 11 new products, 11 new
  offers, 2 new prices`, assuming US-05 exists (renamed, so 10 are new), and 0 new on a second run.

**`seeds.exs`** stops seeding the Yeast Strains fields and WLP001, Wyeast 1056 and WLP002, and
seeds "Chico Ale" in place of US-05, so a fresh database matches.

**Synthetic `[SEED]` data** (DEV and local, spec §10):
- `[SEED] Dry Ale` (Dry) and `[SEED] Liquid Ale` (Liquid, 7 bbl), each with a lot, an offer and a
  minimum;
- a batch with a Yeast harvest step due today, and one already done;
- YB2 holding 42 lb `[SEED] Dry Ale` gen 2 with a count 3 days back;
- YB3 empty and dirty, with its "Clean YB3" task.

## Stages and stops

1. **Stop 1: yeast products, strain types, pitch from a lot, gap 9.**
   - Migrations 1–4;
   - Catalog, product rules and labels; Strain Types (settings and picker);
   - the library, product page and dialogs; Pitch from purchased yeast (`batch_id` movements);
   - gap 9;
   - `d64_reference.exs` and the `seeds.exs` tidy-up, so the screens have real data;
   - grain, hops and D65 stay green (ExUnit ×2, the `ingredients` Playwright project).
2. **Stop 2: brinks, records, counts, board tasks.**
   - Migrations 5–10, `RockcutApi.Yeast` (`Rules`, `Brinks`, `Harvests` without the step,
     `Counts`, `Pitches`, `BoardTasks`), the Authz additions and routes;
   - the Brinks tab with every action, and Yeast settings;
   - a temporary "Record harvest" button on the Brinks tab is **not** built; harvests come only
     from the step (Stop 3). Stop 2 tests create them through the context.
3. **Stop 3: the step.**
   - Migrations 11–12;
   - the `complete`/preview/uncomplete/Undo changes, `Generations`, `HarvestDialog` on the Gantt,
     the board and the device;
   - the batch page's Yeast section.
4. **Stop 4: `[SEED]` data, COVERAGE, gate prep.**
   - the synthetic data, and Playwright for spec §13;
   - COVERAGE;
   - then the lead runs the full suite, local QA (360 px, slow network, two people on one brink) →
     DEV.

## Risks

- **The check-off path is shared** with D47–D56 (batch numbers, retests, splits, board, device).
  Add yeast as one more optional branch keyed on the behavior. Run the production and tasks
  Playwright projects at Stop 3, not only `ingredients`.
- **Undo:** yeast rows aren't tracked. The two put-back rules (refuse when locked, refuse a re-check)
  must be tested through the controller, including the 2-minute token and `undo_not_yours`.
- **Generation folding:** the rules interact (on top + co-ferment + un-check). `Rules` is pure.
  Give it a table-driven ExUnit covering every row of spec §5.3, plus refold after un-check.
- **Concurrency:** two people pitching the last lb, or harvesting into one brink at the same time.
  Use `BEGIN IMMEDIATE` plus the partial unique index, and give the loser a 409/422 with nothing
  written.
- **The step-type migration on prod:** if Matt renamed "Yeast harvest" there, the migration stops
  (A10). The lead checks with a read-only query before the release:
  `SELECT id, name, behavior, retired_at FROM production_step_types WHERE lower(name) LIKE
  '%harvest%';`.
- **Release:** rollback is API v44 / UI v40. Take a snapshot before the API deploy anyway: the
  step type's behavior changes, and new tasks reference `yeast_brinks`.
