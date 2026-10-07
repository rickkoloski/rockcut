# D37 lead decisions 2

**From:** the lead, for Matt. **2026-10-06.** These answer the builder's `LEAD:`
questions after step 6 (`68e42a3`).

## 1 · Close the GAP rows before the local gate (lead)

The gaps are small and the DEV pass reuses the specs, so add them now:
- **S5 / S11:** Playwright checks that **Export CSV** and **Import** are absent for
  Taproom staff (`bartender1`) and on the tablet. Add them to the existing staff and
  device spec files.
- **S13:** the D37 tablet flow. Run "Sign in as me" as a `[TEST-TEMP]` Taproom person,
  then Redeem with no staff code asked. History, viewed as `barMgr`, shows the plain
  name (no "on Shared Device"). Reuse D33's "Sign in as me" helpers.

Persist-verify as usual. Update `tests/COVERAGE.md` so these rows aren't GAP. The
Manual-on-DEV rows stay Manual.

## 2 · `SYNTHETIC_STAFF_CODES` on DEV (Matt, pending)

It goes in the PortableMind secrets file and, as a Fly secret, on `rockcut-api-dev`.
That's outward-facing, so the lead asks Matt and does it at the DEV gate, together with
`STAFF_CODE_KEY`. Until then, DEV setup logs a warning and leaves codes alone. That's
acceptable. Add it to the handoff note's LIMITATIONS.

## 3 · Re-run setup after a full Playwright run (lead)

Yes. Add one line to `tests/RUNNING.md`, and to the DEV steps wherever they list post-run
cleanup. It says: a Replace run marks the `[SEED]` board entries as imported, so re-run
`mix rockcut.synthetic.setup` (locally) or `RockcutApi.Release.reset_synthetic()` (DEV)
afterwards. The specs don't depend on it.
