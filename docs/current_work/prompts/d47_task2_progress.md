# D47 Task 2 (API B): progress at the pause (2026-10-21)

Task 2's code is complete and committed in `cadef89` (`feat: D47 API B — tank status, flags, CIPs, undo and the DEV seed`). The working tree was clean at the pause, so no `wip` commit was made. `mix compile --warnings-as-errors` is clean.

## Done
- `Production.Parts`, `TankStatus` (§3.8) and `Flags` (§3.9, all eight kinds, keys, signatures, sign-off state): pure and unit-tested (`test/rockcut_api/production/status_flags_test.exs`).
- `GET /schedule` returns `statuses` and `flags`, worked out over the range plus every batch still going (180-day history window).
- Phase markers: a marker starts once its day has come and its predecessors are done or are markers that have started. **Needs lead confirmation.**
- `Cips` (standalone CIP & Sanitize), `Signoffs`, routes `/cips…`, `/flags/signoff…`, `/undo/:token`.
- `Undo` on every schedule write and every out-of-service write (`undo_token` at the top level; 409 `undo_stale`, `undo_expired`, author only).
- `retire_tank` refuses while a batch has unfinished non-marker steps in the tank (P4).
- Fix: planning a template that has phase markers crashed.
- The old Batches page and the Brewery Dashboard skip schedule batches (lead decisions 2).
- DEV seed: legacy batches deleted, `[SEED]` scheduled batches (P36, P49–P51), a signed-off flag, assigned steps; `[TEST-TEMP]` clean-up for batches, CIPs and sign-offs.
- Performance test: 12 weeks, 10 tanks, 30 batches of ~20 steps load in ~10 ms locally.
- Targeted ExUnit: 631 tests, 0 failures (production, seeds, authz, device route matrix).

## Left (lead's side, then Task 3)
- `LEAD: restart API` (no new migrations in Task 2) and `LEAD: reseed local`. The seed hasn't been run against the local DB yet; only ExUnit covers it.
- `LEAD: run` the full ExUnit suite (`cd rockcut_api && mix test`).
- Lead to confirm the phase-marker rule above, the 180-day history window, and that every reseed clears all sign-offs and undo records.
- Then Task 3 (UI A, the read-only Gantt), not started.
