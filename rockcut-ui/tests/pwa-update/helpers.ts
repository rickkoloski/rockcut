import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, type Page } from '@playwright/test'
import { authFile, type PersonaKey } from '../config/test-env'

// D45: two builds of the app served by `vite preview` (:4173, /api proxied to
// :4002), so a running page can find a newer one. See tests/RUNNING.md.

export const PREVIEW_URL = 'http://localhost:4173'
const ROOT = 'tests/.pwa-update'
export type Build = 'A' | 'B' | 'OLD'

/** The last release before D45: no prompt code, an auto-updating worker (S189). */
export const OLD_RELEASE = 'v2026.10.15'

/** Build A and B (the same source; `VITE_BUILD_ID` makes them differ) once per worker. */
export function buildBoth() {
  for (const id of ['A', 'B'] as Build[]) {
    execFileSync('npx', ['vite', 'build', '--outDir', `${ROOT}/${id}`, '--emptyOutDir'], {
      env: { ...process.env, VITE_BUILD_ID: id, VITE_ENV_LABEL: '' },
      stdio: 'ignore',
    })
  }
}

/** Build OLD_RELEASE from a temporary worktree (sharing node_modules), once. */
export function buildOld() {
  const out = resolve(`${ROOT}/OLD`)
  if (existsSync(`${out}/sw.js`)) return
  const src = resolve(`${ROOT}/old-src`)
  rmSync(src, { recursive: true, force: true })
  execFileSync('git', ['worktree', 'prune'])
  execFileSync('git', ['worktree', 'add', '--detach', src, OLD_RELEASE], { stdio: 'ignore' })
  try {
    symlinkSync(resolve('node_modules'), `${src}/rockcut-ui/node_modules`)
    execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], {
      cwd: `${src}/rockcut-ui`,
      env: { ...process.env, VITE_ENV_LABEL: '' },
      stdio: 'ignore',
    })
  } finally {
    execFileSync('git', ['worktree', 'remove', '--force', src])
  }
}

/** "Deploy": replace what the preview server serves with build `id`. */
export function serve(id: Build) {
  mkdirSync(`${ROOT}/serve`, { recursive: true })
  for (const f of readdirSync(`${ROOT}/serve`)) rmSync(`${ROOT}/serve/${f}`, { recursive: true })
  cpSync(`${ROOT}/${id}`, `${ROOT}/serve`, { recursive: true })
}

export async function startPreview(): Promise<ChildProcess> {
  const server = spawn('npx', ['vite', 'preview', '--outDir', `${ROOT}/serve`, '--port', '4173', '--strictPort'], {
    detached: true,
    stdio: 'ignore',
  })
  await expect
    .poll(async () => fetch(PREVIEW_URL).then((r) => r.status, () => 0), { timeout: 30_000 })
    .toBe(200)
  return server
}

export function stopPreview(server: ChildProcess | undefined) {
  if (server?.pid) process.kill(-server.pid)
}

/** A persona's saved sign-in on the preview origin (written by `writePreviewStates`). */
export const previewState = (persona: PersonaKey) => `${ROOT}/state-${persona}.json`

/** Copy the personas' sign-ins (minted by `setup`) to the preview origin. */
export function writePreviewStates(personas: PersonaKey[]) {
  mkdirSync(ROOT, { recursive: true })
  for (const persona of personas) {
    const state = JSON.parse(readFileSync(authFile(persona), 'utf8'))
    state.origins = state.origins.map((o: { origin: string }) => ({ ...o, origin: PREVIEW_URL }))
    writeFileSync(previewState(persona), JSON.stringify(state))
  }
}

/** The build this page runs (`<html data-build>`). */
export const runningBuild = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.build).catch(() => undefined) // mid-reload: ask again

/** Open `path` on build A and wait until the service worker controls the page. */
export async function openOnA(page: Page, path: string) {
  serve('A')
  await page.goto(path)
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20_000 })
  expect(await runningBuild(page)).toBe('A')
}

/** Deploy B, then the page comes back into view (it checks for a new build). */
export async function deployBAndLook(page: Page) {
  serve('B')
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
}

export const prompt = (page: Page) => page.getByTestId('update-prompt')
