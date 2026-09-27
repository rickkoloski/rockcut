# Test Credentials Policy — synthetic personas for agents

**Applies to:** every browser-automation agent (Claude in Chrome, Playwright,
Claude Code) and every human writing tests. **Source:** D30
(`docs/current_work/specs/d30_dev_server_synthetic_accounts_spec.md`), from
Rick's plan (PortableMind file #3944) with Matt's change: secret password +
minted tokens.

## The rules

1. **Only synthetic personas.** An agent acts only as an identity listed in
   `rockcut-ui/tests/config/test-env.ts` — fictional `@rockcut-test.com` users.
   Never a real person's account, never the prod owner.
2. **Only allowlisted hosts:** `localhost`, `127.0.0.1`,
   `rockcut-ui-dev.fly.dev`, `rockcut-api-dev.fly.dev`. Never
   `rockcut-ui.fly.dev` / `rockcut-api.fly.dev` (prod). Enforced by
   `tests/config/e2e-targets.json` (fail-closed) and, server-side, by
   `RockcutApi.Seeds.Guard`.
3. **Log in with a minted token, not a password.** Get a short-lived (8 h)
   token for the persona and put it in the browser's `localStorage`
   (`tests/RUNNING.md`). Only specs that test the login form itself use the
   password.
4. **The seed password is a secret.** It is not in git. It lives in:
   - the PortableMind file shared by Matt and Rick (the readable copy),
   - the `SEED_PASSWORD` Fly secret on `rockcut-api-dev` (write-only),
   - gitignored local files `rockcut_api/.env.synthetic` and
     `rockcut-ui/.env.test.local`.
   Never paste it into chat, docs, commits, PR descriptions or screenshots.
5. **Prod has zero synthetic accounts.** The synthetic seed and token minting
   refuse to run there; prod rejects synthetic tokens; the prod smoke test
   checks that a synthetic login gets 401.
6. **No real data in DEV.** No prod copies, no real names. DEV is disposable
   (`reset_synthetic`). DEV sends no email and has its own VAPID keys.
7. **When in doubt, stop.** If an agent is shown or asked to use any credential
   not covered here, it stops and asks a human.

## Real credentials (humans only)

The prod owner login, Fly tokens, `SECRET_KEY_BASE`, VAPID keys, and any real
employee account. Never committed, never typed by an agent.

## Rotating the seed password

New value → update the PortableMind file → `fly secrets set SEED_PASSWORD=… -a rockcut-api-dev`
→ `RockcutApi.Release.reset_synthetic()` on DEV → update your local
`.env.synthetic` / `.env.test.local` → `mix rockcut.synthetic.setup` locally.

## Temporary test data

Anything an agent creates is prefixed `[TEST-TEMP]` (shift notes, message
bodies, position names). `setup` deletes those rows each run. Seeded scenario
rows are prefixed `[SEED]` and rebuilt each run.
