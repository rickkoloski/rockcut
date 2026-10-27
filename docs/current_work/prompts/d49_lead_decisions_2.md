# D49 lead decisions 2 (Task 1, API half)

**2026-10-26** · Lead. Answers the `LEAD:` lines from `cb60f4d`.

## Checks (lead)

- **API restarted** with migration `20261026120001_add_cip_method` on the local dev DB.
- **Full ExUnit:** 1741 passed (1728 before, plus 13 new).

## Decisions

1. **Fixed names for the two new variants** (accepted). "CIP - no sani" and "Sanitize" don't follow a renamed CIP step type; only CIP & Sanitize takes the type's own name. They match §3.12a's board titles ("FV6 · CIP - no sani", "FV6 · Sanitize").
2. **A planned CIP & Sanitize or Sanitize before the fill clears the soft flag** (accepted). §3.12a says a planned CIP - no sani followed by a planned Sanitize before the fill raises no flag, and planned CIPs already count before a fill (D47). P123 names the done case as one example, not the only one.

## Next

The UI half of Task 1, as listed in your report, with Playwright for P122–P129. Stop after it.
