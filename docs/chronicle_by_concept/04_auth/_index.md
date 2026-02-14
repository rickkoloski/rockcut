# 04_auth

## Overview
Simple bearer token authentication. Single admin user (Matt), credentials stored as Fly secrets. Login gate on the React SPA, token stored in Zustand with localStorage persistence.

## Deliverables

### Foundation
| ID | File | Purpose | Status |
|----|------|---------|--------|
| D4 | results/d04_auth_COMPLETE.md | Auth implementation record | COMPLETE |

## Common Tasks
- "How does auth work?" -> POST /api/session with email+password, get bearer token
- "What are Matt's credentials?" -> matt@rockcut.com / rockcut2026
- "Where are prod credentials?" -> Fly secrets: ADMIN_EMAIL, ADMIN_PASSWORD_HASH

## Key Decisions
- EnvAuth pattern — no users table, credentials in environment variables
- Bearer tokens (not sessions/cookies) — stateless, SPA-friendly
- Zustand for auth state — persisted to localStorage, cleared on logout
- No token expiry for now — single trusted user
