# D53 Part 2: lead decisions 6 (DEV suite)

2026-11-08 · lead → builder. DEV runs `588a372`. Full suite on DEV: **638 passed, 2 failed, 4 did not
run** (log `/tmp/claude-501/pwlogs/d53p2_dev1.log`). Both failures are test-side. Fix them only; no
app changes.

1. **S261** (`ideas/boards-scenarios.spec.ts:238`): fails 3/3 on DEV. It clicks the note's Save and
   reloads at once, so on DEV the reload cancels the PATCH ("Second note" comes back unedited). Wait
   for the save to land before the reload (the note showing "edited", or the response), as the
   persist-verify rule asks. Check the other ideas specs for the same click-then-reload pattern and
   fix any you find.
2. **S160** (`ui/schedule.spec.ts:121`): passes 3/3 alone. In the full run, stop 5b's
   `[TEST-TEMP] Theme …` Brewery person (`ui/theme.spec.ts`, same `chromium` project, another worker)
   appeared in the Scheduler roster between S160's reads, at row 2, which is in the path of S160's
   "↑ twice". Make them independent. Prefer keeping the theme person out of the Scheduler roster
   (whatever the app offers, through the API), or else make S160 robust to `[TEST-TEMP]` rows
   appearing, without weakening what it checks. Say which in the status.

Run: `tsc`, lint, both files on **local** with `--repeat-each 3` (servers are up; reseed first if
needed). **Never set `E2E_TARGET=dev`**. Append to the status file, commit with a message containing
`decisions 6 done`, then stop.
