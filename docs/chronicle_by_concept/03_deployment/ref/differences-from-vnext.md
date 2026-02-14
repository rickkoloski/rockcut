# Differences from vNext Deployment

Rockcut's Fly.io deployment follows the same two-app pattern as vNext (vnext-lab + sinch-demo-surface), but with key differences due to SQLite and the component library setup.

## Same as vNext

| Aspect | Pattern |
|--------|---------|
| Two-app architecture | Separate API and UI fly apps |
| Region | `dfw` for both apps |
| UI serving | nginx + Docker, SPA fallback via `try_files` |
| Base images | Same Elixir 1.19.3 + OTP 28.1.1 + Debian bookworm |
| Auto-scaling | `auto_stop_machines: stop`, `auto_start_machines: true` |
| Health checks | Both apps expose `/health` (or `/api/health`) |
| CORS | Dynamic origins via `CORSPlug` + `cors_origins/0` function |
| Build args | `VITE_*` env vars injected at Docker build time |
| Static asset caching | nginx: `expires 1y`, `Cache-Control: public, immutable` |
| File permissions fix | `chmod -R a+r` in nginx Dockerfile |

## Different from vNext

### 1. SQLite vs PostgreSQL

| | vNext | Rockcut |
|---|---|---|
| Database | PostgreSQL (Fly Managed Postgres) | SQLite on Fly Volume |
| Connection | `DATABASE_URL` env var | `DATABASE_PATH` env var |
| IPv6 config | `ECTO_IPV6=true` required | Not needed (local file) |
| Migration | `release_command` in fly.toml | Runs on app start in `application.ex` |
| Backup | Managed Postgres snapshots | `fly sftp get` the `.db` file |
| Multi-region | Possible (Postgres replication) | Single region only |
| Setup | `fly mpg create` + `fly mpg attach` | `fly volumes create` |

**Why this matters:** SQLite is simpler to operate (no separate database service, no connection strings, no IPv6 config) but is locked to a single region and a single machine. For Rockcut's scale, this is a perfect trade-off.

### 2. Volume Mount

vNext has no volumes — its data lives in managed Postgres. Rockcut mounts a 1GB volume at `/data`:

```toml
[mounts]
  source = "rockcut_data"
  destination = "/data"
```

The Dockerfile creates and owns this directory:
```dockerfile
RUN mkdir -p /data && chown nobody /data
```

### 3. Migrations Run on App Start (not release_command)

vNext runs migrations via `release_command` in fly.toml, which works because Postgres is a separate network service available before the app starts.

Rockcut **cannot use release_command** because the Fly volume may not be mounted yet when the release command runs. Instead, `application.ex` runs migrations automatically when the app boots:

```elixir
{Ecto.Migrator,
 repos: Application.fetch_env!(:rockcut_api, :ecto_repos),
 skip: skip_migrations?()}

defp skip_migrations?() do
  # Runs migrations in releases, skips in dev (dev uses mix ecto.migrate)
  System.get_env("RELEASE_NAME") == nil
end
```

### 4. pnpm vs npm

| | vNext | Rockcut |
|---|---|---|
| Package manager | npm | pnpm |
| Lockfile | `package-lock.json` | `pnpm-lock.yaml` |
| Install command | `npm ci` | `pnpm install --no-frozen-lockfile` |
| Docker setup | Just `npm ci` | `corepack enable && corepack prepare pnpm@latest` |
| Hoisting | Default (hoisted) | `shamefully-hoist=true` in `.npmrc` (required for MUI) |

### 5. Linked Package Shim (datagrid-extended)

vNext embeds its React admin SPA directly into the Phoenix build (same Docker context). The shared `wf_ui_src` library is copied within the multi-stage build because it lives inside the `vnext_lab/` directory.

Rockcut's `datagrid-extended` lives *outside* the repo at `~/src/ui-components/datagrid-extended/`. We can't include it in the Docker build context, so:

1. `package.docker.json` omits the link dependency
2. The Dockerfile creates a minimal shim (`.datagrid-extended-src/`) that re-exports `@mui/x-data-grid`
3. `vite.config.ts` checks `DOCKER_BUILD` env var to resolve the alias differently
4. A `.d.ts` type declaration file bridges the TypeScript gap

**This is the most fragile part of the deployment.** If datagrid-extended gains real functionality beyond the thin wrapper, the Dockerfile shim will need to match. Consider moving the library into the monorepo or publishing it.

### 6. No Embedded Admin SPA

vNext's Dockerfile has **three stages**: build React admin, build Elixir release (copying React assets into `priv/static/admin/`), then runtime. The React SPA is served directly by Phoenix.

Rockcut's API Dockerfile has only **two stages**: build Elixir release, then runtime. The React SPA is a completely separate deployment. This is simpler but means two deploys when both change.

### 7. Resource Sizing

| | vNext API | Rockcut API | vNext UI | Rockcut UI |
|---|---|---|---|---|
| Memory | 1GB | 512MB | 256MB | 256MB |
| CPU | shared, 1 core | shared, 1 core | shared, 1 core | shared, 1 core |

Rockcut API uses less memory because it doesn't need Postgres connection pooling, pgvector, or OpenAI client libraries.

### 8. Web Server

| | vNext | Rockcut |
|---|---|---|
| Phoenix web server | Cowboy (older Phoenix) | Bandit (Phoenix 1.8 default) |

Bandit is the modern replacement for Cowboy in the Phoenix ecosystem. No config differences needed — just noting the change.

## Summary

The deployment architecture is intentionally identical where it can be. The differences all stem from two root causes:
1. **SQLite instead of Postgres** — Simpler (volume instead of managed DB), but single-region and requires migration-on-boot instead of release_command
2. **External linked library** — The datagrid-extended shim is a workaround; long-term this should be internalized or published
