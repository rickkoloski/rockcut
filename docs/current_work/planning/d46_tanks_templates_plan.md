# D46: Tanks, phases & step types, templates — Implementation Plan

**Spec:** `specs/d46_production_scheduling_spec.md` (APPROVED 2026-10-20), §3.1–§3.4, scenarios P1–P19
**Created:** 2026-10-20 · **Branch:** `d46-tanks-templates` from `develop` · **Task:** PortableMind 4629

## Lead decisions for D46 (where the spec assumes later pieces)

1. **No Gantt yet.** Everything the spec puts on the Gantt (the tank ⋯ panel, the hatched band, the "Out …" tag, tapping an empty spot, the "Will be flagged" preview, Undo) arrives in **D47**. In D46, out-of-service periods are managed on the **Tanks page** (in the tank's edit dialog). P6–P8 and P10 are tested there now and again on the Gantt in D47.
2. **Brewery → Production** in D46 is a small hub page (`/brewery/production`) with three entries: Tanks, Templates, Phases & steps. D47 turns it into the Gantt with the Set up menu.
3. **Template completeness is a status, not a save block.** A template is built one entry at a time, so it's "incomplete" for a while. The API returns `issues` (code + message) with each template; the editor shows them in a banner ("The first tank has no Package, Split or Transfer."). Incomplete templates are kept, but D47's Plan batch only offers complete ones. P17 becomes: removing the Package is allowed and the banner appears.
4. **Brew day** is created with every new template at day 0, first tank; it can't be removed or moved.
5. **The tablet** (read-only setup pages, P19's device part) comes with the device scope in **D49**. In D46 a device gets 403 on production routes.
6. `ramp_group` lives on `template_steps` from D46 (the spec listed it under D48 for batches).
7. **Retiring a tank** checks for unfinished steps through a function that returns none until D47 adds steps; write it so D47 only fills it in.

## API (`rockcut_api`)

**Migrations** (forward-only, one file per table is fine; the seeds in a migration so every environment gets them):
- `tanks` (§3.2), unique index on `lower(name)` (or `COLLATE NOCASE`); `position`, `retired_at`.
- `tank_outages` (§3.2), index on `tank_id`.
- `production_phases` + seed rows: Brew day, Lag, Fermentation, Diacetyl rest, Crash, Lagering, Conditioning, Carbonating, Packaging (positions 1–9, colors below).
- `production_step_types` + seed rows (§3.3, `built_in` true for the seven behaviors other than `plain`; Carb starts Carbonating, Package starts Packaging; full names: PDH Primary Dry Hop, FDH Final Dry Hop, Amylo Amyloglucosidase (AMG)). Order: Brew day, PDH, FDH, Dry hop, Amylo, Set temp, Diacetyl test, Plug dump, Yeast harvest, Rouse, Addition, Fining, Gravity check, Carb, Transfer, Filter, Split, CIP & Sanitize, Package.
- `process_templates`, `template_steps` (+ `ramp_group` string), `template_links` (unique `[from_step_id, to_step_id]`).

**Context** `RockcutApi.Production` (`lib/rockcut_api/production.ex`, schemas in `lib/rockcut_api/production/`), following `RockcutApi.Tasks`' style:
- Tanks: list (active, ordered; retired separately), create, update, reorder (list of ids), retire (refused with the blocking batches — none until D47), restore.
- Outages: create/update (no overlap on the tank → `{:error, :outage_overlap, other}`), delete, `end_today` (yesterday, or delete if it starts today). "Today" = `Tasks.today/0`.
- Phases / step types: list (with retired), create, update (rename, color, `starts_phase_id`, `on_task_list`, `full_name`), reorder, retire/restore (built-in types refuse retire). New step types are always `plain`.
- Templates: list (with `issues` and step counts), get (steps in day order + links), create (adds Brew day at 0), update (name, notes), duplicate (deep copy, "Copy of …"), retire/restore, reorder.
- Template steps: add (type or phase marker, day, vessel, detail, temperature, notes, on_task_list, `comes_after` / `leads_to` / their default answers — both set = slot in, replacing the direct link), update, remove (Brew day refused; links pass through to what it led to). Adding a Transfer/Filter on vessel k (k ≥ 1) also adds a CIP & Sanitize on vessel k−1 the same day, linked from it.
- Links: add (no cycles → `:link_cycle`; to-day ≥ from-day → `:link_order`), update default answer, remove.
- Ramp: start, target, change per day, first day, vessel, comes after, leads to → one Set temp step per temperature (the last one reaching the target exactly), chained `move_all`, sharing a `ramp_group`; the first starts the chosen phase (default Crash).
- `issues/1`: no Brew day at 0; a vessel with no exit (its last entry by day isn't Package/Split/next Transfer); a vessel index with no Transfer/Filter starting it; Set temp without a temperature.

**Authz:** `can?(user, action, :production)` for `:read`, `:write`, `:setup` → Brewery members (`member_of?(user, "brewery")`); owners pass the owner clause. `Authz.Device`: nothing yet (D49). Add the clauses to whatever pins the authorization surface (D31's tests).

**Routes:** `scope "/api/production"`, `pipe_through [:api, :authenticated]`, one or a few controllers (`ProductionTankController`, `ProductionListController`, `ProductionTemplateController`). JSON in `JSONHelpers` style; flat params. Errors 422 `{error, message}` with the codes above; 403; 404.

**DEV seed** (`Seeds.Synthetic`): tanks FV1–FV7 (unitank; FV1, FV4, FV7 30 bbl, others 20, brewhouse), Serving 1–2 (serving, 30 bbl, walk-in); one outage on Serving 2 (+7 to +13 days, "Replace door gasket") and a past one; the mockup's three templates as `[SEED] Standard ale`, `[SEED] Hazy with AMG`, `[SEED] Lager with transfer` (the Lager one is P14's list, with the Diacetyl test note). Reseed must be idempotent and clean up `[TEST-TEMP]` tanks/templates/step types/phases.

## UI (`rockcut-ui`)

- **Nav:** Brewery → **Production** (`/brewery/production`), after Tasks/Dashboard per the existing BREWERY_PAGES order. Routes inside the Brewery-only block.
- **Hub** `/brewery/production`: three cards (Tanks, Templates, Phases & steps) with counts.
- **Tanks** `/brewery/production/tanks`: the list (name, type, capacity, location, "Out Oct 27–Nov 2" / "Out from Oct 20" chip for the current or next period), reorder with the existing arrow/`@dnd-kit` pattern, Add / Edit dialog (all fields), Retire (confirm text from §3.2) and a Retired section with Restore. The edit dialog has an **Out of service** section: the periods (Now / Coming up / Past), **Mark out of service…** and Change on each → a dialog with Out from, Last day out, Until further notice switch, Reason, Back in service today (while current), Delete, Cancel, Save. Errors inline (the overlap message names the other period).
- **Phases & steps** `/brewery/production/lists`: two lists. Phases: name, color swatch picker (the palette), reorder, rename, retire/restore. Step types: name, full name, behavior (read-only label for built-in), starts phase, on task list by default, reorder, rename, retire/restore (no Retire on built-in).
- **Templates** `/brewery/production/templates`: list with name, step count, Incomplete badge, Duplicate, Retire/Restore, New. **Editor** `/brewery/production/templates/:id`: name/notes; the issues banner; entries in day order (day, name — type + " - detail", or "Set temp - 52°", or the phase for a marker —, phase started as a colored chip, tank, task-list switch, notes icon, links "after FDH · moves with it / stays", Edit, Remove); buttons **Add step**, **Add phase start**, **Add a ramp**; a **Preview**: a one-batch bar from a sample brew day, colored by phase over time, with dots for task-list steps and a hatched CIP day, one bar per tank.
- **Phase colors:** a palette of 12 named tokens with light and dark values in `lib/colors.ts` (or the theme), starting from the mockup's nine (brew `#D6C3E3`/`#5C4A6B`, lag `#DCE8C8`/`#3B4D30`, ferm `#B5D39D`/`#4F7A3B`, dr `#EBCF84`/`#8C7330`, crash `#A3C2D6`/`#3F6A84`, lager `#86A9C2`/`#34566E`, cond `#9FCFC3`/`#2F6157`, carb `#E2B866`/`#8D6A26`, pack `#CDBFA6`/`#6B6250`) plus three more distinct ones. Text on them readable in both modes.
- `data-testid`s on lists, rows, dialogs and buttons.

## Tests

- **ExUnit:** context (tank name uniqueness case-insensitive, outage overlap and `end_today`, retire/restore, built-in retire refused, template create adds Brew day, Brew day not removable, transfer adds CIP, link cycle/order, slot-in, remove passes links through, ramp generation (58→32 by 10 = 58,48,38,32), duplicate is deep, `issues`); controller 403 for `bartender1`-like users and devices, 200 for Brewery members and owners; Authz unit cases.
- **Playwright** `tests/regression/production/` (personas via storageState; `[TEST-TEMP]` names; persist-verify after reload): P1–P5 on the Tanks page, P7–P9 on the Tanks page's out-of-service dialog, P11–P18, P19 (bartender1 and barMgr redirected Home). `tests/COVERAGE.md` D46 section mapping P1–P19 (P6/P10 Gantt parts → D47, P19 tablet → D49).
- **Local gate** per `three_environment_workflow.md` §3.
