# Hotfix v2026.11.24: hex advisories (COMPLETE)

API only, `rockcut_api/mix.lock` only. No migrations, config or secrets. PR #97, squash `1e34a76`; built from `e35e040`.

| Library | From → to | Advisory |
|---|---|---|
| plug | 1.20.3 → 1.20.4 | EEF-CVE-2026-120287 (MEDIUM), multipart limit: the endpoint parses multipart before sign-in |
| phoenix | 1.8.15 → 1.8.17 | EEF-CVE-2026-128361, EEF-CVE-2026-129344 (HIGH): no Presence or channel modules found (code search) |
| phoenix_live_view | 1.2.12 → 1.2.15 | EEF-CVE-2026-126334 (MEDIUM): prod doesn't mount the socket |
| idna | 7.1.0 → 8.0.0 | EEF-CVE-2026-117678 (MEDIUM): only swoosh uses it, and prod's mailer is a no-op |
| swoosh | 1.28.1 → 1.30.0 | allows idna 8 |
| phoenix_pubsub | 2.3.0 → 2.4.1 | required by phoenix 1.8.17 |

## Checks
- **Local:** 3,046 API tests passed; prod compile clean; `mix hex.audit` clean; an 18 MB multipart body of empty parts gets 413 (not run against the old version).
- **DEV (API v108 `e35e040`, UI `0a56b70`):** all 1,015 Playwright tests passed, not in one clean run. Full run: 555 passed, 2 failed (M4, P53/P54), 458 not run. Rested: those two passed; Gantt P49–P51 and P46 failed when the run crossed midnight, then passed on fresh data; brewery-board 234, ingredients 179 and d58 48 passed. Their three reseeds failed (cause unknown), so they ran on the 23:54 seed. Details in task 5911.
- **Not done:** independent QA pass (Matt released without one; library versions only).
- **Prod:** health SHA = tag; both audits clean; synthetic login 401; 0 synthetic users; lots, products and batches unchanged. Matt's check passed 2026-11-24.

## Release
- API v46 `registry.fly.io/rockcut-api:deployment-01M86XXBBJCR3WKS4Q3W52JD26`; UI v41 unchanged.
- Rollback: API v45 `registry.fly.io/rockcut-api:deployment-01M862CR4G2W8GP971MGZD029P`, image only. Snapshot `vs_PgeR1XOzNL6xun5QeBnZP5kB`.
- `main` merged into `develop` normally (`44e2957`).
