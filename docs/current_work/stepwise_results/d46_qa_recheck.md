# D46 QA recheck (DEV, build ad7a48b)

Rechecked 2026-10-21 (America/Denver), mostly as brewer1, with brewer2 for the two-person checks. Scripts are `scripts/rc_*.mjs`, logs `results/rc_*.log`, screenshots `shots/RC*`. The ids I created are recorded in `results/recheck_ids.json`.

## Summary

All 10 rechecked items are **FIXED**: M1 and minor 1–9 (findings 4 and 8 are counted under M1 and with capacity/names). P14–P17 pass again. The recheck found **4 new minor issues**, all in edge paths:
- N1: Transfers can't be added or moved out of day order, and the error doesn't say why.
- N2: removing a middle Transfer leaves an orphaned tank.
- N3: the ramp preview and the server disagree on the largest change per day.
- N4: two messages are misleading.

None of them can corrupt data; the server refuses or flags every bad state. Findings 10–12 from the first report weren't on the fix list and are unchanged.

## Findings from the first report

| # | Verdict | Evidence |
|---|---|---|
| **M1** second Transfer/Filter | **FIXED** | **UI:** the field is now "Into tank", with help text such as "Moves the beer out of the first tank into a new tank." It offers only the next new tank. Transfer 1 → v1 (CIP on First tank), Transfer 2 → v2 (CIP on After transfer 1), Filter → v3 (CIP on After transfer 2). The Edit dialogs show the right tank. **API:** a Transfer into tank 0, into an existing tank 1, or skipping ahead to tank 5, and a Filter into an existing tank 2, all get 422 `transfer_not_new_tank`. PATCHing a Transfer into an existing tank also gets 422. A plain step in tank 7, a phase marker in tank 9, and a PATCH moving a CIP into tank 8 all get 422 `no_such_tank` ("That tank doesn't exist yet. Add the Transfer or Filter into it first."). `vessel_index -1` → 422. (`rc_m1*.log`, `shots/RC_M1_two_transfers.png`) |
| 1 link pickers | **FIXED** | Rouse (day 7): "Comes after" offers only Brew day 0 and Fining 7; "Leads to" offers only steps on day 7 or later. Gravity check (day 5): "Comes after" offers only Brew day. Steps that are already linked, or would make a loop, aren't offered. Before a day is entered, the Add step picker lists everything, which is reasonable. (`rc_links.log`) |
| 2 immediate saves | **FIXED** | The tank and step dialogs now say **Close**. Delete period asks "Delete the out-of-service period Thu Oct 15 – until further notice?" (Cancel keeps it). Remove link asks "Remove the link from Gravity check to Rouse? …" (Cancel keeps it). (`shots/RC2_outage_delete_confirm.png`, `RC2_remove_link_confirm.png`) |
| 3 stale editor | **FIXED** | A stale edit, a stale remove, and adding a step linked to a removed step all show "This was removed by someone else. Reload to see the latest." with a **Reload** button. Reload closes the dialog and shows the current list. (`shots/RC3_stale_edit.png`). See also N4b. |
| 4 API vessel_index | **FIXED** | Covered under M1 (`no_such_tank`, `transfer_not_new_tank`). |
| 5 ramp preview | **FIXED** | 90→20 shows "Start and target are whole degrees from 28 to 80°F." 58.5 shows the same message. 0.5 or 0 per day shows "The change per day is a whole number of degrees, at least 1." The preview text is replaced by the error. The API refuses 0.5 per day, and a Set temp of 45.5 (422). One gap remains: see N3. (`shots/RC5_*.png`) |
| 6 contrast | **FIXED** | Measured in light / dark mode: "Out Oct 28–Nov 3" outline chip 6.57 / 6.92:1. Current "Out from Oct 15" filled chip 6.57 / 6.57:1. "Incomplete" badge 6.80 / 9.13:1. The theme was put back to Light (`color_mode=light`). |
| 7 phone preview | **FIXED** | At 412 px the timeline scrolls (649 px of content in a 330 px area) and the page itself doesn't scroll sideways. The tank labels stay at x=41 before and after scrolling, and 5 fade overlays are present. (`shots/RC7_phone_tpl25_scrolled.png`) |
| 8 capacity / names | **FIXED** | 10000 → "Capacity must be under 10,000 bbl." "Ｆv1" (UI) and "ｆｖ１" (API) → "A tank named FV1 already exists." |
| 9 copy | **FIXED** | The "Add phase start" help text is now only "Comes after: moving that step offers to move this one too." |
| 10 a11y nested buttons | Not in the fix list; unchanged | The sortable row is still `role=button` with Edit, Retire and arrow buttons inside it. |
| 11 lost update | Not in the fix list; unchanged | brewer1 moved Carb to day 37 and brewer2 then saved only a note. Result: day 36 with brewer2's note, and both users saw "Saved." |
| 12 "Copy of …" | Not in the fix list | Not rechecked. |

## New issues (all minor)

**N1. Transfers can't be added or moved out of day order, and the error doesn't say why.**
- **Path:** on a template with Transfers on days 20 and 25 and a Filter on day 28, add a Transfer on day 22. Or edit the day-20 Transfer to day 27.
- **Expected:** either allowed (with the later tanks renumbered), or refused with an explanation.
- **Observed:** "Into tank" is set to "After transfer 2", a tank that already exists. Then the server refuses with "A transfer moves the beer into a new tank." That doesn't explain the actual rule: transfers must stay in day order, and you can't add one before an existing one. Data stays consistent. (`rc_m1c.log`, `rc_m1d.log`)

**N2. Removing a middle Transfer leaves an orphaned tank.**
- **Path:** remove the day-25 Transfer from the template above.
- **Observed:** this is allowed. The CIP that belongs to tank 2 and the Filter into tank 3 remain. The banner lists "The tank after transfer 2 has no Transfer or Filter starting it." and two further reasons. Adding a Transfer back on day 25 repairs it.
- **Suggest:** warn in the Remove dialog that later tanks depend on this Transfer. (`rc_m1e.log`, `rc_m1f.log`, `shots/RC_M1_remove_middle.png`)

**N3. The ramp preview allows a bigger change per day than the server.**
- **Path:** a ramp of 80→28 with 100° per day.
- **Observed:** the dialog previews "2 Set temp steps: 80°, 28° on days 30–31." with no error. The server then refuses with "Enter start and target temperatures from 28 to 80°F, a change per day of at least 1°, and a first day.", but none of those conditions is broken. The server's actual cap is |start − target|: 52 is accepted, 53 is refused.
- **Suggest:** the dialog either clamps the change to the gap or says so. (`rc_links.log`, `rc_rampcap.log`)

**N4. Two misleading messages.**
- **a)** A step placed in a tank after the beer has left it (for example a step on day 22 in the First tank when its Transfer is on day 20) is accepted. The banner then says "The first tank has no Package, Split or Transfer.", but it does have one. It should name the step that comes after the exit. (`rc_afterexit.log`, `shots/RC_new_after_exit_banner.png`)
- **b)** Opening a template id that doesn't exist (for example an old bookmark: after the reseed the seeds are ids 22–24, and /templates/3 now returns 404) shows "This was removed by someone else. Reload to see the latest." Reloading can't help. It should say "Template not found" and link back to Templates.
- **c)** Copy nit: "Moves the beer out of the after transfer 1 into a new tank." should read "out of the tank after transfer 1".

## P14–P17 re-run (UI, brewer1, template 26)

| # | Result |
|---|---|
| P14 | PASS: 14 entries in day order. The Transfer on day 35 went into v1 and added a CIP on the First tank on day 35. No issues banner. The preview shows both tanks and all phases. |
| P15 | PASS: Set temp 58°, 48°, 38°, 32° on days 18–21, with 3 chain links. |
| P16 | PASS: the row shows "after Carb · stays". |
| P17 | PASS: the banner shows "The tank after transfer 1 has no Package, Split or Transfer." and the list shows Incomplete. |

## Cleanup (only ids created in this recheck)

| Kind | Id | Name | Action |
|---|---|---|---|
| outage | 16 | `[TEST-TEMP] RC` | deleted (200) |
| tank | 26 | `[TEST-TEMP] RC1` | retired (200) |
| template | 25 | `[TEST-TEMP] RC M1` | retired (200) |
| template | 26 | `[TEST-TEMP] RC Lager` | retired (200) |

- No create attempt was accepted other than these. Every other tank I tried to create (capacity 10000, "Ｆv1", "ｆｖ１") was refused with 422.
- Steps I added inside templates 25 and 26 went with those templates. I deleted three steps I had made in template 25 before retiring it.
- Afterwards: 9 seed tanks in positions 1–9 (Serving 2 still has its 2 outages), 9 phases, 19 step types, 3 `[SEED]` templates active, brewer1's theme on Light.
- Nothing was retired or deleted by id range or name pattern. No persona was changed, and no tokens were printed.
