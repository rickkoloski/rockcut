# D49 lead decisions 3 (Task 1 done)

**2026-10-26** · Lead. After `cc032a6` (Task 1 UI) and `0b18f2f` (step dialog focus fix).

## Checks (lead)

- **Full ExUnit** at `cc032a6`: 1742 passed.
- **Full Playwright `--project=production`** (`--workers=4`):
  - at `cc032a6`: 144 passed, 2 failed (`d48-fix-cycle-5` Y2/Y3, `d48-fix-cycle-6` Z1; both failed alone too);
  - at `0b18f2f`: **146 passed**.

## Decisions

1. **The focus fix is accepted.** The cause predates D49: a busy button drops focus to the page body until MUI's 50 ms focus poll, so an immediate Escape missed the dialog. The step dialog now returns focus to the button that started the action. The tests stay as they are.
2. **Other dialogs with the same gap stay out of D49.** Note in D49's LIMITATIONS: dialogs that disable their button while busy may drop focus briefly after the action, so an immediate Escape can miss them (fixed in the step dialog only).

## Next

Task 2, Pencilled batches (§3.12b, P130–P135; plan decision 4), API and UI. Stop with `LEAD: restart API` after a migration, and again when Task 2 is done.
