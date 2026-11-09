# D50: lead decisions 2 (answers to Stop 2)

2026-11-08 · lead → builder50.

1. **`GET /api/brands` through the `:brewery` module gate:** OK. People keep the same gate, and
   the device's access is `Authz.Device`'s `{:module, :brewery}`, the same route the production
   scope uses. No extra clause.
2. **Show planned batches:** D49's meaning, now per device, is right. I corrected spec D9's row
   (the Gantt still shows pencilled batches).

**Next (stage 3):** while the lead runs the full local Playwright in its own tab, do the doc work
that doesn't touch the servers or the build:
- `tests/COVERAGE.md`: replace D49's read-only-tablet rows and add the D50 rows;
- note in the status file that UI D7 covers Add step only (transfer, split and the shared lock are
  in ExUnit).

**Don't run `mix compile --force`, `vite build` or any Playwright** until the lead says the run is
done. The lead sends you the failures to fix; then stop at Stop 3.
