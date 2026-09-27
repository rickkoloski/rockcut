# Running the E2E tests (D30)

Policy first: `docs/process/test-credentials-policy.md`. Synthetic personas
only, allowlisted hosts only, tokens instead of passwords.

## Pre-flight

| Check | Local | DEV |
|-------|-------|-----|
| API up | `curl -s localhost:4002/api/health` | `curl -s https://rockcut-api-dev.fly.dev/api/health` |
| UI up | `curl -sI localhost:5174` | `curl -sI https://rockcut-ui-dev.fly.dev` |
| Personas seeded | `cd rockcut_api && mix rockcut.synthetic.status` | `fly ssh console -a rockcut-api-dev -C "/app/bin/rockcut_api eval 'RockcutApi.Release.synthetic_status()'"` |

Local servers: `cd rockcut_api && mix phx.server` and `cd rockcut-ui && pnpm dev --port 5174`.

Local seed password (only needed to seed, or for login-form specs): put
`SEED_PASSWORD=<value from the PortableMind file>` in `rockcut_api/.env.synthetic`
and `rockcut-ui/.env.test.local`. Both are gitignored.

## Run

```bash
cd rockcut-ui
npx playwright test                    # local (default)
E2E_TARGET=dev npx playwright test     # DEV (needs `fly` logged in)
npx playwright test tests/smoke/roles.spec.ts
```

`tests/auth.setup.ts` mints a token for every active persona in one call and
writes `tests/.playwright-auth/<persona>.json`. Specs switch user with
`test.use({ storageState: authFile('barMgr') })`. No UI login.

No `mix`/`fly` access (for example a browser agent)? Have a human mint tokens
and pass them in: `E2E_TOKENS_JSON='{"owner":{"email":"…","token":"…"},…}'`.

## Acting as a persona in a browser (Claude in Chrome, manual)

1. Mint a token:
   - Local: `cd rockcut_api && mix rockcut.synthetic.token barMgr`
   - DEV: `fly ssh console -a rockcut-api-dev -C "/app/bin/rockcut_api eval 'RockcutApi.Release.mint_token(\"barMgr\")'"`
2. On the UI origin (`http://localhost:5174` or `https://rockcut-ui-dev.fly.dev`),
   run in the console: `localStorage.setItem('rockcut_token', '<token>')`, then reload.
3. Switch persona = repeat with another key. Tokens last 8 hours.

Persona keys and what each one tests: `tests/config/test-env.ts` and the D30 spec.

## Reset

- Local: `cd rockcut_api && mix rockcut.synthetic.reset`
- DEV: `fly ssh console -a rockcut-api-dev -C "/app/bin/rockcut_api eval 'RockcutApi.Release.reset_synthetic()'"`

`setup` also heals: it restores every persona and deletes `[TEST-TEMP]` rows.
