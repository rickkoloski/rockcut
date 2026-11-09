# D50 QA recheck after fix cycle 1

- **Build:** `6593442d6bddb2075c82c3263e7d656996476259` (`/api/health` sha `6593442d…`). Reseeded after the deploy.
- **Environment:** DEV only. Prod was not touched.
- **Date:** 2026-11-09, about 09:20–09:50 America/Denver
- **Sizes:** 1280×800 with touch and 1366×768 with a mouse; each result says which.
- **Personas used:** `breweryDevice`, `taproomDevice`, `owner`, `breweryMgr`, `brewer1`, `brewer2`, `bartender1`.
- **Coded people made for this run:** TT-brewer A, TT-brewer B (Brewery), TT-taproom (Taproom). No owner code was needed.
- **Deliberate lockout:** the Brewhouse tablet was locked once, in R1, at **09:26:30**. It cleared by itself at **09:36:32**. Nothing else locked either tablet.

**Verdict: pass.** Gap 1 and gap 4 are fixed. No new gaps, and no regressions in the sweep.

## Summary

| Severity | Count | Gaps |
|---|---|---|
| must-fix | 0 | none |
| should-fix | 0 | none (gap 1 fixed) |
| minor | 0 new | gap 4 fixed; gaps 2 and 3 are in the backlog (tasks 5210, 5211) and not rechecked, but gap 3 was seen again in passing (R4) |

## Fixed gaps

### Gap 1 (should-fix): fixed
- **Original repro, both sizes:** the Taproom person's code on a Gantt Notes save and on a board check-off, 6 times each at mouse size and 6 times each at touch size (24 tries in all). Every try returned `422` "That staff code can't do this here". The dialog stayed open with the field cleared, nothing changed on the server, and there was no lockout. A's code then went through straight away.
- **Mixed with wrong codes (mouse):** Gantt W, T, W, T, W, T, then board W, T, W, where W is an unused code from `/staff_codes/suggest`. Each wrong code said "That staff code isn't right". The 5th wrong code locked the tablet (429, "Too many wrong codes. Try again in 10 minutes."); the four Taproom codes in between didn't count.
- **While locked:** the Taproom person's code and A's correct code both got 429 "Too many…", not "can't do this here". Nothing changed. The lock counted down 5 → 4 → 3 → 2 → 1 minutes and cleared after 10 minutes.
- **Reverse on the Taproom tablet (touch):** A's code on the board (Add a task) and B's code on Buy-a-Beer (Add from chalkboard), twice each, all got `422` "That staff code can't do this here". Nothing was created and the dialogs stayed open. The Taproom person's code then worked on Buy-a-Beer, so the tablet wasn't locked.
- **Brewery code on the brewhouse device still works:** after the 24 Taproom tries, A's code checked off P5's PDH, recorded as A "on Brewhouse tablet".

### Gap 4 (minor): fixed
- **Person (breweryMgr at mouse, brewer1 at touch):** tank → History → "Remove: …" opens one dialog named "Remove mark", which names the mark ("Remove “Marked dirty by Morgan Mash · Mon Nov 9 · …” from Serving 3's history?"), with Cancel and Remove. Cancel sends no request and keeps the mark. Remove deletes it with no code. Undo restores it under the same id.
- **Device (touch and mouse), with A's window ended first:** the confirm comes first with no request, then the code dialog after Remove; the delete happens only after the code. Cancel keeps the mark; Undo puts it back.
- Only marks I made were removed. The seeded Serving 3 mark (id 422, Jake Brewer) was untouched throughout.

## Scenarios

| # | Result | Size(s) | Notes |
|---|---|---|---|
| R1 | PASS | both (mixing and lockout at mouse) | See gap 1 above. 13 checks. |
| R2 | PASS | both | See gap 4 above. 12 checks. |
| R3 | PASS | both | **Code dialog messages:** empty or 2-digit code → "Enter your 4-digit staff code" and no request is sent; wrong code → "That staff code isn't right"; locked → "Too many wrong codes. Try again in 10 minutes." (R1). **Out-of-service delete** ("Delete period") and **CIP delete** ("Delete CIP & Sanitize") each confirm exactly once for breweryMgr (mouse) and on the device (touch); on the device no code was asked because the window was already open from the add. **A person removes a mark** with one confirm and no code (R2). |
| R4 | PASS | see notes | **Q2** (both sizes): step, batch, tank expand, flags and Task list open with no writes; the first change asks for a code, and Cancel writes nothing. **Q3** (both sizes): drag → code → move prompt → Apply; "Acting as" banner; a second drag asks no code; Shift-click (mouse) or long-press then tap (touch) selects two steps, and a block drag moved both 2 days; Done ends it and the next change asks. The 5-minute idle wait wasn't re-run. **Q5** (both sizes): after A's Done, B on Undo → "Only [TEST-TEMP] can undo this.", nothing changed and B not left acting; A undoes. brewer2 on brewer1's change → 403 "Only Jake can undo this."; brewer1 undoes; a second undo → 404. **Q10**: board check-off of Brew day → code → batch-number prompt → move prompt → #950; Mark not done restores dates and P5 (mouse). Notes, Change day (with prompt), assign and Take off each asked a code (touch). The Gantt agrees after reload. **Q9** (both sizes): typed production URLs → "Not available on a shared device" or Page not found; all 25 production API routes → 403. **Q14**: breweryMgr and brewer1 Gantt, step save, batch dialog, Plan batch and setup pages work with no code; bartender1 can't open Production (API 403); Taproom board add and check-off and Buy-a-Beer add and redeem work with the Taproom person's code. **Pairing:** both seeded tablets reload into their shared session (`/api/me` kind `device`, chip "Shared device · Brewery/Taproom") at both sizes. |

## Observations
- Gap 3 (backlog) is still visible: P5's Carb, taken off the list from the board, is no longer on the Gantt.
- The "can't do this here" refusal clears the code field, like the other refusals, so screenshots never show a code.

## Data made and cleaned
| Item | Id(s) | Cleanup |
|---|---|---|
| People TT-brewer A, TT-brewer B, TT-taproom (with staff codes) | 3817, 3818, 3819 | Deactivated by exact id |
| Brand `[TEST-TEMP] D50 QA Ale` | 3279 | Deleted (204) |
| Batch P5 (device plan) and X2 (breweryMgr pencilled, Q14) | 5387, 5388 | Deleted |
| Condition marks on Serving 3 (`[TEST-TEMP] R2 …`) | 425–429 | Deleted by exact id; Serving 3 back to the seed mark only ("Sani 2 days") |
| Out-of-service periods on Serving 3 (Feb 15–16 2027) | 735, 736 | Deleted in the test |
| CIPs on Serving 3 (Feb 20 2027) | 72689, 72690 | Deleted in the test |
| Taproom task `[TEST-TEMP] QA taproom task` | 121815 | Deleted by exact id |
| Buy-a-Beer entry `[TEST-TEMP] R1 guest` | 3594 | Redeemed, which removes it |

No messages were posted. No seeded persona, device or setting was changed: both tablets still have show planned batches on and the light theme.

## What I couldn't test
- **Pushing the reverse case on the Taproom tablet past 4 tries:** I stopped at 4 so a broken fix couldn't lock the seeded Taproom tablet. Nothing on the tablet showed a lockout, but 4 tries can't prove those codes don't count.
- **Mixing wrong and Taproom codes at touch size:** only one deliberate lockout was allowed, so the mix ran at mouse only. Taproom-only codes were run at both sizes.
- **The Q3 5-minute idle window:** not re-run in this sweep.
- **Real hardware and the installed app** (Matt's check), as before.
