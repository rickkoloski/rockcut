# Rockcut Deployment

Two-app deployment on [Fly.io](https://fly.io), region `dfw` (Dallas-Fort Worth).

| App | URL | Source | Purpose |
|-----|-----|--------|---------|
| rockcut-api | https://rockcut-api.fly.dev | `rockcut_api/` | Phoenix/Elixir API with SQLite |
| rockcut-ui | https://rockcut-ui.fly.dev | `rockcut-ui/` | React/Vite SPA via nginx |

## Quick Reference

```bash
# Deploy API
cd rockcut_api && fly deploy --remote-only

# Deploy UI
cd rockcut-ui && fly deploy --remote-only

# Check status
fly status -a rockcut-api
fly status -a rockcut-ui

# View logs
fly logs -a rockcut-api
fly logs -a rockcut-ui

# Health checks
curl https://rockcut-api.fly.dev/api/health
curl https://rockcut-ui.fly.dev/health

# SSH into API machine (for debugging)
fly ssh console -a rockcut-api

# Download SQLite database backup
fly sftp get /data/rockcut_api.db ./rockcut_api_backup.db -a rockcut-api
```

## Detailed Documentation

- [rockcut-api.md](rockcut-api.md) — Phoenix API deployment (SQLite, volumes, Elixir release)
- [rockcut-ui.md](rockcut-ui.md) — React SPA deployment (nginx, pnpm, datagrid-extended shim)
- [lessons-learned.md](lessons-learned.md) — Issues encountered and how we solved them
- [differences-from-vnext.md](differences-from-vnext.md) — Key differences from the vNext deployment
