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
