# 00_project

## Overview
Project-level reference material for Rockcut Brewing Co's brewery management app. Competitive research, technology decisions, and project context.

## Deliverables

### Reference
| File | Purpose |
|------|---------|
| competitive-landscape.md | Survey of existing brewing software (Brewfather, Breww, etc.) |
| technical-decisions.md | Stack choices: Phoenix 1.8 + React 19 + SQLite + Fly.io |

## Key Decisions
- Phoenix API + React SPA (not LiveView) — Matt wants a modern SPA feel
- SQLite over Postgres — single-user app, simpler ops on Fly.io
- MUI 7 component library — comprehensive, well-documented
- Fly.io for hosting — simple deployment, volume-mounted SQLite
