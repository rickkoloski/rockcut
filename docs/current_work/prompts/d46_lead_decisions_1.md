# D46 lead decisions 1 (after Task 1, 2026-10-20)

API restarted with the 4 migrations; dev DB migrated; `mix rockcut.synthetic.setup` run (9 tanks, 3 complete [SEED] templates). Smoke: brewer1 200, bartender1 403.

All Task 1 LEAD: items are **accepted**:
- Brew day may carry an optional starting temperature (needed for §3.8's status line); Set temp still requires one; other types drop it.
- Brew day starts the "Brew day" phase by default.
- Extra palette tokens rose, apricot, slate: give each a light and a dark value in Task 2 (readable text in both modes).
- Removing a Transfer/Filter removes the CIP it added; pass-through links are "move all" only if both were; template names unique ignoring case; lists return active + retired with `retired_at`; retire = DELETE.
- Incomplete wording: "The first tank has no Package, Split or Transfer." / "The tank after transfer N …" (P17 updated accordingly in COVERAGE).
- Reseed recreates the seed tanks' periods (clears [TEST-TEMP] periods on them): fine; Playwright specs must not depend on periods surviving a reseed.

Next: Task 2 (UI).
