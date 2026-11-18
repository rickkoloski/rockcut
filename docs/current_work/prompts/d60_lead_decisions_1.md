# D60 lead decisions 1 (after Stage 4)

2026-11-18 · lead → builder. Stage 4 is in (`8d0f360`, `d568414`). Accepted: the `ingredients`
Playwright project with one worker, inactive `[TEST-TEMP]` leftovers until the next setup, the
COVERAGE gaps (slow-network double-submit and Android back stay manual; the local QA pass covers
them), and the Brewery-page redirect for `bartender1` (as since D31).

Fix these three before the local gate (small, in-cycle):

1. **`/api/ingredients?category_id=<parent>` includes the children** (spec §3.1: a parent includes
   its children, as `ingredient_products` already does). The recipe Grain Bill dialog opening on
   Grains then lists every grain. ExUnit for the filter; update B7 so it no longer has to switch
   to Base (keep one check that picking Base narrows the list).
2. **The partner-brewery message is the app's:** in Record movement, drop the browser `required`
   on the partner field (or `noValidate` on that form) so a trade or loan with no partner shows
   the app's own field message. B4 asserts the message text and that no request was sent.
3. **Status chips read "Available", "Depleted", "Expired"** (display only; the API values stay
   lowercase). Update the specs that matched case-insensitively to the exact text.

Done when: `mix test` green, vitest/`tsc`/`vite build` clean, the ingredients folder green twice.
Commit, then reply with commits and test counts. Don't run the full Playwright suite.
