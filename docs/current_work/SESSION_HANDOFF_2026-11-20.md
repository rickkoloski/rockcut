# Session handoff — 2026-11-20

## Where things stand

- **Prod:** unchanged, `v2026.11.19` (D61). DEV: free, nothing claimed.
- **D62 (hops, fruit, spices, sugars, other consumables)** is in progress on local branch
  `d62-hops-other-ingredients` (from develop `b3b3678`; **not pushed**).
  - Spec `specs/d62_hops_other_ingredients_spec.md`: approved, A1–A7 confirmed, plus hop
    reference-data amendments.
  - Plan `planning/d62_hops_other_ingredients_plan.md`. Builder brief
    `prompts/d62_builder_brief.md` (Stage 1 + Stage 2 sections).
  - **Stage 1 accepted:** sacks → packs, quantity in the product's unit, maltster → manufacturer,
    category keys. Commits `50cf495` `59a7dd0` `2888fe7` `de5b576` `aa92982`. ExUnit 2,700 ×2,
    vitest 449, lint the same 8, full local Playwright 875 passed / 1 skipped (44.5 min).
  - **Stage 2 (hops) running** in the builder pane (w1:p4) at handoff: the hop migration
    (`20261120120001_hop_features_and_crop_year`) was approved to run on the local dev DB with the
    API up. **The API needs a restart afterwards.** The builder stops at Stop 2 and reports.
- **Paused (Matt, 2026-11-20, option 2):** the builder was told to stop at a safe point (~26 min
  into Stage 2; hop API committed `a82f2fd`, UI in progress), commit compiling work as
  `wip: D62 Stage 2 UI (paused)` or leave it uncommitted, and wait. **Until Matt says "continue":
  no resuming the builder, no new stage, no push, no DEV.** On resume: read the builder's status,
  restart the API (the hop migration ran on the local dev DB), then let it finish Stage 2.

## Next

1. Get Matt's pause answer. Restart the API after the builder's migration (lead tab, w1:p2:
   `mix phx.server`).
2. Review Stop 2. Answer its LEAD notes and decide with Matt **whether Stage 3 stays in D62**
   (split point per the plan §6).
3. Stage 3 (fruit, spices, sugars, consumables), then Stage 4: hop reference seed (27 products,
   28 lots at Opening amount dated 2026-11-19, on every environment; data in git-excluded
   `reference/d62_hops_matt_2026-11-19.csv` and `reference/d62_hop_products.csv`, which must be
   embedded in the seed file), Playwright, the O9 flake (5911), COVERAGE.
4. Then the gate: local QA (360 px, slow network, two people one record; never touch the seeded
   hop lots) → DEV.

## Notes

- Fruit, sugar and salt reference data: not provided yet (enter on screens if it doesn't come).
- Backlog placement decided: D62 = O9 flake, `inventory_on_hand` units (done in Stage 1), DR-1
  resolved / DR-4 claimed (done). D63 = 4084 lint (8), 5203, 4986, 4987, 4989, DR-2, DR-3, T9.
  Nothing else gets pulled in.
- Next new ID after D64 is **D65**. Order: D62 → D64 (yeast) → D63.

## Update (later 2026-11-20)

- **D62 split** (Matt): D62 = packs + hops; **D65** = fruit/spices/sugars/consumables. Order D62 →
  D65 → D64 → D63; next ID **D66**. Spec last Amendment, plan Split section (`e772382`).
- **Stages 2 and 4 accepted.** Stop 4: ExUnit 2,725 ×2, ingredients Playwright 72/72, O9 fixed
  (`ce0550a`; the flaky test was the D59 owners O9). Hop seed `43573a9`: 27 products, 28 lots,
  409.6 lb. Full local Playwright on Stop 4: **891 passed, 1 skipped**.
- **Local QA started** in tab "D62 local QA": agent `qa62` in `~/src/rockcut-d62-qa/` (brief
  `BRIEF.md`, report `results/d62_qa_report.md`, qawatch split). At handoff it was **blocked on a
  dialog** almost at once (no progress lines yet): read it with
  `herdr agent read qa62 --source visible` and answer (Matt's call if it's his).
- Builder (w1:p4) idle, standing by. Next: QA report → fix cycle → recheck → DEV gate.

## Update (afternoon 2026-11-20)

- **Gap 7 closed** (Matt: "Stick with new price"; D61 A4 stays). Fix cycle 1 (`ffd78b8`…`7d57c01`) and cycle 2 (`e59482e`…`583af00`) accepted; decisions in `prompts/d62_lead_decisions_1.md` / `_2.md`.
- Full local Playwright after cycle 2: **905 passed, 1 skipped** (after cycle 1: 897 + one d52 gear flake that passed 6/6 on rerun).
- QA recheck 1: 11 of 12 gaps fixed; new gaps 13–18 fixed in cycle 2. **QA recheck 2** (`~/src/rockcut-d62-qa/results/d62_qa_recheck2.md`): gaps 13–18 fixed; new **minor** gaps 19 (To order 409 message stays after the re-pick saves) and 20 (contract price-change line shows before the hop line's Offer is picked and doesn't name the offer). R4 PARTIAL (usage limit): Receive at 360 px, slow-network To order, and the bartender1/taproomDevice 403 spot checks not run. Seeded diff 0.
- **Next:** fix 19 + 20 in-cycle (builder); QA finishes the R4 checks; then the DEV gate (needs Matt's OK). Builder still owes a COVERAGE.md update for cycles 1–2. Builder printed two local synthetic tokens in its tool output (reported to Matt; told not to repeat).

## Update (evening 2026-11-20): local QA passed

- Cycle 3 (gaps 19, 20): `328da86` `2c810f0` `e0f61fb` (+ builder COVERAGE commits). Full local Playwright: 858 passed, 1 failed (D39 S73 touch-drag flake; the brewery-board project rerun passed 436/436).
- **QA recheck 3: DONE pass** (`~/src/rockcut-d62-qa/results/d62_qa_recheck3.md`): 19 and 20 fixed, the R4 leftovers (Receive 360 px, slow To order, 403s) pass, seeded diff 0. Unrated notes: re-picking the offer already shown after a 409 sends nothing (message stays); grain price line repeats a supplier that is also the maltster (D61 wording).
- **Next: DEV gate, waiting on Matt's OK** (claim DEV in conv 80, deploy branch to DEV, DEV Playwright + short DEV QA). Release needs the pre-release snapshot (D62 migrations rename columns).

## Update (night 2026-11-20): D62 on prod

- **D62 released** as `v2026.11.20`:
  - PR #86 merged to `develop` as `723c785`; release PR #87 squashed as `edd4ed7`;
  - API v43 / UI v39; snapshot `vs_R742wNODv6egTLNNwgKeaRDX`;
  - rollback = restore that snapshot, then API v42 / UI v38;
  - the hop seed is on prod (28 lots, 409.6 lb);
  - Matt's prod check passed.
- **DEV gate:**
  - full Playwright 909/909 at `a9998ea`, after decisions 4 fixed a To order refetch race seen
    only on DEV;
  - DEV QA passed with 4 minor gaps plus the Add lot supplier. Matt moved these to D65 (branch
    `d65-carry-devqa`, local).
  - DEV is free and runs `develop`.
- **D65:** the spec and plan are approved, with reference data from Matt (salts with ions, sugars,
  Aseptic and SoNature fruit, Whirlfloc T in tablets, 10 spices; acids and Irish Moss removed). They
  live on local branch `d65-fruit-spices-sugars-consumables`, in worktree `~/src/rockcut-d65`.
  - **Next:** rebase it onto `develop`, then brief the builder starting at Stop 0 (the carried
    fixes).
  - The reference CSVs are git-excluded, in `~/src/rockcut-d65/docs/current_work/reference/`. The
    seed must embed them.

## Start here (next session)

1. **Restart the builder** before the D65 brief. In its pane (build tab, w1:p4), run `/clear`, then
   `herdr agent rename <pane> builder`; a long D62 context would otherwise carry over.
2. **Rebase D65** (worktree `~/src/rockcut-d65`, branch `d65-fruit-spices-sugars-consumables`)
   onto `origin/develop`. It's docs only, cut from `a9998ea`, so the rebase should be clean. Then
   work in `~/src/rockcut` as usual.
3. **Write the D65 builder brief** from the plan, starting with **Stop 0**: cherry-pick
   `d65-carry-devqa` (`1a3b3f5`, `c939d17`, `fcaefe4`, and the wip `cb9ed73`), then finish the wip.
4. **The finished tabs are closed:** D62 QA, DEV and PROD. The worktrees `rockcut-dev-d62` and
   `rockcut-release-20261120` are removed. DEV is free and runs `develop` `723c785`.
