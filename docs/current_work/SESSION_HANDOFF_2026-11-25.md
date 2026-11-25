# Session handoff, 2026-11-25

## Where things stand

- **Prod: `v2026.11.25` (D63 foundations).** Matt's check passed. Release PR #100, squash `0f464c2`; API v47 `registry.fly.io/rockcut-api:deployment-01M89ZQ2MAEK387GJ7Y7E7DTPD`, UI v42 `registry.fly.io/rockcut-ui:deployment-01M89ZRMPEBMNVP0M5X1JWT2EK`.
  - **Rollback:** restore snapshot `vs_avQPb0O1GBjAhMZeMnvOmpAQ` (2026-11-25 18:32:33 UTC; loses later entries), then API v46 `registry.fly.io/rockcut-api:deployment-01M86XXBBJCR3WKS4Q3W52JD26` and UI v41 `registry.fly.io/rockcut-ui:deployment-01M862FJSB7KEXTVXXH3NCSWQ9`.
  - Record: `stepwise_results/d63_foundations_COMPLETE.md`.
- **DEV:** `d3fc7e6`, API and UI, the same app code as `develop`.
- `main` is an ancestor of `develop`, so the next release PR should be conflict-free.

## Next

1. **D68 (recipes).** The series is D68 → D67 (planned need) → D66 (brew day) → D69 (fermentation). Next new ID **D70**. Write the spec only when Matt says scoping is done. Decisions: memory `rockcut-d63-recipes-scoping`.
   - **Needed from Matt:** template per brand (which of Altruism, Dunkel, CCY, Crusher, Helles and Pils are filtered), target-IBU seed, the new brands' status, mockups yes or no, and how people reach Use order (proposed: a Use order button on hop product pages, and the ingredient's name as a link).
   - **Stop 0:** the carry list in the COMPLETE doc.
2. **D66:** the Gantt batch item in the COMPLETE doc.

## Notes

- **Matt's rules from this deliverable:** small gaps may be carried or backlogged, with no fix cycle only for minors; after QA, report and ask before starting the next step.
- **QA briefs:** reach every new screen by tapping through the app, never only by address. Every D63 pass opened Use order by URL and missed that nothing links to it.
- **Snapshots:** `fly volumes snapshots list` also shows the nightly one; check the created time is after your request.
- **DEV Playwright:** a `production` failure skips brewery-board, ingredients and d58; rerun with `--no-deps`, one project at a time.
- **DEV reseed** failed once more (ssh status 1, cause unknown); a repeat worked.
- **Builder (w1:p4):** `/clear` it before D68, then `herdr agent rename w1:p4 builder`.
