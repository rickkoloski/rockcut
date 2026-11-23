# D64: Yeast, brinks, harvests and cell counts — Spec

**Status:** APPROVED (Matt, 2026-11-22: "write the plan and continue to the builder"). Scoping was
done in chat on 2026-11-19 and 2026-11-22. The decisions are in §2. Q1, A2, A5, A7 and A13–A15 are answered; A1, A3, A4
(amended), A6 and A8–A12 stand unless Matt changes them.
**Series:** D60 grain → D61 purchasing → D62 packs + hops → D65 → **D64** → D63 recipes on
products. Next new ID: D66.
**Branch:** `d64-yeast-harvests`, cut from `develop` @ `cc58b81`.

## 1. Why

Yeast is the last ingredient category that isn't on the D60–D65 model. It also has a life the
others don't. Yeast bought from a lab (the **Mother**) is pitched into a batch. It's then
**harvested** into a yeast brink, counted, and pitched into the next batch, a generation older
each time. D63 (recipes and brew-day drawdown) needs to know what yeast is on hand, where it is,
which generation it is and how healthy it is.

D64 does three things:
- it puts purchased yeast on the product model;
- it tracks harvested yeast as stock in **brinks** (YB1–YB4);
- it records harvests from the existing **Yeast harvest** production step.

It keeps the Len Silverston UDM concepts: Party Role (manufacturer and supplier, as for every ingredient), Product, Supplier
Product (offer), Inventory Item (lot, and now brink contents) and Product Feature.

## 2. Decisions (Matt, 2026-11-19 and 2026-11-22)

**Purchased yeast**
1. **Product = lab + strain + form**, with the lab's **product code** (WLP001, US-05). The lab is a
   company with the existing **manufacturer** role (Fermentis, White Labs, Wyeast), labelled **"Lab"**
   on yeast screens, as grain screens say "Maltster". The lab is sometimes also the supplier, and
   sometimes yeast is ordered through a different supplier (Matt, 2026-11-22).
2. **Dry and liquid** are both used. They're bought and used as **whole units**: dry = 500 g
   **bricks**, liquid = "X bbl **pitchables**" (usually 7 bbl; the size can vary).
3. **Specs:** a temperature range and attenuation. **No expiry.**
4. **D61 purchasing applies** (offers, packs, orders, receiving, minimum on hand, To order,
   Totals). Contracts stay grain and hops only.
5. **Permissions** are the same as grain: Brewery members and owners. Devices are refused, except
   for recording a harvest from the step (decision 13).
6. **New yeast reference data** replaces the old seeded yeast (Q1).

**Brinks**
7. **YB1–YB4 are seeded.** The list is **editable in the yeast settings** (the gear on the yeast
   pages), not in Production setup.
8. Each brink stores its **empty weight**. Brewers weigh the yeast and **type the yeast weight
   only**. The app does no subtracting; it shows the empty weight beside the field for reference.

**Harvested yeast**
9. **Harvested yeast is on-hand stock, in lb.** Pitching draws it down.
10. **A harvest is recorded from the Yeast harvest step** when it's checked off. That's on the
    Gantt, the Brewery board (its linked task) and the brewhouse device.
11. **Checking off the step offers "Yeast dumped"** instead of a harvest, and either way takes a
    **note**.
12. **No un-check** once anything has been pitched or counted from that harvest.
13. **The brewhouse device** may record the harvest with a staff code. The rest of the yeast
    pages stay closed to devices.
14. **Generations:** lab yeast is the **Mother**. A harvest from a batch pitched with Mother is
    **gen 1**, and each harvest after that adds 1. A batch pitched from two sources takes the
    **higher generation + 1** (editable).
15. **Co-ferments:** a batch pitched with **two or more different strains** gives a
    **co-ferment**. It lists every strain ("Co-ferment: US-05 + WLP002") and **starts a new
    generation 1**. Each repitch adds 1 as usual.
16. **What goes into a brink:**
    - A second harvest from the same batch may go to a **different brink**.
    - Into a brink that already has yeast:
      - **same strain, same generation:** the weight goes up (from another batch, note both
        batches);
      - **same strain, different generation:** take the **higher** generation and note the other
        batch;
      - **different strain:** a **co-ferment** (decision 15), noting both generations and batches.
    - Each harvest pull shows on its batch. On the brink, the weight simply goes up.
17. **Harvesting on top is rare.** Harvesting into a brink that still shows yeast asks "YB2 shows
    yeast in brink. Do you want to harvest on top or is this brink empty?" with a button for each.
18. **Cell counts:** count date, viable cells per mL (millions) and viability %.
    - A brink can be **recounted**.
    - The count used for a batch is **the latest on or before the day it's used**.
    - Adding yeast **schedules a recount**: a Brewery board task **due the harvest day**, which
      brewers can move. The recount isn't required before use; until one is done, the last count
      stays in effect.
19. **Pitching** gets no Gantt step and no board task. It becomes part of the brew-day process in
    D63. D64 records it with a plain **Pitch** action (§6.4).
20. **Removing yeast:** a brink can be **dumped entirely**, or have its **weight adjusted**. When
    it's **fully emptied**, it drops off the stock list and is **marked dirty**, and a Brewery
    board task **"Clean YB2"** is added for that day.
21. **A dirty brink doesn't block a harvest.** The app asks "YB2 is marked as dirty, record harvest
    anyway?"
22. **Carry-in, D65 DEV QA gap 9:** an order line with no offer reads "Sacks" / "$ / sack"
    (`prompts/d65_lead_decisions_5.md`).

## 3. What D60–D65 already give D64

These need no new design. D64 turns them on for yeast and tests them there.
- **Products:**
  - ingredient → product (manufacturer + form + unit);
  - `lock_version` (409, refetch before retry);
  - the duplicate sentence;
  - "Other manufacturer…";
  - unit and form locked once a product has a lot.
- **Purchasing:**
  - offers with packs and prices, and `pack_note`;
  - orders, receiving (previous lot / new lot # / split);
  - minimum on hand, To order, Totals with per-unit subtotals;
  - an existing lot # read-only.
- **`each`:** whole numbers everywhere, and a per-form label (D65 "tablets").
- **Lots and movements:** Oldest first, counts total or by lot, "Counted, no change", Expired by
  hand, trades, lot value at the last price paid.
- **Features:** product ranges, lot modes (none / copy / enter).
- **Production:** a check-off on the Gantt and on the linked Brewery task (D49), staff codes on the
  brewhouse device (D50), Undo of a check-off.

## 4. Data model

### 4.1 Category, forms, units, packs (`Ingredients.Catalog`)

- **Yeast Strains** (`yeast`) becomes **managed**. `managed?` covers everything but `future`.
  Yeast has no children: Add subcategory is hidden, and the API refuses it (422), as on Hops.
- **Old custom fields** (Lab, Product Code, Temp Range Low/High, Form "Dry, Liquid, Slurry") are
  deleted and no longer seeded, as D60/D62/D65 did. **Add field** is hidden, and the API refuses
  it. "Slurry" goes: a harvest takes its place.

| Form | Unit | Label | Pack names |
|---|---|---|---|
| Dry | each | bricks | brick, case |
| Liquid | each | pitchables | pitchable, case |

- Whole numbers only, as for D65 `each`. The API refuses a fraction (422 "US-05 is counted in
  whole bricks").
- The form sets the unit's label (as a Tablet fining reads "tablets"). The stored unit stays
  `each`.
- **Product name = the lab's code** (A1). The product reads "California Ale WLP001 · White Labs",
  as Whirlfloc's reads "Whirlfloc T". Search matches the code.
- **Strain = the product, by its Strain ID** (A2, Matt 2026-11-22). "Different strains" in
  decisions 15–16 means **different products**: Dry Chico II-1001D and Chico Ale US-05 are
  different strains, so pitching both makes a co-ferment. The ingredient carries the strain name and
  Strain Type.

### 4.2 Lab = manufacturer

**No new role.** A yeast product's lab is its **manufacturer**, and the companies it's bought from
are **suppliers** on its offers, exactly as for grain and hops. Yeast screens label the manufacturer
**"Lab"**. A lab that also sells direct (White Labs) holds both roles, and yeast ordered through BSG
has BSG as the supplier. The manufacturer is **required** for yeast, as for grain and hops (A3).

### 4.3 Features

New feature types:

| Key | Label | Unit | Range | Decimals |
|---|---|---|---|---|
| `ferm_temp_f` | Fermentation temp | °F | 32–100 | 0 |
| `attenuation_pct` | Attenuation | % | 0–100 | 0 |
| `pitch_bbl` | Pitch size | bbl | 0.5–60 | 1 |

| Feature | Product | Lot | Notes |
|---|---|---|---|
| Fermentation temp | range (low–high) | none | |
| Attenuation | range (low–high) | none | |
| Pitch size | value (Liquid only) | copy, editable | A pitchable is "usually 7 bbl; the size can vary": the product holds the usual size, and each lot keeps its own (A4). |

No expiry, and no best-by. Expired by hand works as for every category.

### 4.4 Brinks (new)

`yeast_brinks`:
- `name` (unique, case-insensitive, e.g. "YB2");
- `empty_weight_lb` (optional, 2 dp, > 0);
- `position` and `active`;
- `dirty` (with `dirty_since`).

- **Seeded:** YB1–YB4, clean, with no empty weight. Matt enters the weights in the yeast settings.
- **A brink can't be retired** while it holds yeast (422 "YB2 still has yeast in it").
- **Deleting:** a brink with no history can be deleted. Once it has history, it can only be
  retired.

### 4.5 Brink contents: the yeast in a brink (new)

The yeast in a brink is **one record**. It runs from the first harvest into an empty brink until
the brink is emptied. The working name is `yeast_harvests`; the plan picks the names.

**Fields:**
- `brink_id`;
- `strains`: one or more yeast **products** (Strain IDs), two or more meaning a co-ferment;
- `generation`: 1 or more;
- `notes`;
- `status`: `in_brink`, `emptied` or `voided` (`voided` is an un-checked harvest, §5.4);
- `emptied_on`;
- `lock_version`.

**On hand** is the sum of its entries.

**Entries** (`yeast_harvest_entries`, one row each, never edited in place):

| Kind | Quantity | Has |
|---|---|---|
| `harvested` | + lb | date, source **batch**, source **step** (when from the step), the source's strain(s) and generation, note |
| `pitched` | − lb | date, **batch**, note |
| `dumped` | − lb (the rest) | date, note |
| `adjusted` | ± lb, to the weight typed | date, note |

- Each entry has who entered it, and the device when there was one (D50's "· on <device>").
- **On hand can't go below 0** (422 "YB2 has 18 lb"). It reaches 0 by a pitch of the rest, a dump
  or an adjustment to 0.
- **At 0, the record closes:** its status becomes `emptied`, the brink is **marked dirty**, and a
  **"Clean YB2"** task is added (§7). It leaves the stock list, but stays in history and on its
  batches.
- **A brink holds one open record at a time**, which is the lead's reading of decision 16.
  Harvesting into a brink with yeast either adds to that record (on top) or closes it first
  (empty), per decision 17.
- **Sources:** each `harvested` entry keeps its batch, strains and generation. So the record can
  show "From #41 (gen 2) and #44 (gen 3)" without a separate notes field. That covers "note both
  batches" and "note both generations".

### 4.6 Pitches from purchased yeast (Mother)

Pitching a brick or pitchable into a batch is a lot **`used`** movement, as today, plus the
**batch** it went into. That's a new nullable `batch_id` on movements, set only for yeast pitches
in D64. D63 will use it for every brew-day draw.

### 4.7 Cell counts (new)

`yeast_counts`:
- `harvest_id`;
- `counted_on`, which can't be in the future;
- `viable_millions_per_ml` (> 0, 1 dp);
- `viability_pct` (0–100, 1 dp);
- note, and who entered it.

- **The count in effect** on day D is the latest with `counted_on` ≤ D. Ties go to the latest
  entered.
- A count can be edited or deleted by its maker or a Brewery manager until something is pitched
  after it.
- **Since the last harvest:** a count taken before the latest harvest into the brink still applies
  (decision 18). The screen marks it: "Counted 11/18 · before the 11/20 harvest".

### 4.8 The Yeast harvest step

- **The step type gets a behavior.** The seeded **Yeast harvest** step type (migration
  `20261020120003`, behavior `plain`) gets a new behavior, `yeast_harvest`, and becomes **built in**.
  Like every built-in type, it can be renamed but not retired.
- **Finding it:** the migration finds the type by its seeded name (case-insensitive). If it was
  renamed or retired on an environment, the migration stops with a message, and Matt names the one
  to use (A10).
- **Templates and batches:** templates and batches that already have the step keep it, with no data
  change.
- **The check-off record:** the step's harvest is stored as its entry's `production_step_id`. A
  "Yeast dumped" check-off stores the outcome and the note on the step: new `yeast_outcome`
  (`harvested` / `dumped`) and `yeast_note` columns.

## 5. Recording a harvest

### 5.1 Where

Checking off a **Yeast harvest** step opens the **Harvest dialog** before it saves. This happens in
three places:
- on the Gantt;
- on its linked task on the Brewery board (D49 two-way);
- on the brewhouse device, as the acting staff-code person (decision 13).

The check-off and the harvest are written in **one transaction**. If either is refused, nothing is
written.

### 5.2 The Harvest dialog

The dialog has two choices, **Harvest yeast** and **Yeast dumped**. Both take a **note**.

**Harvest yeast:**
- **Date:** the check-off's `done_on`.
- **Batch:** the step's batch, shown, not editable.
- **Brink:**
  - a picker of the active brinks, each showing its state: "YB1 · empty", "YB2 · 42 lb US-05
    gen 2", "YB3 · dirty";
  - for a second Yeast harvest on the same batch, it defaults to the brink that took the first.
- **Weight:** lb, > 0, 2 dp, labelled "Yeast weight (lb)". The brink's empty weight shows beside it:
  "YB2 empty: 148 lb". Brewers type the yeast weight only (decision 8).
- **Strain and generation:** filled from what was pitched into the batch (§5.3).
  - Both can be edited.
  - When nothing was recorded as pitched, the dialog asks for the strain(s) and the generation,
    with Mother → gen 1 as the default for a lab strain (A5).

**Yeast dumped:** only the note. No brink, weight or stock change. The batch shows "Yeast dumped"
with the note.

**Questions on Save** (one at a time, then save):
1. **A dirty brink:** "YB2 is marked as dirty, record harvest anyway?" (Record anyway / Cancel).
   Recording anyway clears the dirty mark; the open "Clean YB2" task stays on the board.
2. **A brink with yeast in it:** "YB2 shows yeast in brink. Do you want to harvest on top or is
   this brink empty?"
   - **Harvest on top:** combine it, per §5.3.
   - **This brink is empty:** first close the old record with an `adjusted` entry to 0 lb
     ("Emptied when the 11/22 harvest went in"), then start a new record. This adds **no** clean
     task and doesn't mark the brink dirty, since it's being filled (A6).

### 5.3 Generation, strain and co-ferment

**From the batch's pitches.** The harvest's strain(s) and generation come from what was pitched
into the source batch:

| Pitched into the batch | Harvest |
|---|---|
| Lab yeast (Mother) of one strain | that strain, **gen 1** |
| One harvest of strain S, gen n | S, **gen n + 1** |
| Several sources, **one strain**, gens a, b | that strain, **max(a, b) + 1** (Mother counts as 0) |
| Sources with **two or more strains** | **co-ferment** of all the strains, **gen 1** |
| A co-ferment harvest, gen n, alone | the same co-ferment, **gen n + 1** |
| A co-ferment plus another strain not in it | a new co-ferment (all strains), **gen 1** |

**Harvesting on top** of yeast already in the brink:

| Brink holds | Harvest brings | Result |
|---|---|---|
| strain S, gen n | S, gen n (any batch) | weight goes up; still gen n |
| S, gen n | S, gen m ≠ n | weight goes up; **gen max(n, m)** |
| strains A | strains B ≠ A | **co-ferment** of A ∪ B, **gen 1** |

- The brink's record lists every source with its batch and generation (§4.5).
- On a co-ferment, the screen shows "Co-ferment: US-05 + WLP002 · gen 1 · from #41 (US-05 gen 3),
  #44 (WLP002 gen 1)".

### 5.4 Un-checking and Undo

Un-checking a Yeast harvest step, or Undo of its check-off:
- **Allowed while nothing has been pitched from the record or counted on it since that harvest.**
  The harvest's entry is removed.
  - If that empties a record it started, the record is **voided**.
  - If it was a harvest on top, the weight goes back down, and the generation and strains go back
    to what they were.
  - The recount task it added is deleted if it's still open.
- **Refused once a pitch or a count follows it** (decision 12): 409 "YB2 has been pitched from or
  counted since this harvest. The harvest can't be un-checked." Undo is refused the same way.
- **A "Yeast dumped" check-off** un-checks freely.

## 6. Yeast pages

Under **Brewery → Ingredients → Yeast** (Brewery members and owners), with the settings gear
(D52 `SettingsGear`).

### 6.1 Ingredient Library → Yeast Strains

The Hops/Grains list layout. Columns:
- strain;
- lab;
- code;
- form;
- on hand (bricks / pitchables);
- temp range;
- attenuation;
- suppliers with $/pack.

Filters: lab, supplier, form, on hand only.

### 6.2 Product page and dialogs

The same as hops, with the features from §4.3:
- the product dialog asks for the lab, code, form, temp range and attenuation, plus pitch size for
  Liquid;
- Add lot / Receive in whole bricks or pitchables, with the pitch size copied and editable on
  Liquid lots.

### 6.3 Brinks (stock)

A new tab, **Brinks**, with one row or card per brink in `position` order:
- **Empty brinks:** "YB1 · empty" or "YB3 · empty · dirty since 11/20".
- **Brinks with yeast:**
  - the strain(s), or "Co-ferment: …";
  - the generation and the on-hand lb;
  - the count in effect today (cells/mL, viability %, date), with "Recount due" when the recount
    task is open;
  - the sources (batches);
  - the harvest date.
- **Actions** (Brewery members and owners):
  - **Pitch** (§6.4);
  - **Add count**;
  - **Adjust weight** ("Yeast weight now (lb)", with the empty weight shown, and a note);
  - **Dump brink** (confirm, note);
  - **Mark clean** (only on a dirty brink; it ticks the open "Clean YB2" task);
  - **History**.
- **History:** a brink's records, newest first, each with its entries and counts.

### 6.4 Pitch

**Pitch** takes these fields:
- the date (today by default, never in the future);
- the batch, a picker of open batches;
- the weight in lb (≤ on hand);
- a note.

It writes a `pitched` entry. If the pitch empties the brink, §4.5's closing rules apply.

**Pitching purchased yeast** is on the yeast product page: **Pitch** on a lot takes the date, the
batch, a whole count of bricks or pitchables, and a note. It writes a `used` movement with the
batch (§4.6). Oldest first applies when no lot is picked.

### 6.5 Yeast settings (gear)

**Brinks:**
- name, empty weight (lb), order, active;
- add, rename, retire, and delete when unused.

**Strain types:** name and order; add, rename, retire, and delete when unused. Seeded with Ale,
Lager, Brett and Lacto (A13).

Only Brewery managers and owners can change these, as for production setup (A7).

### 6.6 The batch page

**Brewery → Batches → a batch** gets a **Yeast** section:
- **Pitched:** each pitch into this batch, either from a lot ("2 bricks US-05, lot F123 · Mother") or
  from a brink ("38 lb from YB2 · US-05 gen 2").
- **Harvested:** each harvest from this batch, one line per pull, even when two pulls went into one
  brink ("11/20 · 30 lb → YB2", "11/22 · 12 lb → YB2 (on top)"). A "Yeast dumped" check-off shows
  with its note.

This is how the batch "records that a second harvest took place" (decision 16).

## 7. Board tasks

D64 adds two kinds of system task to the **Brewery** board. They're linked to their brink. The plan
decides how: for example, a nullable `tasks.yeast_brink_id` plus a `yeast_kind`
(`recount` / `clean`).

| Task | Added when | Due | Title | Ticked |
|---|---|---|---|---|
| Recount | any harvest goes into a brink (new or on top) | the harvest date | "Count YB2" | by hand, or **by Add count** on that brink. Ticking it by hand doesn't need a count. |
| Clean | a brink's record closes at 0 (pitched out, dumped, adjusted to 0), except "This brink is empty" at harvest | the day it emptied | "Clean YB2" | by hand or by **Mark clean**. Either one clears the dirty mark. |

- **Unassigned.** They move, get notes and delete like any task, and the brewhouse device sees them
  as it sees board tasks.
- **No doubles:** a brink has at most **one open task of each kind**. A second harvest before the
  count leaves the one open recount task where it is.
- **Undo:** an un-checked harvest (§5.4) removes the open recount task it added.
- **History:** the board's History shows them like any task.

## 8. Permissions and devices

- **Yeast pages, Brinks, Pitch, counts and adjustments:** Brewery members and owners (decision 5),
  through `Authz`. Bartenders get 403 and no nav. The brewhouse device gets 403 on every yeast
  route.
- **Brink settings:** Brewery managers and owners (A7).
- **The Harvest dialog on the device:**
  - The check-off is already a staff-code write (D50). The harvest goes with it, attributed to the
    acting person "· on Brewery Test 1".
  - The dialog needs the brink list and states. Those come with the step (or from a
    production-scoped endpoint), not from the yeast routes.
  - A valid code from someone who can't use yeast reads "can't do this here", as in D50.
- **Edits and removals** (counts, adjustments, pitches) are made by their maker or a Brewery manager.
  The lead suggests no editing of `harvested` entries outside un-check (A8).

## 9. Backlog and carry-ins

- **Gap 9 (D65 DEV QA):** in New order and Edit order → Add line, an order line with no offer reads
  "Packs" / "$ / pack". A sacks-only supplier still reads "Sacks". It shares one helper with gap 7's
  summary (`runningTotal` in `rockcut-ui/src/lib/purchasing.ts`). Vitest covers the helper, and
  Playwright checks the empty mixed and sacks-only lines.
- Nothing else on the backlog fits D64 naturally (`backlog-fit-current-series`).

## 10. Data and release

**Migrations:**
- the feature types and category feature rows;
- `yeast_brinks` with YB1–YB4 seeded;
- the harvests, entries and counts tables;
- `movements.batch_id`;
- the yeast columns on production steps and tasks;
- the `yeast_harvest` behavior on the Yeast harvest step type;
- deleting the old yeast custom fields.

All of them add columns or tables. Rollback = API v44 / UI v40, but take a **snapshot before
release** anyway, since the step type changes behavior.

**Existing yeast data:**
- The four seeded strains (US-05, WLP001, Wyeast 1056, WLP002) are renamed and attached by the new
  seed (Q1), by name and idempotently, as D65 did.
- Any yeast ingredient in use (recipes, lots) stays, and the release notes list it.
- The migration stops if a yeast lot has no product.

**Reference data (Q1):** labs, strains, codes, forms, offers with packs and prices. It's seeded on
every environment, like D65.

**Synthetic `[SEED]` data** on DEV and local:
- one dry and one liquid product, each with a lot, an offer and a minimum;
- a batch with a Yeast harvest step due today, and one already done;
- YB2 holding 42 lb US-05 gen 2 with a count from 3 days ago;
- YB3 empty and dirty with its "Clean YB3" task.

## 11. Open question and assumptions

**Q1 (Matt): yeast reference data. Answered: see the amendment at the end.** What labs, strains, codes and forms do you use, and from which
suppliers, with pack and price? For example: "Fermentis US-05, Dry, brick 500 g, BSG, $X". Without
it, D64 seeds the three labs (Fermentis, White Labs, Wyeast) and the four strains already there as
products with no offers, and you add the rest on the screens.

**To confirm:**
- **A1:** the product **name** is the lab's code (WLP001), so it reads "California Ale WLP001 ·
  White Labs". No separate code field.
- **A2 (settled, Matt 2026-11-22):** each **product is its own strain**, by its Strain ID. Dry Chico
  II-1001D and Chico Ale US-05 pitched together make a co-ferment.
- **A3:** the lab (manufacturer) is **required** on a yeast product.
- **A4:** **pitch size** (bbl) is on Liquid products, as the usual size, and on each lot, copied and
  editable. Dry bricks have none.
- **A5 (settled, Matt 2026-11-22):** for a batch with no recorded pitch, such as an older batch or one pitched before D64, the
  Harvest dialog asks for the strain and generation. Nothing is guessed.
- **A6:** "This brink is empty" at harvest closes the old record as an adjustment to 0 with an
  automatic note. It adds **no** clean task, because the brink is being filled now.
- **A7:** brink settings (add, rename, empty weight, order, retire, delete) are for **Brewery
  managers and owners** (Matt wants adding brinks manager-only). Pitch, counts, adjust and dump are
  for every Brewery member.
- **A8:** a `harvested` entry is never edited. To fix a weight, use Adjust weight; to remove a
  harvest, un-check the step (§5.4).
- **A9:** recount and clean tasks are **unassigned**, with no reminders.
- **A10:** if the Yeast harvest step type was renamed or retired on prod, the release stops, and
  Matt names the type.
- **A11:** a harvest records **lb only**. Cells come from counts, and there's no volume.
- **A12:** a pitch from a brink is in **lb**. Cells pitched (lb × count) waits for D63's brew day.

## 12. Building it: stages

1. **Yeast products:**
   - the category, forms, units and packs;
   - the "Lab" label and features (§4.1–§4.3);
   - the library, product page, dialogs and purchasing for yeast;
   - Pitch from a lot (§4.6);
   - the reference seed (Q1);
   - gap 9.
2. **Brinks:** the settings (§6.5), records, entries and counts (§4.4–§4.7), the Brinks tab with
   Pitch, Add count, Adjust, Dump and Mark clean (§6.3–§6.4), and the board tasks (§7).
3. **The step:**
   - the `yeast_harvest` behavior and the Harvest dialog on the Gantt, board and device (§5);
   - the generation and co-ferment rules (§5.3);
   - un-check and Undo (§5.4);
   - the batch page's Yeast section (§6.6).
4. `[SEED]` data, COVERAGE, then the gate: local gate → local QA (360 px, slow network, two people
   on one record) → DEV Playwright + DEV QA.

## 13. Persona scenarios

**Products and purchasing**
- As `brewer1`:
  - add **Fermentis** as a manufacturer (shown as the lab) and order through BSG as the supplier;
  - add the strain "US-05 / Safale American" with the product **US-05**, Dry, temp 59–75 °F and
    attenuation 78–82 %;
  - add a brick offer at $X;
  - order 4 bricks and receive them. On hand reads "4 bricks".
  - Recording 1.5 bricks is refused.
- As `brewer2`:
  - add White Labs **WLP001** Liquid with pitch size 7 bbl;
  - receive a lot at 10 bbl. The lot keeps 10, and the product still says 7.
- **To order** shows US-05 when it's under its minimum. **Totals** lists bricks and pitchables in
  their own subtotal.
- **Gap 9:** a new order with no offer picked reads "Packs" / "$ / pack". A sacks-only supplier
  reads "Sacks".

**Mother → gen 1 → gen 2**
- As `brewer1`, on batch #41's product page, **Pitch** 2 bricks of US-05 into #41.
- Then check off #41's **Yeast harvest** on the Gantt:
  - YB1 empty, 30 lb, note "good slurry";
  - the dialog fills US-05 gen 1.
- YB1 shows 30 lb US-05 gen 1, and a "Count YB1" task is due today on the Brewery board.
- **Add count:** 1,200 M/mL, 92 %. The count task ticks itself.
- **Pitch** 30 lb from YB1 into #44. Then:
  - YB1 is empty and dirty, and "Clean YB1" is due today;
  - #44's harvest defaults to gen 2.

**On top, combining, co-ferment**
- **Second pull from the same batch:**
  - #44's second Yeast harvest defaults to its first brink, YB2.
  - "YB2 shows yeast in brink…" → **Harvest on top** adds 12 lb.
  - #44's batch page shows both pulls, and YB2 shows one record.
- **Same strain, different generation:** harvesting #47 (US-05 gen 4) on top of YB2 (US-05 gen 2)
  makes YB2 gen 4, from #44 and #47.
- **Different strains in a brink:** harvesting #48 (WLP002 gen 1) on top of YB2 (US-05 gen 4) gives
  "Co-ferment: US-05 + WLP002 · gen 1".
- **Different strains pitched into a batch:** a batch pitched with US-05 bricks and YB3's WLP001
  gen 2 harvests as a co-ferment gen 1. Repitching it and harvesting again gives the same
  co-ferment, gen 2.
- **The brink was really empty:** YB4 still shows 5 lb from last month. A harvest into it → **This
  brink is empty**. The old record closes at 0 with the note, and the new one starts. No clean task
  is added.

**Dirty, dumped, adjusted**
- Harvesting into dirty YB1 asks "YB1 is marked as dirty, record harvest anyway?" → **Record
  anyway**. The harvest saves, YB1 is no longer dirty, and "Clean YB1" is still on the board.
- **Dump brink** on YB2, with the note "infected": YB2 empties and is marked dirty, and "Clean YB2"
  is added.
- **Adjust weight** on YB3 from 40 to 33 lb with a note. Adjusting to 0 empties it, as a dump does.
- Ticking "Clean YB2" on the board clears YB2's dirty mark. So does Mark clean on the Brinks tab,
  which also ticks the task.

**Counts**
- YB2 has been counted on 11/18 and 11/21. A pitch dated 11/20 uses the 11/18 count; one dated
  11/22 uses 11/21.
- After a harvest on top on 11/22, the 11/21 count still shows: "Counted 11/21 · before the 11/22
  harvest · Recount due".
- A count dated tomorrow is refused.

**Yeast dumped, un-check, Undo**
- Checking off #45's Yeast harvest as **Yeast dumped** with "too much trub": no brink changes, and
  #45 shows "Yeast dumped · too much trub".
- **Un-checking a harvest with nothing after it:** #41's harvest into YB1 with no count yet is
  removed. YB1 is empty again, and the open "Count YB1" task is gone.
- **Un-checking is refused** after a count or a pitch: 409 with the sentence. Undo of the check-off
  on the Gantt is refused the same way.

**People, devices, edges**
- As `breweryDevice`:
  - checking off a Yeast harvest on the board with `brewer2`'s staff code records the harvest
    "· on Brewhouse tablet";
  - every yeast route returns 403;
  - a bartender's valid code reads "can't do this here", and nothing is written.
- As `bartender1`, Yeast isn't in the nav, and the API returns 403.
- As `brewer1`, brink settings are read-only. As `breweryMgr` or `owner`:
  - add YB5 with empty weight 150 lb, rename it, and retire it while empty;
  - retiring YB2 while it has yeast is refused.
- **Two people, one brink:** `brewer1` and `brewer2` both pitch the last 20 lb of YB2. The second
  gets a 409 or 422 ("YB2 has 0 lb"), and nothing is written.
- **At 360 px:** the Harvest dialog (with both questions), the Brinks tab, Pitch, Add count and the
  batch page's Yeast section have no sideways scroll.
- **Slow network:** a double-click on Save in the Harvest dialog, Pitch, and Add count writes once.

## Amendment (Matt, 2026-11-22): yeast reference data (answers Q1)

**Data:** `reference/d64_yeast_matt_2026-11-22.csv`. It's local only, and the seed file embeds it.
It's seeded on every environment, is idempotent by name as D65's is, and has **no lots** (no
on-hand amounts were given).

| Supplier | Lab (manufacturer) | Product (code) | Strain (ingredient) | Type | Form | Offer pack | Price |
|---|---|---|---|---|---|---|---|
| Inland Island | Inland Island | II-008 | East Coast IPA | Ale | Liquid | pitchable · 1 | — |
| Inland Island | Inland Island | II-711 | German Monk Lager (A15) | Lager | Liquid | pitchable · 1 | — |
| Inland Island | Inland Island | II-574 | Kolsch II | Ale | Liquid | pitchable · 1 | — |
| Inland Island | Inland Island | II-903 | Brett Brux III | Brett | Liquid | pitchable · 1 | — |
| Inland Island | Inland Island | II-991 | Lactobacillus brevis | Lacto | Liquid | pitchable · 1 | — |
| Inland Island | Inland Island | II-1001D | Dry Chico | Ale | Dry | brick · 1 (500 g) | — |
| Inland Island | Inland Island | II-1002D | Dry Lager | Lager | Dry | brick · 1 (500 g) | — |
| Inland Island | Inland Island | II-1003D | Dry English | Ale | Dry | brick · 1 (500 g) | — |
| BSG | Fermentis | US-05 | Chico Ale | Ale | Dry | brick · 1 (500 g) | $76.99 |
| BSG | Fermentis | S-04 | London Ale | Ale | Dry | brick · 1 (500 g) | $76.99 |
| White Labs | White Labs | WLPMD4000 | Vermont Ale Modi (A15) | Ale | Liquid | pitchable · 1 | — |

**Decisions and readings:**
1. **Product = the strain ID** (A1). The product reads "Chico Ale US-05 · Fermentis" and "Dry Chico
   II-1001D · Inland Island".
2. **Strain Type is new:** an editable list (Ale, Lager, Brett, Lacto to start), stored on the
   strain (ingredient) and shown in the library with a filter (A13).
3. **Brett and Lacto are cultures, not yeast.** They live in Yeast Strains and follow every brink,
   harvest and co-ferment rule.
4. **Companies:**
   - **Inland Island** is new, as manufacturer and supplier.
   - **Fermentis** is new, as manufacturer.
   - **White Labs** is new, as manufacturer and supplier.
   - **BSG** already exists, as supplier.
5. **Prices:** US-05 and S-04 are $76.99 a brick, effective 2026-11-22. The other offers are seeded
   **without a price**, as SoNature's were in D65.
6. **Pitch size:** the list gives no usual size ("X bbl"). So the product's usual size is left
   **blank** and is optional, and each **Liquid lot is asked its size** in bbl (required on the lot).
   This amends A4.
7. **The pack note** on Dry offers reads "500 g". Bricks are counted whole, so "brick · 1 (500 g)".
8. **The old seeded yeast:**
   - **US-05** (ingredient) is renamed **Chico Ale** and gets the Fermentis US-05 product.
   - **WLP001, Wyeast 1056 and WLP002** aren't in Matt's list. They're removed where nothing uses
     them (no products, lots or recipe lines), as Irish Moss was in D65. If one is in use, it stays,
     and the release notes list it.
   - Wyeast isn't seeded as a company.

**Settled (Matt, 2026-11-22):**
- **A13:** Strain Type is an **editable list in the yeast settings**, seeded with Ale, Lager, Brett
  and Lacto. Brewery managers and owners edit it, as they do brinks (A7). A type in use can be
  renamed or retired, not deleted.
- **A14:** the lab is spelled **White Labs**.
- **A15:** "Germon" is a typo for **German Monk Lager**. "Vermont Ale Modi" stays as given.
- **A2:** each product is its own strain (see above).

## Amendment (2026-11-23): decisions made during the build and local QA

Where this differs from a section above, this wins. Sources: `prompts/d64_lead_decisions_1.md` to
`_6.md`, `stepwise_results/d64_local_qa_report.md`. **(Matt)** marks Matt's answers; the rest are
lead calls.

1. **Un-check lock (§5.4):** a harvest can't be un-checked after a pitch, count, dump or adjustment
   entered since it.
2. **Un-check after "This brink is empty" (Matt, gap 7):** the closed record reopens as it was, and
   its Count task comes back if one was due. With harvests on top of the new record, this happens
   when the last of them is un-checked.
3. **Dates (Matt, gap 3):** a pitch or count dated before the open record's first harvest is
   refused. Adjust and Dump follow the same rule (lead, decisions 6).
4. **D63 (Matt):** a brew is always saved. A pitch with no matching yeast record is marked "Yeast
   source needed". The refusal in 3 lives in the Pitch and count actions, not where brew day writes.
5. **Dirty marks:** un-checking a "record anyway" harvest makes the brink dirty again unless it was
   cleaned since. Un-ticking the brink's latest Clean task dirties an empty brink.
6. **Remove:** History offers Remove only where the API allows it. A purchased-yeast pitch can be
   removed by its maker or a manager, unless the product was counted after it. A closing entry on a
   retired brink can't be removed.
7. **Count tasks:** emptying a brink deletes its open Count task (Remove brings it back). Deleting
   the count that ticked a task reopens it. An empty brink is never due.
8. **Renaming a brink** renames its open tasks, except one someone retitled.
9. **Deletes:** a batch with yeast records, and a brand with batches or recipes, are refused with a
   sentence.
10. **Totals** are shown per unit, with a label. `GET /api/yeast/batches` and `/:id` serve the batch
    page. Migration 13 stores what a harvest cleared or closed, for 2, 5 and 7.
11. **Splits (recheck gap 17):** a part counts its parent's pitches plus its own. **Batch deletes (20,
    21):** a part of a split, or a batch with parts, is refused in Production's sentences.
12. **"This brink is empty" with an earlier date (16):** the closing adjustment takes the later of the
    check-off date and the old record's latest entry; the harvest keeps its own date.
13. **Stale answers (19):** an answer about yeast that has changed since is not used; the dialog asks
    again.
14. **Counts (15):** History has Edit and Delete, shown where the API allows them. Ticking a Count task
    by hand clears Recount due; a count isn't required before use.
15. A brink is never dirty while it holds yeast; un-checking one of two harvests moves the dirty mark
    to the one left in the brink (14).
16. **Counts (pass 3, 23 and 24):** counts have a version (migration 14); a stale Edit or Delete is
    refused. The Count task and Recount due follow from the counts and harvests by one rule, so a count
    dated before the latest harvest still applies (decision 18) but doesn't tick the Count task (§7). The
    closing date in 12 also takes the record's latest count into account.
