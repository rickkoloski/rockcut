# D4: Auth — Complete

**Completed:** 2026-02-12

## Summary
Implemented bearer token authentication with EnvAuth pattern. Single admin user, credentials in Fly secrets.

## What Was Built
- `lib/rockcut_api_web/controllers/session_controller.ex` — POST /api/session
- `lib/rockcut_api_web/plugs/require_auth.ex` — bearer token verification plug
- `src/hooks/useAuth.ts` — Zustand store with localStorage persistence
- `src/pages/Login.tsx` — login page
- Auth gate in App.tsx — redirects to login if no token

## Key Details
- Token: Phoenix.Token.sign/verify with 30-day max age
- Credentials: ADMIN_EMAIL + ADMIN_PASSWORD_HASH env vars
- Password hashing: Bcrypt (via :bcrypt_elixir)

## Deviations
- No token refresh or expiry UI — acceptable for single-user app
