# D3: Deployment — Complete

**Completed:** 2026-02-12

## Summary
Deployed both apps to Fly.io. API at rockcut-api.fly.dev, UI at rockcut-ui.fly.dev.

## What Was Built
- API Dockerfile (multi-stage: Elixir builder + Debian runtime)
- UI Dockerfile (multi-stage: Node builder + nginx alpine)
- fly.toml for both apps
- nginx.conf with SPA routing
- datagrid-extended Docker shim (re-exports @mui/x-data-grid)
- package.docker.json (omits linked dependency)
- Release.seed/0 function for running seeds on prod

## Key Infrastructure
- API: 512MB, 1 shared CPU, 1GB SQLite volume (dfw region)
- UI: 256MB, 1 shared CPU, 2 machines (dfw region)
- Fly secrets: SECRET_KEY_BASE, ADMIN_EMAIL, ADMIN_PASSWORD_HASH

## Deviations
- SQLite migrations run on app start, not release_command (volume not mounted during release)
