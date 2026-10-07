# D37 QA acceptance report: Buy-a-Beer Board + staff codes (DEV)

| | |
|---|---|
| Tester | Claude (independent QA agent), run for matthewheiser@gmail.com |
| Time | 2026-10-07, about 15:20–15:50 UTC |
| Target | https://rockcut-ui-dev.fly.dev / https://rockcut-api-dev.fly.dev, build D37 `b71174b` (as briefed) |
| Method | Node + Playwright (Chromium, `America/Denver`, 1280×800 unless noted, 390×844 for phone). I acted only as the persona files, `[TEST-TEMP]` people I created as `owner`, and `[TEST-TEMP]` tablets I paired. I made API calls from inside the page with the page's own token. No tokens, persona codes or throwaway codes appear in logs, screenshots or this report (a final grep for `ses_`/`dev_` in `results/`, `shots/`, `fixtures/` and `scripts/` found nothing). Scripts are in `scripts/`, raw logs in `results/`, screenshots in `shots/`, CSV fixtures in `fixtures/`. |

## Result: **PASS with gaps**

All 31 scenarios behave as specified at the data level. I found **1 must-fix** in the Users & Roles path used by S12, plus **9 minor** gaps. The cross-origin CSV paths, the concurrency paths and the tablet limiter, which the author could not verify, all work on DEV.

## Gaps

### G1 (must-fix): A manager who removes someone from the Taproom sees "Forbidden", and the rest of that save is lost
- **Path:** `barMgr` → Users & Roles → edit a `[TEST-TEMP]` Taproom employee (who has a code) → set Taproom to "— None —" → Save.
- **Expected:** The save completes, the dialog closes, and the code is cleared (S12).
- **Observed:** The dialog stays open with **"Forbidden"** (`shots/UR_barMgr_remove.png`). The UI sends `PUT /api/users/:id/memberships {"memberships":[]}` first (200). It then sends `PATCH /api/users/:id` (name/active/schedulable), which returns **403** because Casey no longer manages that person. So the membership removal and code clearing did happen, but any other edit in the same save (such as a name change) is silently dropped, and the manager is told it failed. Deactivating, promoting and renaming as `barMgr` all work, and so does the same save as `owner`. Those paths send the PATCH while the person is still manageable.
- **Repro:** `scripts/probe9.mjs`, log `results/probe9.log` (the "barMgr remove" line).

### G2 (minor): The 5th wrong code already gives the lockout message instead of an inline wrong-code error
- **Path:** a `[TEST-TEMP]` tablet → Add from chalkboard → enter an unused code 5 times, then a 6th time.
- **Expected (S9):** An inline error on each of the 5 wrong attempts; the 6th attempt is locked.
- **Observed:** Attempts 1–4 show "That staff code isn't right". **Attempt 5** already shows "Too many wrong codes. Try again in 10 minutes, or use Sign in as me." So does attempt 6. The lock itself is correct (nothing was written; see S9). Either the spec or the UI wording needs to change.
- **Repro:** `results/phaseD.log` from the first run (lines "S9 attempt 1..6"), `shots/S9_wrong_1.png`, `shots/S9_locked_6.png`.

### G3 (minor): A staff code is shown in clear text while it's being typed in Users & Roles
- **Path:** `barMgr` → Users & Roles → edit a `[TEST-TEMP]` person → Staff code → type digits (for a new code, or to change an existing one after pressing the eye to hide).
- **Expected:** The code is masked, with an eye to reveal it.
- **Observed:** A saved code reopens masked (`••••`), and the eye reveals it and hides it again on reopen (correct). But the digits being typed are plain text, with no eye shown for a new code, so anyone looking over the manager's shoulder can read the new code. The tablet field is masked while typing (CSS `-webkit-text-security: disc`); this dialog isn't.
- **Repro:** `results/phaseA2.log`, `shots/S1_typing_existing_field.png`. The equivalent screenshot of a brand-new code was deleted because it showed the digits.

### G4 (minor): Pasting a code with a space or dash into the tablet field keeps only 3 digits
- **Path:** tablet → any write → paste into "Your staff code".
- **Expected:** Digits only, up to 4.
- **Observed:** The field filters out non-digits correctly, and letters and full-width digits are rejected. But the browser's `maxLength=4` truncates the raw pasted text before the filter runs. Pasting `" 1234"`, `"12 34"` or `"12-34"` leaves 3 digits, which then fails as a wrong code and spends a limiter attempt. `"1234 "` and `"123456"` give 4 digits. Masking holds at 1280×800 and 390×844 while typing and pasting.
- **Repro:** `scripts/phaseI.mjs`, `results/phaseI.log` (real clipboard and Ctrl+V on `taproomDevice`, with no submit).

### G5 (minor): Any extra column makes import refuse the whole file
- **Path:** Import CSV → a file with a `Notes` column (common in a hand-kept Excel sheet).
- **Expected (LIMITATIONS 3):** Extra columns are tolerated, or at least the refusal is clearly intended.
- **Observed:** "Row 1: Unknown column "Notes"", and nothing can be imported. Reordered columns, header case and spaces, and a blank stray header column all work. The exported `Imported` column is accepted.
- **Repro:** `results/phaseE3.log` (`extra_reordered_cols`), `results/phaseE4.log`.

### G6 (minor): History "Export CSV" ignores the search box
- **Path:** `barMgr` → Board → History → search "qspu" → Export CSV.
- **Expected:** The export matches what's on screen, or the UI makes clear it exports everything.
- **Observed:** The download has all 336 history rows. Otherwise the content is correct, including the "Shared device" yes/no and "import" source columns and `'`-prefixed formula names.
- **Repro:** `results/phaseG.log`.

### G7 (minor): History search doesn't match "Who"
- **Path:** History → search "Sam Pour", or "Shared Device".
- **Observed:** "Nothing matches that search." Search only matches For and Bought by, so a manager can't answer "what did Sam do?". The spec only says "Searchable", so this may be intended.
- **Repro:** `results/phaseG.log`.

### G8 (minor, wording): History says "Added", where the spec and the API say "created"
- **Path:** History (S6, S22).
- **Observed:** The UI shows `Added` / `Added (import)`; the API and CSV say `created`. The other actions are Redeemed / Edited / Deleted (+ "(import)"). The meaning is the same, but it doesn't match the acceptance wording.

### G9 (minor): After "Only N left" the Redeem dialog keeps stale numbers
- **Path:** `bartender1` opens Redeem on an entry with 5 left and steps to 5. Another user redeems 2. Then press Redeem.
- **Observed:** The inline "Only 3 left" is correct and nothing changes. But the dialog still says "· 5 left", keeps the stepper at 5, and still says "This uses the last 5 beers … and removes the entry." The user has to cancel and reopen to see the real count.
- **Repro:** `results/phaseB.log` ("Only N left UI"), `shots/only_n_left.png`.

### Observations (not counted as gaps)
- **Add-mode staleness only covers matching names.** An unrelated change (a redeem on another entry) between preview and Confirm still lets an Add import apply. Replace does detect an unrelated add mid-flow: it returns 409 and nothing is deleted. I think the Add behaviour is reasonable, but the spec wording ("if the board changed") is broader.
- **Remove deletes a code immediately.** Users & Roles → Staff code → **Remove** clears the code at once (`DELETE …/staff_code`), before Save. Pressing Cancel afterwards doesn't bring it back.
- **Pick with no boxes checked still allows Confirm.** It shows "Deletes 1 entry on the board", so the group ends up with nothing on the board.
- **Future moved-off dates are accepted** on import (e.g. 12/31/2027).
- **`newhire` can write through the API before resetting their password.** While the UI blocks them at "Set a new password", `POST /api/beer_board` with their token returns 201. This is probably app-wide and pre-existing, not D37.
- **The seed rows' History "Who" is "—"**, since the lead's seed/reset has no actor.

## Scenarios

| # | Result | Evidence |
|---|---|---|
| S1 | PASS (see G3) | Saved code reopens masked; the eye reveals the exact code (aria "Show/Hide staff code"); masked again on reopen. List columns are Email/Name/Roles/Status, and the `/api/users` JSON has only `has_staff_code`. |
| S2 | PASS | Same code on a 2nd person → "That code is already in use"; Suggest fills a different 4-digit code, which saves. API rejects 3/5 digits, letters, a space, a number type and empty (422). |
| S3 | PASS | `barMgr`'s list doesn't show `brewer1` at all. `PUT /api/users/<brewer1>/staff_code` → 422 "Only active Taproom staff can have a staff code" (also as owner). |
| S4 | PASS | `breweryMgr`: no section in `brewer1`'s dialog, and Taproom people aren't listed. `bartender1`: `/users` goes Home. GET/PUT/DELETE `…/staff_code` → 403 for both. |
| S5 | PASS | Add as `bartender1`: no code prompt; after reload listed with "Oct 7, 2026" and Imported blank; no History tab or Import/Export; history/import APIs 403. |
| S6 | PASS (G8 wording) | History: "Oct 7, 2026, 9:30 AM · Sam Pour · Added · … · 3"; API `action: created, actor_name: Sam Pour`. |
| S7 | PASS | `taproomDevice` redeem with a `[TEST-TEMP]` code: 3 → 2; toast "Redeemed 1 for …. Recorded as [TEST-TEMP] QA T1 …"; History "… on Shared Device · Redeemed · 3 → 2". |
| S8 | PASS | Last-beer dialog says "This uses the last beer for <name> and removes the entry."; gone after reload; History 1 → 0. |
| S9 | PASS (see G2) | `[TEST-TEMP]` tablet: inline errors, then the lock message; attempt 6 locked "Try again in 10 minutes"; a **valid** code is refused while locked (UI, and API 429 `staff_code_locked`); board unchanged (5 → 5). |
| S10 | PASS | `POST /api/beer_board` with no code → 422 `staff_code_required`; redeem, PATCH and DELETE without a code are also 422, and the entry is unchanged. |
| S11 | PASS | With a `[TEST-TEMP]` manager's code: history, `export.csv`, `history/export.csv`, `import/preview`, `import`, `/api/users` and `…/staff_code` all → 403 "Not available on a shared device". No History tab or file buttons, before or after a write with the manager's code. |
| S12 | PASS functionally / **G1** on the UI path | After removal from Taproom, `has_staff_code` is false (and stays false after re-adding); the old code on the tablet → "That staff code isn't right". Deactivation also clears it. After a code change the old code fails at once and the new one works. |
| S13 | PASS | Tablet → Sign in as me (`[TEST-TEMP]` person, first-time password reset) → Redeem with no code prompt; History shows the plain name (`on_shared_device: false`); Sign out returns to the shared screen. |
| S14 | PASS | `floater`: nav entry, board, Add/Redeem; no History/Import/Export; history API 403 (same as `bartender1`/`bartender2`). |
| S15 | PASS | `office1`, `brewer1` (and `brewer2`, `breweryMgr`, `sales1`, `noDept`, `hidden`): no nav entry, typed URL goes to `/`, board API 403 for GET and POST. |
| S16 | PASS | `owner`/`owner2`: board, History, Import/Export; a Taproom member's dialog has the Staff code section and shows the right code; no section for `brewer1`. |
| S17 | PASS (5/5 runs) | Real parallel submits (bartender1 + bartender2 ×3, bartender1 + tablet, tablet + bartender2): one 200, the other 404 "This entry was already removed", and the row disappears for both. Stale redeem, edit and delete dialogs give the same message. |
| S18 | PASS | "chr" → 3 rows (a For match, a Bought by "CHRIS" match, and "[SEED] Chris"); "CHRISSY" is case-insensitive. Every column sorts asc/desc; default is For A–Z. |
| S19 | PASS | Edit 2 → 5 saved; History "Sam Pour · Edited · 2 → 5". |
| S20 | PASS | Download (cross-origin `fetch` + Blob) `buy-a-beer-board-2026-10-07.csv`: header plus one row per entry; `"… Smith, Ana","Lee ""The Pour"" Kim"` intact. |
| S21 | PASS | Preview: New (1) Ana; 2 groups (Pat board + file, matched case-insensitively; Sam ×2 in the file); Import disabled until both groups are resolved. |
| S22 | PASS | Combine pre-fills "Chris & Lee"; Pat is the same entry, 5 beers, original moved-off date, Imported blank; two Sams and Ana have today's import date; History: Edited (import) 2 → 5 and Added (import) ×3. |
| S23 | PASS | Pick: "Deletes 1 entry on the board"; afterwards only the file's Pat / Lee / 3; History deleted (import) and created (import). |
| S24 | PASS | 60 + 60: "Combine (over 99)" is disabled; Pick enables Confirm; Allow imports both. |
| S25 | PASS | "This deletes all 6 entries on the board (total 19 beers) and imports 2." The Ana group must be resolved; Confirm stays disabled for `replace` or `REPLACE ` and enables for `REPLACE`; the board then equals the file; History has a deleted (import) per old entry, then 2 created (import). |
| S26 | PASS | "Row 3: For is blank", "Row 5: Beers must be a whole number from 1 to 99"; Import disabled; board unchanged. |
| S27 | PASS (3/3) | A bartender adds a matching For name (sequentially, and twice truly in parallel with Confirm) → 409 "The board changed since your preview. Nothing was imported." with a Re-preview button; re-preview shows the new board member in a group. |
| S28 | PASS | Export → Replace with that file: the same 5 names, counts and exact moved-off timestamps; every Imported is now 2026-10-07. |
| S29 | PASS | Export writes `'=HYPERLINK(…)`, `'+`, `'-`, `'@` (and a Bought by `'=1+2…`); re-import restores the originals exactly; a real leading apostrophe ("'Tis") survives the round trip. |
| S30 | PASS | No column → moved-off is the import time. `9/15/2026` → Sep 15 and `2026-09-14` → Sep 14 (stored 06:00Z, so correct in Denver); blank → import time; all rows Imported today. |
| S31 | PASS | Added by hand: Moved off board "Oct 7, 2026", Imported blank. |

Real-device checks (Samsung/Pixel numeric keypad, CSV download inside the Android PWA): **NOT RUN**, left for a human as briefed.

## LIMITATIONS: what I found

1. **Cross-origin calls work.** Board export, History export and the Replace dialog's "Export first" all download through Blob with the right filename and content. Multipart import preview and apply work in Add and Replace.
2. **Concurrency holds with real latency.** S17: 5/5 runs, one winner and one "already removed" each time. S27: 3/3 runs refused with 409 and nothing applied. Replace with an unrelated bartender add mid-flow was also refused, so no uncounted entry was deleted. In Add mode, unrelated changes don't block Confirm (see Observations).
3. **Real spreadsheet files** (`fixtures/L3_*`, `results/phaseE3.log`):
   - **Accepted:** UTF-8 BOM, CRLF, quoted fields with commas and `""`, trailing blank and `,,,` lines, Numbers-style all-quoted LF with ISO dates, reordered columns, header case and spaces, a stray empty column, emoji/accents in UTF-8, padded names (trimmed), and in-file duplicates that differ only in case or whitespace (grouped).
   - **Refused with clear row errors:** day-first `13/9/2026`, `9/5/26`, `;`-delimited files, Windows-1252 ("The file isn't UTF-8 text. Save it as CSV UTF-8."), a renamed .xlsx, a missing Beers column, header-only files, For over 80 characters, and Beers `3.0` / `"1,0"`. `1/9/2026` is read US-style as Jan 9 (intended).
   - **Gap:** any extra column refuses the whole file (G5).
4. **Tablet code field:** `type=text`, `inputMode=numeric`, `maxLength=4`, `autocomplete=off`, `-webkit-text-security: disc`. It stays masked while typing and pasting at both 1280×800 and 390×844, and accepts only digits. Paste truncation is G4.
5. **The limiter is per tablet.** Locking a `[TEST-TEMP]` tablet did not lock `taproomDevice`; the S7 write right after it succeeded. A good code on the locked tablet was refused until the lock ends (UI and API 429).
6. **Side effects:**
   - Users & Roles edits for non-Taproom people have no Staff code section.
   - Deactivating, promoting and renaming Taproom people work, and deactivation clears the code.
   - **Removing someone from the Taproom as a Taproom manager misreports "Forbidden" (G1).**
   - The Taproom nav and board work at phone width with no horizontal scroll.

## Clean-up
- **People:** all 26 `[TEST-TEMP] QA …` people I created (ids 735–763, mine only) are deactivated, and none still has a code.
- **Tablets:** my 3 `[TEST-TEMP]` devices (737, 748, 754) are deactivated, and their 4 paired tablets show as revoked.
- **Board:** all `[TEST-TEMP]` entries were deleted, and the board was restored from my pre-Replace export. It now holds the 5 `[SEED]` entries with their original names, counts and moved-off dates. Their **Imported date is now 2026-10-07** because of the Replace round trips, so the lead's reset is still needed.
- **History:** it keeps the `[TEST-TEMP]` rows by design, since it survives deletes.
- **Not cleaned up:**
  - Opening "Pair a tablet" in recon produced 2 unused pairing codes: one on the shared "Taproom tablets" device and one on my device 737. Both expire after 10 minutes and were never used. The live `taproomDevice` tablet (token 399) was never signed out or revoked.
  - The persona codes for `barMgr`, `bartender1` and `bartender2` were not read, changed or removed. Each still shows `has_staff_code: true`.
- **No credential requests** came up beyond the brief.
