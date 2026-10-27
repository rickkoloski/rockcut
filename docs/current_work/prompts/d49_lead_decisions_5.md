# D49 lead decisions 5 (Task 2 done)

**2026-10-26** · Lead. After `e2b978b` (Task 2 UI).

## Checks (lead)

- **Full ExUnit:** 1751 passed at `0b1f310`. `e2b978b` changes no API code.
- **Full Playwright `--project=production`** (`--workers=4`) at `e2b978b`: **150 passed**.

## Decisions

1. **Muted flags also leave the bar badges** (accepted). The spec says muted flags aren't counted. A badge on a pencilled bar would count them.

## State for a fresh builder

Done so far, all on `d49-schedule-task-list`:
- Task 0, BB1/BB2: `26c91ec` (decisions 1);
- Task 1, Clean not sanitized: `cb60f4d` API, `cc032a6` UI, `0b18f2f` step dialog focus fix (decisions 2, 3);
- Task 2, Pencilled batches: `0b1f310` API, `e2b978b` UI (decisions 4, 5).

Carried into Task 3 from Tasks 1 and 2:
- P125's board title ("Serving 1 · CIP - no sani");
- the board side of P130, P132, P133 and P135 (no tasks for pencilled batches; scheduling one adds its tasks).

For LIMITATIONS later: decisions 1.2 (a refused Undo replaced by the same person's next write) and 3.2 (other dialogs' focus gap).

## Next

Task 3, Linkage API (plan decisions 5–9, 11, 12). Stop with `LEAD: restart API`, `LEAD: reseed local` and the test count.
