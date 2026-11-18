# D60 lead decisions 3 (local QA recheck 1)

2026-11-18 · lead → builder. Recheck 1 is in: `~/src/rockcut-d60-qa/results/d60_qa_recheck1.md`
(you may read it). Verdict pass with gaps: all 14 first-pass gaps closed, 2 new minors. Fix both,
each with a test.

1. **Gap 15, Delete offered on a lot that can't be deleted.** Today Delete is enabled on a lot with
   later movements (or a "Counted, no change"), the confirm says it can't be deleted yet still has
   an active Delete button, and a lot a recipe uses gets the normal "goes too" confirm and then a
   422. Fix: the lot JSON carries whether it can be deleted and why not (the same two rules the API
   enforces: movements after the first; used by a recipe). The UI disables Delete with that reason
   as helper text (as the Sack size box does: "Fixed: the lot has movements after its first"), and
   the confirm only ever opens for a deletable lot. Keep the API refusal as is. Playwright: a lot
   with a later movement and a lot a recipe uses show Delete disabled with the reason; a lot with
   only its first movement still gets the confirm.
2. **Gap 16, under 0.01 lb.** A quantity under 0.01 lb (e.g. `0.001`) shows a field message under
   the box ("Enter at least 0.01 lb", or the sacks equivalent where it applies), Save stays
   disabled, nothing is sent; not "Enter the quantity". Same in every quantity box (Add lot, Record
   movement, Count total and by lot). vitest for the rule; one Playwright check.

Done when: `mix test` green, `--warnings-as-errors` clean, vitest/`tsc`/`vite build` clean, the
ingredients Playwright folder green twice. No repo-wide `mix format`. Commit, reply with commits and
test counts. Don't run the full suite.
