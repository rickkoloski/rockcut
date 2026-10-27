# D46 lead decisions 3: DEV gate QA findings (fix cycle 2), 2026-10-21

The independent QA report is `stepwise_results/d46_qa_report.md` (DEV, 3e81989). P1–P19 pass. Fix on this branch, each with a test at the level it lives (ExUnit for API rules, Playwright/Vitest for UI):

**Must-fix**
- **M1. Transfer/Filter destination.** A Transfer/Filter's `vessel_index` is the tank it moves **into**, and it must be a **new tank**: exactly one more than the highest vessel index used before it in day order (its source is the tank before). Refuse anything else in the API (422 `transfer_not_new_tank`, "A transfer moves the beer into a new tank."). The auto CIP goes on the source (`vessel_index − 1`). In the UI, a Transfer/Filter's field is labelled **"Into tank"** and offers only the next new tank ("After transfer N"); don't silently change the field when the type changes. Also refuse (422) any step whose `vessel_index` names a tank that no Transfer/Filter starts (QA minor 4).

**Minor, fix now**
1. Link pickers: "Comes after" offers only steps on the same or an earlier day (and not ones that would make a cycle); "Leads to" only the same or later day.
2. Edit dialogs that save immediately (links, default answer, outage Delete): the dismiss button reads **Close**, not Cancel; deleting an out-of-service period and removing a link ask "Delete …?" / "Remove …?" first.
3. A 404 on a step, link or template that someone else removed shows "This was removed by someone else. Reload to see the latest." with a Reload button, not "Not found".
5. Ramp dialog: the preview text respects the limits (28–80°F, change per day ≥ 1, whole degrees) and shows an inline error instead of an impossible list.
6. Contrast ≥ 4.5:1: the dark-mode "Now" out-of-service chip, the outline "Out …" chip, the light-mode "Incomplete" badge.
7. Phone preview: keep the tank labels visible while the timeline scrolls (sticky label column) and show a scroll hint (fade/shadow) when it overflows.
8. Capacity ≥ 10000: a friendly message ("Capacity must be under 10,000 bbl."). Names: trim and NFKC-normalize before the uniqueness check (so full-width "Ｆv1" = FV1).
9. "Add phase start" help text: drop the mention of Leads to.

**Not now**
- 10 (sortable rows are role=button containing buttons): to file as a backlog task if Matt agrees.
- 11 (Duplicate names "Copy of …"): by design.

QA also retired and restored 10 of the parallel run's [TEST-TEMP] tanks and deleted 5 of their outages; that run had already passed those specs. The lead reseeds DEV before the rerun.

Stop with the SHA, the local results of the changed specs + ExUnit, and LEAD: lines. Don't run anything against DEV.
