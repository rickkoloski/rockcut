# D50: lead decisions 3: DEV fix cycle 1

2026-11-08 · lead → builder50.

## Where things stand

- **DEV gate on `67c6629`:** the full DEV Playwright run passed (694 passed, 0 failed). The
  independent QA verdict is "pass with gaps", with no must-fix.
- **The QA report:** `docs/current_work/stepwise_results/d50_dev_qa_report.md`. Read gaps 1 and 4
  there.
- **Matt's decisions:**
  - fix gap 1 and gap 4 in D50;
  - gaps 2 and 3 are backlog (tasks 5210 and 5211); don't touch them.
- This is fix cycle 1 of 2.

## Gap 1 (should-fix): a valid code from someone who may not make the change

This reverses lead decision 4 and matches spec §2.2 ("That staff code can't do this here").

- In `StaffCodeActing`, a code that resolves to a **real person** who fails
  `Authz.can?(person, :write, resource)` becomes a new refusal. It answers 422
  `staff_code_not_allowed`: "That staff code can't do this here".
- It **doesn't count** toward the lockout (`RateLimiter.failure/1` isn't called), and nothing
  changes.
- A code that resolves to nobody stays as it is: 422 `staff_code_invalid`, counted.
- A locked device still answers 429 before any code is checked, so a locked device never reveals
  whether a code is valid.
- **This applies everywhere `StaffCodeActing` is used:** production, the task boards (D40 S45) and
  Buy-a-Beer. Update the existing tests that expected `staff_code_invalid` for a valid code from
  the wrong department, and list them in the status.
- **Tests (each fails with the fix reverted):**
  - ExUnit: a Taproom person's code on a production write and on a Brewery board write gives the
    new error, nothing changes, and the counter doesn't move. Five such tries don't lock; five
    wrong codes still lock.
  - A Brewery person's code on the Taproom tablet's board and on Buy-a-Beer gets the same answer.
- **UI:** the code dialog shows the server's message. Check it handles the new error like
  `staff_code_invalid`: dialog open, field cleared, the message shown.
  - Vitest for `lib/acting` if it maps errors.
  - A Playwright case on the device: a TT-taproom person's code → "can't do this here", no
    lockout after 5 tries.

## Gap 4 (minor): confirm before removing a tank condition mark

- Removing a condition mark (tank → History → "Remove: Marked …") gets a confirm step, like
  deleting an out-of-service period or a CIP.
- On a device, the code dialog (if no window is open) comes **after** the confirm, as the other
  deletes do.
- One Playwright case (person and device): the confirm appears; Cancel keeps the mark; Remove
  deletes it.
- **Locator rule in that spec:** click the confirm inside the dialog by its exact name. Never
  "the next Remove".

## Then

1. Run the non-Playwright gate: `mix test` twice, `mix compile --warnings-as-errors`, `tsc`,
   `vite build`, vitest, lint ≤ 26.
2. Run your new and changed specs against the local servers. Log with
   `2>&1 | tee /tmp/claude-501/pwlogs/d50_fix1_*.log`.
3. Append "Fix cycle 1" to the status file, commit with `stop 4`, and stop.

The lead redeploys DEV and runs the DEV checks.
