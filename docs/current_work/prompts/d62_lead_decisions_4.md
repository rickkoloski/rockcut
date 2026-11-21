# D62 lead decisions 4 — DEV box-only findings

2026-11-20 · lead → builder. DEV runs `2a3bfed`. On DEV the full Playwright run gave 905 passed and
2 failed; a rerun of the ingredients project passed 87 of 87. Log:
`/tmp/claude-501/pwlogs/d62_dev_full.log`. Traces are in `rockcut-ui/test-results/` from the
**rerun**, so the failing traces are gone. Work from the log. When reading any log or trace,
filter out `Authorization`/`Bearer` lines.

Same rules as before: stage files by name, no push, and no Playwright against DEV (only the lead
runs DEV). The local DB and local Playwright are yours again.

## 1. G17 on DEV is a real race (fix)

On DEV, the re-pick after the 409 got a **second 409**.
- **Cause:** `ToOrderPage.pickOffer`'s 409 branch calls `invalidateQueries` without awaiting it,
  then at once shows "The list is up to date now; pick the offer again." With real latency, the
  next pick goes out before the refetched products arrive, so it still sends the stale
  `lock_version`.
- **Fix:**
  - Show that message, and let the row's picker be used again, only **after** the refetch has
    landed.
  - Until then, disable that row's picker (or show it busy). Await
    `refetchQueries`/`invalidateQueries`.
  - Check whether the product dialog's 409 refetch (gap 9) has the same race. Fix it the same way
    if so.
- **Test:** delay the `GET /api/ingredient_products` refetch in Playwright, then try to pick during
  the delay. The picker must be disabled, and the pick after the refetch must save first time.
  Revert the fix and watch the test fail.

## 2. O1 on DEV (look, then decide)

`owner.spec.ts:14` O1 on DEV: after adding a company,
`getByTestId('party-190-role-manufacturer')` wasn't found within 5 s. The same test passed on the
DEV rerun.
- Find a plausible cause from the spec and the Companies page: a list that refetches late, the
  role chips, sorting or paging with DEV's larger company list.
- If it's a real UI race, fix it with a test. If it's only the test waiting on a list that hasn't
  refreshed yet, make the test wait on the list's response and say so.

## Done when

- vitest, tsc and build are clean, and lint still shows the same 8 errors.
- The local ingredients Playwright project is green.
- ExUnit is green only if the API was touched.
- Reply with commits, counts, the cause → fix → test for each item, and `LEAD:` notes. The lead
  then redeploys DEV and reruns.
