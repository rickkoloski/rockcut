# D55: lead decisions 1

2026-11-08 · lead → builder, answering stop 1. Good work; all five judgment calls are accepted.

1. **CORS wrapper (`RockcutApiWeb.Parsers`):** accepted. Keep it to the parser's own errors.
2. **`personRoutes` and the route-table check:** accepted, despite the wider overlap. **When D53 lands
   you'll merge `develop`** (I'll tell you; don't do it yet). D53 Part 2 adds `/boards`,
   `/boards/:board` and `/boards/:board/cards/:id`, which **tablets can open** (view only). After the
   merge they must sit in both the person routes and the tablet's routes, so a tablet opening a
   board isn't told "Page not found". Add that case to `unknown_url.spec.ts` now as a pending check
   (`test.fixme` with a note) so it's not forgotten.
3. **Sort order left out of an update keeps the position:** accepted.
4. **`memberships: null`:** accepted.
5. **`useAuth.ts` start-up recheck:** accepted. Make sure a really ended session at start-up (revoked
   tablet, deactivated person) still ends on the first try, with no "retrying" loop; say which test
   covers it.

## Added to D55: §2.10

The field-definition dialog's empty sort order, which you spotted. Confirm the 500 with a test first.
If it's real, fix it the same way as §2.5 (empty → end of list on create; left out of an update →
stays). If it isn't real, say so and drop it. Add a row to the spec as §2.10 and scenario T12.

## Next: stage 3, to stop 2

As the plan says: 3a (the column migration, check up/down/up) and 3b (`leftoverTabletSession.ts`) as
**separate commits**, `tests/COVERAGE.md`, and §2.10. Then the non-Playwright gate. Append to the
status file, commit with a message containing `stop 2`, then stop.
