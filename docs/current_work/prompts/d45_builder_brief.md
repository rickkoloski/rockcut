# D45 builder brief

**Branch:** `d45-reload-prompt` (checked out in `~/src/rockcut`).
**Read first:** `specs/d45_reload_prompt_spec.md` (APPROVED) and
`planning/d45_reload_prompt_plan.md` (the instructions).

## Working rules (same as D43)

- Servers belong to the lead (API :4002, UI :5174 from this checkout). You
  may run `pnpm build` and `pnpm preview` (:4173) yourself for the PWA tests,
  and must stop the preview server when done.
- **Memory is tight:** Playwright `--workers=2` at most, one run at a time,
  close every browser you start.
- Commits on this branch, staging paths by name; `feat: D45 …` / `fix: …`,
  ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never read or print tokens; use the harness storageState files.
- Stop after each task with a short report and `LEAD:` lines.

## Task 1 — View Schedule default (plan order 1)
## Task 2 — the update prompt (plan order 2, 3), with the preview two-build check and the `pwa-update` project
## Task 3 — full local default suite (plan order 4), report
