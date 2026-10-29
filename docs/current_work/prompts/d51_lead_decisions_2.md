# D51 part 2: lead decisions 2

2026-10-28 · lead → builder, after `d51_builder_status.md` §5–8.

**State:** the lead committed the docs (`98b0664`) and merged `develop` into this branch (`f53f040`): part 1 (`v2026.10.28`, on prod) brings bandit 1.14, Ecto 3.14 and **decimal 3.2**, vite 7.3.7. `mix deps.get` and `pnpm install` are done; the servers on :4002/:5174 run from this worktree on the new deps. Your local dev DB is fine as it is.

## Answers

1. **4933 (G4):** fix the **test**, in this branch: assert what G4 is about (a stale tab's person Logout never unpairs the tablet) without relying on B's banner surviving A's logout. Show it 20/20 with the Mac awake (`caffeinate -ims`), and the old version failing in the same setup.
2. **4064, 4057:** closed by the lead with your notes.

## New: G1 + G5, limits on brewing numbers

From the part 1 QA pass (spec, "From the part 1 QA pass"; report `~/src/rockcut-d51-qa/results/d51_qa_report.md` G1, G5; you may read it). Pre-existing, same on decimal 2.4.1:
- A JSON **number** is cast through a float and saved rounded (a 40-digit ABV → `1234567890123456800000000000000000000000`; `1e308` → 309 digits; `-1e-9999` → 0). The UI sends numbers.
- No range checks: ABV `-5` and `1000` save; Chromium turns `5,25` into `525`, which saves as ABV 525.

**Do:**
1. Per-field ranges in the changesets, as `validate_number`, for every `:decimal` field in `lib/rockcut_api/brewing/` (QA's list: brand `target_abv/ibu/srm`; ingredient lot `alpha_acid`, `color_lovibond`, `extract_potential_fgdb`, `attenuation`, `protein_perc`, `moisture_perc`, `diastatic_power_linter`; batch log `gravity`, `temperature`, `ph`; batch `actual_abv`, `actual_og`, `actual_volume`, `ferm_temp`; recipe `batch_size`, `efficiency_target`; check for others). **Propose the ranges first** from the UI labels, units and seed data (is gravity SG or °Plato? temperatures °F?), wide enough that no real brewing value is refused, narrow enough to catch typos (ABV 0–100, pH 0–14, percentages 0–100). Write them as a table in your status file and **stop for the lead's OK before coding them.**
2. Then: any value outside its range → 422 with a field message that names the range ("must be between 0 and 100"). That covers the 40-digit and `1e308` cases. Keep `-1e-9999` → 0 as acceptable (it's a valid 0).
3. UI: the brewing number inputs show the API's field error (check they already do via `parseApiError`); add `min`/`max` (and `step="any"`) where the input is `type=number`, so the browser refuses obvious typos first. Don't redesign the forms.
4. Tests: one ExUnit test per schema (in range saves; below and above refused; a JSON number with 40 digits refused through the controller), and one Playwright spec: `breweryMgr` sets a `[TEST-TEMP]` brand's ABV to 1000 → visible error, nothing saved after a reload.

## Then

- Full `mix test` twice and the UI checks on the merged branch.
- Full local Playwright once more (reseed first; `caffeinate -ims` on the whole chain).
- Update the status file and stop.
