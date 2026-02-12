# rockcut-api — Phoenix/Elixir API

Phoenix 1.8 API with SQLite database, deployed on Fly.io with a persistent volume.

## Architecture

```
                    ┌─────────────────────┐
                    │    Fly.io (dfw)      │
                    │                     │
  HTTPS :443 ──────►  Bandit :4000        │
                    │  Phoenix/Elixir     │
                    │       │             │
                    │       ▼             │
                    │  SQLite (WAL mode)  │
                    │  /data/rockcut_api  │
                    │  ┌───────────────┐  │
                    │  │ 1GB Volume    │  │
                    │  │ rockcut_data  │  │
                    │  └───────────────┘  │
                    └─────────────────────┘
```

## Configuration Files

### fly.toml

```toml
app = 'rockcut-api'
primary_region = 'dfw'

[build]

[env]
  PHX_HOST = "rockcut-api.fly.dev"
  PORT = "4000"
  DATABASE_PATH = "/data/rockcut_api.db"

[mounts]
  source = "rockcut_data"
  destination = "/data"

[http_service]
  internal_port = 4000
  force_https = true
  auto_stop_machines = 'stop'
  auto_start_machines = true
  min_machines_running = 0
  processes = ['app']

  [http_service.concurrency]
    type = "connections"
    hard_limit = 1000
    soft_limit = 1000

[[http_service.checks]]
  grace_period = "30s"
  interval = "15s"
  method = "GET"
  timeout = "5s"
  path = "/api/health"

[[vm]]
  memory = '512mb'
  cpu_kind = 'shared'
  cpus = 1
```

### Dockerfile (multi-stage)

Two stages:
1. **Builder** — `hexpm/elixir:1.19.3-erlang-28.1.1-debian-bookworm-20260112-slim`
   - Installs hex + rebar, compiles deps, compiles app, builds release
2. **Runner** — `debian:bookworm-20260112-slim`
   - Minimal runtime (libstdc++6, openssl, libncurses5, ca-certificates)
   - Creates `/data` directory for SQLite volume mount
   - Runs as `nobody` user
   - Entrypoint: `/app/bin/server`

### Release Overlays

- `rel/overlays/bin/server` — Sets `PHX_SERVER=true` and starts the release
- `rel/overlays/bin/migrate` — Runs `RockcutApi.Release.migrate` for manual migrations

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SECRET_KEY_BASE` | Yes | — | Phoenix session encryption key. Generate with `mix phx.gen.secret` |
| `DATABASE_PATH` | Yes | — | Path to SQLite database file. Set in fly.toml `[env]` |
| `PHX_HOST` | Yes | `example.com` | Hostname for URL generation. Set in fly.toml `[env]` |
| `PORT` | No | `4000` | HTTP listen port. Set in fly.toml `[env]` |
| `POOL_SIZE` | No | `5` | Ecto connection pool size |
| `CORS_ORIGINS` | No | `["*"]` | Comma-separated allowed origins. Default is permissive for demo |
| `DNS_CLUSTER_QUERY` | No | — | DNS query for clustering (unused for now) |

## Migrations

Migrations run **automatically on app start** via `Ecto.Migrator` in `application.ex`. This is the recommended approach for SQLite on Fly.io because:
- The volume may not be mounted when `release_command` runs
- SQLite doesn't need a separate migration step like Postgres

For manual migrations (e.g., rollbacks), SSH in:
```bash
fly ssh console -a rockcut-api -C "/app/bin/rockcut_api eval 'RockcutApi.Release.migrate()'"
```

## CORS Configuration

Dynamic CORS origins via `CORSPlug` in `endpoint.ex`:
- **Dev**: Hardcoded `localhost:5173` and `localhost:5174`
- **Prod**: Reads `CORS_ORIGINS` env var, defaults to `["*"]` (permissive for demo)

To lock down in production:
```bash
fly secrets set CORS_ORIGINS="https://rockcut-ui.fly.dev,https://your-custom-domain.com" -a rockcut-api
```

## Initial Setup (one-time)

These steps were already run. Documenting for reference:

```bash
cd rockcut_api

# 1. Create the fly app
fly apps create rockcut-api --machines

# 2. Create persistent volume for SQLite (1GB, same region)
fly volumes create rockcut_data --size 1 --region dfw -a rockcut-api --yes

# 3. Set the secret key
fly secrets set SECRET_KEY_BASE=$(mix phx.gen.secret) -a rockcut-api

# 4. Deploy
fly deploy --remote-only
```

## Subsequent Deploys

```bash
cd rockcut_api
fly deploy --remote-only
```

## Verification

```bash
# Health check
curl https://rockcut-api.fly.dev/api/health
# → {"status":"ok","app":"rockcut_api"}

# Check machine status
fly status -a rockcut-api

# View recent logs
fly logs -a rockcut-api

# Check volume
fly volumes list -a rockcut-api
```

## Database Backup

SQLite makes backups simple — just download the file:

```bash
fly sftp get /data/rockcut_api.db ./rockcut_api_backup.db -a rockcut-api
```

Fly volumes also have automatic snapshots (5-day retention by default):
```bash
fly volumes snapshots list vol_XXXX -a rockcut-api
```

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| App won't start, "DATABASE_PATH is missing" | Secret/env not set | Check `fly.toml [env]` has `DATABASE_PATH` |
| App won't start, "SECRET_KEY_BASE is missing" | Secret not set | Run `fly secrets set SECRET_KEY_BASE=...` |
| SQLITE_BUSY errors under load | Write contention | Increase `busy_timeout` in repo config |
| Health check failing | App crashing on start | Check `fly logs -a rockcut-api` for errors |
| Volume not mounting | Machine in wrong region | Ensure machine and volume are both in `dfw` |
