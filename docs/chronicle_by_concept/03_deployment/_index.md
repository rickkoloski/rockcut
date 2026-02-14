# 03_deployment

## Overview
Fly.io deployment for both apps. API at rockcut-api.fly.dev (Phoenix + SQLite volume), UI at rockcut-ui.fly.dev (nginx SPA).

## Deliverables

### Foundation
| ID | File | Purpose | Status |
|----|------|---------|--------|
| D3 | results/d03_deployment_COMPLETE.md | Deployment setup and verification | COMPLETE |
| — | ref/rockcut-api.md | API deployment details | Reference |
| — | ref/rockcut-ui.md | UI deployment details | Reference |
| — | ref/lessons-learned.md | Deployment lessons (SQLite, Docker, pnpm) | Reference |
| — | ref/differences-from-vnext.md | How this differs from vnext project | Reference |

## Common Tasks
- "Deploy API" -> `cd rockcut_api && fly deploy --remote-only`
- "Deploy UI" -> `cd rockcut-ui && fly deploy --remote-only`
- "Run seeds on prod" -> `fly ssh console -a rockcut-api -C "/app/bin/rockcut_api eval 'RockcutApi.Release.seed()'"`
- "Backup prod DB" -> `fly sftp get /data/rockcut_api.db ./backup.db -a rockcut-api`

## Key Decisions
- SQLite on Fly volume (not Postgres) — simpler, single-machine
- Migrations run on app start (not release_command) — volume may not be mounted during release
- datagrid-extended Docker shim — linked package doesn't exist in Docker build context
- VITE_API_URL baked at build time — change requires redeploy, not env var
