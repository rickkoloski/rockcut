# Deferred Items Register

> Running inventory of workarounds, deferred requirements, and spec gaps
> discovered during implementation. Feeds into roadmap planning.
>
> **Process:** Items are added from stepwise result docs. Items are
> claimed when pulled into a future deliverable spec. Items are resolved
> when the deliverable ships and confirms the fix.

---

## Open Items

### DR-1: inventory_on_hand needs real quantity field
- **Source:** D6 (Formula Execution Service)
- **What was spec'd:** `inventory_on_hand(ingredient_id)` sums quantity across active lots
- **What shipped:** Counts lots with `status: "available"` (no quantity to sum)
- **Reason:** Inventory tracking explicitly deferred to v2 in data model spec (D1)
- **Unblocked by:** v2 inventory tracking — add `quantity` decimal field to `ingredient_lots`
- **Priority:** Must-fix when inventory tracking is needed
- **Domain review needed:** Yes — confirm with Matt what "inventory on hand" means operationally (weight remaining? lot count? something else?)

### DR-2: Tinseth IBU uses hardcoded wort gravity
- **Source:** D6 (Formula Execution Service)
- **What was spec'd:** IBU via Tinseth with utilization from boil time and wort gravity
- **What shipped:** Hardcoded 1.050 average wort gravity for bigness factor
- **Reason:** Computing actual pre-boil gravity creates circular dependency with est_og; adds complexity beyond D6's architecture-first goal
- **Unblocked by:** Formula accuracy tuning deliverable — chain est_og into est_ibu, or accept gravity as optional parameter
- **Priority:** Nice-to-have — 1.050 is standard for simplified calculators
- **Domain review needed:** Yes — Matt can say whether this approximation matters for his batch sizes

### DR-3: Seed data lacks recipe_ingredients
- **Source:** D6 (Formula Execution Service)
- **What was spec'd:** N/A (seed data completeness)
- **What shipped:** Seeded recipes have no ingredients; manual API tests return 0.0 IBU and 1.0 OG
- **Reason:** Original seed data focused on schema validation, not realistic recipes
- **Unblocked by:** Seed data enhancement (small task, no blocker)
- **Priority:** Nice-to-have — ExUnit tests use inline test data and verify plausible values
- **Domain review needed:** Yes — Matt could provide a real recipe for seed data

### DR-4: Unit handling edge cases (pkg/each)
- **Source:** D6 (Formula Execution Service)
- **What was spec'd:** Not explicitly specified
- **What shipped:** Unknown units passthrough as raw values; mitigated by category filtering
- **Reason:** Non-weight units (pkg, each) are used for yeast/misc which are filtered out by hop/grain category queries
- **Unblocked by:** Any future formula that operates on non-fermentable ingredient types
- **Priority:** Nice-to-have — current formulas are safe

---

## Resolved Items

_(None yet — items move here when a deliverable confirms the fix.)_

---

## Domain Review Queue

Items tagged "domain review needed" that should be batched for Matt's
next review session. Grouped so Matt can answer domain questions without
wading through technical plumbing.

| Item | Domain Question | Status |
|------|----------------|--------|
| DR-1 | What does "inventory on hand" mean at Rockcut? Weight remaining per lot? Lot count? Something else? | Open |
| DR-2 | For your batch sizes, does a simplified 1.050 gravity assumption give close-enough IBU estimates? | Open |
| DR-3 | Can you provide a real recipe (grain bill + hop schedule) for seed data? | Open |
| DR-5 | Matt wants to experiment with writing formulas himself — confirm: what kinds of calculations does he want to try? What would feel natural as an editing surface? | **Answered in part** — Matt is excited to write formulas; full UX preferences TBD |
