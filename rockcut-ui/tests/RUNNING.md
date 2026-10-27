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

Optional, D37 (D40 adds `brewer1`): `SYNTHETIC_STAFF_CODES=bartender1:<code>,bartender2:<code>,barMgr:<code>,brewer1:<code>`
in `rockcut_api/.env.synthetic` gives those personas their staff codes on
`mix rockcut.synthetic.setup` (values from the same PortableMind file; never in
git or chat). No spec needs it.

## Run

```bash
cd rockcut-ui
npx playwright test                    # local (default)
E2E_TARGET=dev npx playwright test     # DEV (needs `fly` logged in)
npx playwright test tests/smoke/roles.spec.ts
```

### Projects

| Project | Runs | Notes |
|---|---|---|
| `setup` | `auth.setup.ts` | Mints persona tokens; every other project depends on it. |
| `chromium` | every spec except Replace | Parallel. |
| `production` | `regression/production/*.spec.ts` (D46–D49) | One worker, beside `chromium`. Tanks, step types and templates are shared lists, and a reorder names every active row. |
| `brewery-board` | `task-board-*.spec.ts` (D38–D43) | One worker, beside `chromium`, **after `production`** (D49: the schedule's steps are tasks on the Brewery board, so a production spec's batches would change the board under a board spec). "Move all to today" moves every open past task on the one shared board, so these specs mustn't overlap. Drag specs use a tall viewport so no drag has to scroll. Their clean-up leaves linked tasks alone; those go with their batches. If a `production` test fails, Playwright doesn't run this project: rerun it with `--no-deps`. |
| `board-replace` | `regression/taproom/beer-board-replace.spec.ts` (D37 S25, S28) | Import → Replace clears the **whole shared board**. One worker, and it starts only after `chromium` has finished. Each test snapshots the board and restores it after. |
| `pwa-update` | `pwa-update/*.spec.ts` (D45 S170–S177, S189) | **Only with `PWA_UPDATE=1`**, so not in the default run. One worker. Builds the app twice and serves it with `vite preview` on :4173. See below. |

**Playwright runs a dependency project in full, whatever path you filter
on.** Because `board-replace` depends on `chromium`, `npx playwright test
tests/regression/taproom` runs the whole `chromium` suite first. To run part of
the suite:

```bash
npx playwright test tests/regression/taproom --project=chromium   # the folder, without Replace
npx playwright test --project=board-replace --no-deps              # Replace only (auth files must exist)
npx playwright test --project=brewery-board --no-deps              # the board specs without production first
```

Never run `beer-board-replace.spec.ts` alongside other specs: anything they
put on the board while a Replace runs is deleted.

### The update prompt (`pwa-update`, D45)

The "New version available · Reload" bar needs the service worker, which
`pnpm dev` (:5174) doesn't run. The spec builds the app twice (`VITE_BUILD_ID=A`
and `B` into `tests/.pwa-update/`, gitignored), serves A with `vite preview` on
:4173 (`/api` proxied to the local API on :4002), and "deploys" B by swapping
the served files. `<html data-build>` says which build a page runs. S189 (first
rollout) also builds the last release before D45 (`OLD_RELEASE` in
`tests/pwa-update/helpers.ts`) from a temporary git worktree, once; delete
`tests/.pwa-update/OLD` to rebuild it. The spec
starts and stops the preview server itself; :4173 must be free.

```bash
PWA_UPDATE=1 npx playwright test --project=pwa-update   # about 3½ minutes
```

It uses the shared tablets' real 10 s / 30 s waits (`src/lib/updatePrompt.ts`)
and Playwright's clock for the once-a-day check. The S177 "Acting as" test adds
one `[TEST-TEMP]` task to the Brewery board and removes it, so don't run it
beside the `brewery-board` project.

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

**After a full run (with the `board-replace` project):** a Replace run marks the
`[SEED]` board entries as imported, so re-run `mix rockcut.synthetic.setup`
(locally) or `RockcutApi.Release.reset_synthetic()` (DEV) afterwards. The specs
don't depend on it.
