# D53 Part 1: lead decisions 3 (fix cycle 1)

2026-11-07 · lead → builder, from the DEV QA report
(`docs/current_work/stepwise_results/d53_part1_dev_qa_report.md`, build `6d7811c`). Read
gaps 1, 2, 3, 7 and 10 there; each has a repro. You've been cleared, so also read the brief
`d53_part1_builder_brief.md`, the spec §3 and the status file's "Carry to the DEV handoff".

**Local servers run from `~/src/rockcut-d53`. DEV stays claimed but idle; never set
`E2E_TARGET=dev`.** Run `npx playwright test --project setup` before local Playwright (the
auth files hold DEV tokens), and `mix rockcut.synthetic.setup` if the seed is stale. One
project at a time, with `caffeinate -ims`.

## First: is it new?

For gaps 1 and 2, find out whether `develop` before Part 1 (`b3670d0`) does the same with
one `assignee_id`, and with `title` and `notes`. Read the code, or run it in a throwaway
test. Report it either way. It decides what the PR says, not whether we fix people.

## Fix

**Rule for gaps 1 and 2: a rule change never changes anyone's people on a date that
survives it.**

1. **Gap 1.**
   - An occurrence whose date survives keeps its own people.
   - A **new** date the rule adds takes the people of the last occurrence before it in the
     chain.
   - The series' own list, used by later top-ups, must stay correct: dates beyond those
     already generated continue from the latest people, as today.
   - The confirm's text and the rule-change History stay accurate.
2. **Gap 2.** A surviving occurrence changed on its own stays marked as changed on its own
   after a split, so a later "following" edit leaves it alone. Check this for the anchor
   too: if the anchor's flag has a reason to clear, say so before changing it.
3. **Gap 3.** Cap `assignee_ids` at **100 distinct ids**: over that is a quick 422 with one
   message, before any lookup. Below it, keep naming people, with the message capped too.
   ExUnit at 100, 101 and 30,000.
4. **Gap 7.** The linked-task refusal names the person, under `assignee_ids`, as normal tasks do.
5. **Gap 10.** Long names in the phone people list get an ellipsis or wrap, not a hard cut.
6. **Tests, P61 and P83–P84.** `flags-cips.spec.ts:103` reads the batch right after the prompt
   hides, but `MovePrompt` closes before the save (`flows.tsx:310–312`). Poll for the date
   with `expect.poll`. Check `d48-batch-changes.spec.ts:180`, which has failed twice on DEV:
   fix it the same way if it's the same cause, and say what you found if it isn't. Check for
   other reads of the same shape in those two files.

**If `title` or `notes` have the gap 1 or 2 bug on the same line of code,** fix them with
people; if it takes separate work, leave them and tell me.

## Tests

Each of gaps 1, 2, 3 and 7 gets a test built from the report's repro that fails with the fix
reverted and passes with it. Record both runs. Add combination tests at the ExUnit level:
exception, split, following; people changed over time, split; a split from before and from
after the latest change. Add a Playwright case for gap 1 through the dialog.

## Not in this cycle

Gaps 4, 5, 6, 8, 9 and 11 wait for Matt's triage. Don't touch them.

## Gate and stop

`mix test` twice, `tsc`, `vite build`, vitest, lint no worse than 26 errors, then the specs
you changed, `--project brewery-board --no-deps` and `--project production --no-deps`. Commit
each fix. Don't push. Append "Fix cycle 1" to `d53_part1_builder_status.md`, commit with a
message containing `fix cycle 1 done`, then stop.
