# rockcut-ui — React SPA

React 19 + MUI 7 + Vite SPA served by nginx on Fly.io.

## Architecture

```
                    ┌─────────────────────┐
                    │    Fly.io (dfw)      │
                    │                     │
  HTTPS :443 ──────►  nginx :8080         │
                    │  ┌───────────────┐  │
                    │  │ /index.html   │  │
                    │  │ /assets/*.js  │  │
                    │  │ /assets/*.css │  │
                    │  └───────────────┘  │
                    └─────────────────────┘
                              │
                    API calls at build time
                    baked into JS bundle
                              │
                              ▼
                    https://rockcut-api.fly.dev
```

## Configuration Files

### fly.toml

```toml
app = 'rockcut-ui'
primary_region = 'dfw'

[build]
  [build.args]
    VITE_API_URL = "https://rockcut-api.fly.dev"

[http_service]
  internal_port = 8080
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
  grace_period = "10s"
  interval = "15s"
  method = "GET"
  timeout = "5s"
  path = "/health"

[[vm]]
  memory = '256mb'
  cpu_kind = 'shared'
  cpus = 1
```

### Dockerfile (multi-stage)

Two stages:
1. **Builder** — `node:20-bookworm-slim`
   - Enables corepack; pnpm's version comes from `packageManager` in `package.json`
   - Copies `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc` and runs `pnpm install --frozen-lockfile`
   - Builds with `pnpm exec vite build`
2. **Server** — `nginx:alpine`
   - Custom `nginx.conf` for SPA routing
   - `chmod -R a+r` on assets (required — without this you get 403s on Fly.io)
   - Listens on port 8080

### nginx.conf

```nginx
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml text/javascript;
    gzip_min_length 1024;

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /health {
        access_log off;
        return 200 '{"status":"ok"}';
        add_header Content-Type application/json;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Key points:
- **Port 8080** — nginx default is 80, but we use 8080 to match `fly.toml internal_port`
- **`try_files` fallback** — Critical for SPA routing. Without this, direct navigation to `/recipes` returns 404
- **Health endpoint** — Returns JSON at `/health`, no access log noise

## datagrid-extended (vendored stub)

`datagrid-extended` is a 10-line stub that renders MUI's `DataGrid`, vendored at `rockcut-ui/vendor/datagrid-extended/` (task 3999). It replaced the D28 setup (a `link:` to `~/src/shared/ui-components/`, a Docker-only `package.docker.json`, an inline shim and `--no-frozen-lockfile`).

- **Runtime:** `vite.config.ts` aliases `datagrid-extended` to the vendored folder, the same locally and in Docker.
- **Types:** `src/datagrid-extended.d.ts` declares the module (including the formula and remote-value types from the D6–D9 experiment, unused today). TypeScript doesn't resolve the vendored folder, so the declared types apply.
- **Intended behavior:** the plain grid (Rick, discussion 80, msg 83601). If the real package returns, it replaces `vendor/datagrid-extended/`.

## Build-Time Environment Variables

Vite replaces `import.meta.env.VITE_*` at build time, not runtime. The API URL is baked into the JavaScript bundle.

| Variable | Set Via | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `fly.toml [build.args]` | Backend API base URL |

To change the API URL, update `fly.toml` and redeploy — a code change isn't needed.

## Initial Setup (one-time)

These steps were already run. Documenting for reference:

```bash
cd rockcut-ui

# 1. Create the fly app
fly apps create rockcut-ui --machines

# 2. Deploy (no secrets or volumes needed for a static site)
fly deploy --remote-only
```

## Subsequent Deploys

```bash
cd rockcut-ui
fly deploy --remote-only
```

## Verification

```bash
# Health check
curl https://rockcut-ui.fly.dev/health
# → {"status":"ok"}

# Verify SPA routing (direct URL should return 200, not 404)
curl -s -o /dev/null -w "%{http_code}" https://rockcut-ui.fly.dev/recipes
# → 200

# Check machine status
fly status -a rockcut-ui
```

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| 403 Forbidden on assets | File permissions | Ensure Dockerfile has `chmod -R a+r` |
| 404 on direct navigation to `/recipes` | Missing `try_files` | Check nginx.conf has `try_files $uri $uri/ /index.html` |
| Build fails: `ERR_PNPM_OUTDATED_LOCKFILE` | `package.json` changed without updating `pnpm-lock.yaml` | Run `pnpm install` locally and commit the lockfile |
| Build fails: unused TypeScript imports | `noUnusedLocals: true` in tsconfig | Fix the unused import in the source file |
| API calls fail in production | Wrong `VITE_API_URL` | Update `fly.toml [build.args]` and redeploy |
