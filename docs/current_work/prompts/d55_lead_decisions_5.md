# D55: lead decisions 5

2026-11-08 · lead → builder. Stop 4 (`c5a4aa6`) accepted: §2.12 and T14 as built, including the shift's
403 for a missing position (the access check comes first; not a 500).

## The full local Playwright run

On `76353eb`+ (the run overlapped your §2.11/§2.12 work and a `mix compile --force`): **659 passed, 4
failed, 1 skipped, 2 did not run** (36 min). Log: `/tmp/claude-501/pwlogs/d55_local_full.log`. The four
failures, rerun alone on `c5a4aa6`: D52 4232 (Publish week) passed, a flake. Three fail again; fix
them:

1. **T7, `app/parser_errors.spec.ts:14`.** Locally the API answers Phoenix's HTML debug page
   (`Plug.Parsers.ParseError … Jason.DecodeError`), not the readable 400: `debug_errors: true` in
   `config/dev.exs` renders it before D55's handling. The fix must give the readable 400/413 in
   **every** env, dev included (we test locally and the tablets' errors must read the same
   everywhere). Find where the debugger catches it and handle the parser errors ahead of it, or the
   cleanest equivalent. Don't turn `debug_errors` off globally. ExUnit can't see this (test env has no
   debugger): say how you verified it.
2. **T9, `brewery/recipe_sort_order.spec.ts:16`.** Times out at line 44:
   `dialog.getByLabel('Category')` matches nothing; the snapshot shows the dialog open with Amount,
   Time, Sort Order spinbuttons but no labelled Category. Check whether the Add Ingredient dialog's
   selects are tied to their labels (`labelId`/`id`). If they aren't, that's an accessibility bug: fix
   the dialog, not the test. If they are, fix the locator. Same check for T10/T12 in this file.
3. **G4, `devices/device_signout.spec.ts:21`** (D54-era test). Expected "Server error"; the page says
   `Couldn't sign this tablet out: Something went wrong on the server. Please try again.. It's still
   paired; try again.` Two things: the **double period** is a bug (the sentence joiner must not add a
   "." after text that ends in one; check the other places that wrap `parseApiError`'s message), and
   the test's expected text should follow D55's new wording. Make the test assert the text that
   matters (the server error and "still paired") without a doubled period.

## Rules

You still can't run servers or Playwright (your tool limits are fixed for this session). The servers
on :4002/:5174 now run **this worktree**, so the dev server picks up your saves; no `mix ecto.*` on the
dev DB, and no `mix compile --force` (it rebuilds the running server's build). When done, list the
exact spec lines for the lead to rerun.

## Then

The usual non-Playwright gate (`mix compile --warnings-as-errors`, `mix test`, tsc, Vitest).
"Lead decisions 5 done" in the status file, a commit containing `decisions 5 done`, and stop.
