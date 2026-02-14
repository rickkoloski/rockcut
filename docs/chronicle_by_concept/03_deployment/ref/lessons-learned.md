# Deployment Lessons Learned

Issues encountered during the initial Rockcut deployment to Fly.io, and how we solved them.

---

## 1. pnpm Lockfile Mismatch in Docker

**Date:** 2026-02-12

**Symptom:** `fly deploy` fails with:
```
ERR_PNPM_LOCKFILE_CONFIG_MISMATCH  Cannot proceed with the frozen installation.
The current "overrides" configuration doesn't match the value found in the lockfile
```

**Root Cause:** The local `pnpm-lock.yaml` contains an `overrides` section for the `datagrid-extended` linked package:
```yaml
overrides:
  datagrid-extended: link:../../ui-components/datagrid-extended
```
In Docker, this link path doesn't exist, and the Docker build uses `package.docker.json` which doesn't include that dependency — creating a mismatch.

**Solution:** Use `--no-frozen-lockfile` in the Dockerfile and a separate `package.docker.json` that omits the link dependency entirely. The Dockerfile copies `package.docker.json` as `package.json`:
```dockerfile
COPY package.docker.json ./package.json
RUN pnpm install --no-frozen-lockfile
```

**Key Insight:** When you have `pnpm link` dependencies, you need a Docker-specific package.json. This is the same pattern vNext uses with `package.docker.json` for its `wf_ui_src` local dependency.

---

## 2. TypeScript Build Fails: Cannot Find Module 'datagrid-extended'

**Date:** 2026-02-12

**Symptom:** `tsc -b` fails in Docker:
```
src/pages/Recipes.tsx(3,34): error TS2307: Cannot find module 'datagrid-extended'
```

**Root Cause:** TypeScript's module resolution doesn't know about the Vite `resolve.alias` that maps `datagrid-extended` to a local directory. The shim directory (`.datagrid-extended-src/`) exists at runtime but TypeScript can't find it at type-check time.

**Solution:** Added a type declaration file at `src/datagrid-extended.d.ts`:
```typescript
declare module 'datagrid-extended' {
  import type { DataGridProps } from '@mui/x-data-grid'
  export interface DataGridExtendedProps extends DataGridProps {}
  export function DataGridExtended(props: DataGridExtendedProps): JSX.Element
}
```

**Key Insight:** When using Vite `resolve.alias` for module resolution, you also need a `.d.ts` declaration for TypeScript to find the module during type checking.

---

## 3. TypeScript Build Fails: Unused Imports

**Date:** 2026-02-12

**Symptom:** Docker build fails with:
```
error TS6133: 'Divider' is declared but its value is never read.
error TS6133: 'fs' is declared but its value is never read.
```

**Root Cause:** The tsconfig has `noUnusedLocals: true`. In dev, these warnings may not have surfaced (or were ignored), but `tsc -b` in Docker treats them as errors.

**Solution:** Removed the unused imports:
- Removed `Divider` from `ComponentShowcase.tsx` MUI import list
- Removed `fs` from `vite.config.ts` (was imported but never used)

**Key Insight:** If your build script includes `tsc -b`, every TypeScript strict check must pass in Docker, not just locally. Run `tsc -b` locally before deploying to catch these early.

---

## 4. nginx 403 Forbidden on Static Assets

**Date:** Not encountered on rockcut (preventive), but learned from vNext's `sinch-demo-surface`.

**Symptom:** nginx returns 403 for JavaScript and CSS files.

**Root Cause:** Docker's `COPY --from=builder` may produce files that aren't world-readable.

**Solution:** Added to Dockerfile after copying assets:
```dockerfile
RUN chmod -R a+r /usr/share/nginx/html
```

**Prevention:** Always include the `chmod` step in any nginx-based Docker deployment.

---

## 5. Fly Volume Create Requires --yes Flag

**Date:** 2026-02-12

**Symptom:** `fly volumes create` fails with:
```
Error: yes flag must be specified when not running interactively
```

**Root Cause:** Fly CLI requires explicit confirmation for volume creation in non-interactive environments (including when piped through other tools).

**Solution:** Add `--yes` flag:
```bash
fly volumes create rockcut_data --size 1 --region dfw -a rockcut-api --yes
```

**Key Insight:** Any Fly CLI command that shows a warning prompt needs `--yes` when running non-interactively.

---

## 6. Vite Environment Variables Are Build-Time Only

**Date:** Not encountered as a bug (preventive), but critical to understand.

**Symptom:** Changing a `VITE_*` environment variable in Fly secrets has no effect.

**Root Cause:** Vite replaces `import.meta.env.VITE_*` at build time using string replacement. The values are baked into the JavaScript bundle. Changing runtime env vars doesn't affect the built JS.

**Solution:** `VITE_API_URL` is set via `[build.args]` in `fly.toml`, not via `fly secrets`. To change it, update `fly.toml` and redeploy.

**Key Insight:** For values that need to change without rebuilding, read them from a runtime config endpoint or `window.__CONFIG__` pattern instead.
