# D54: lead decisions 2 (fix cycle 1)

2026-11-05 · lead → builder, from the DEV QA report
(`docs/current_work/stepwise_results/d54_dev_qa_report.md`, build `ca5d9be`).
Matt accepted this triage. The spec is updated (§3.1, §3.3, S253, S254).

## Fix on this branch

1. **G1: refuse a live tablet token in `Authorization` too.** In
   `SessionController.create/2`, the refusal also applies when
   `Authorization: Bearer <token>` is a live device token. Keep ignoring
   stale, revoked, made-up and person tokens in either header. ExUnit
   (S253): live token in `Authorization` only → 403 with the refusal text for
   right and wrong passwords, no `user_sessions` row; revoked device token and
   a person's `ses_` token there → normal login. Revert check: record both runs.
2. **G5: pairing ends on Home.** Pairing from any URL, including `/login`, ends
   on the tablet's Home rather than the refusal page. Playwright (S254) in
   `shared_device_no_personal_login.spec.ts`, with a revert check.

## Not in this cycle

G2, G3, G4, G6, G7 and the single-401 unpairing need no code here. G6 and the
401 go to the backlog (the lead files them). Don't change anything else.

## Where things stand

- **Local servers are up** from `~/src/rockcut-d54`.
- **`tests/.playwright-auth` holds DEV tokens.** Run
  `npx playwright test --project setup` first. Run
  `cd rockcut_api && mix rockcut.synthetic.setup` first if the seed is stale.
- Prefix Playwright with `caffeinate -ims`. Run only the specs you touched; the
  lead runs the wider suites.

## Gate

`mix test`, `tsc`, `vite build`, vitest, lint no worse than 26 errors,
`devices/` and `auth/` Playwright. Commit each fix. Append "Fix cycle 1" to
`d54_builder_status.md`, commit it and stop. Don't push.
