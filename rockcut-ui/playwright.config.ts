import { defineConfig, devices } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { activeProfile } from './tests/config/targets'

// Local secrets for login-flow specs (gitignored): SEED_PASSWORD=...
if (existsSync('.env.test.local')) {
  for (const line of readFileSync('.env.test.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?(.*?)"?\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

// D30 — E2E_TARGET=local (default) | dev. The prod guard in activeProfile()
// refuses production hosts. See tests/RUNNING.md.
const profile = activeProfile()

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: profile.uiUrl,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      testMatch: /.*\.spec\.ts/,
      testIgnore: [/beer-board-replace\.spec\.ts/, /task-board-.*\.spec\.ts/, /pwa-update\//, /regression\/production\//],
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    // D38: the Brewery task board is one shared board, and "Move all to today"
    // moves every open past task, so its specs run one at a time (beside the
    // rest of the suite, which never touches the board).
    {
      name: 'brewery-board',
      testMatch: /task-board-.*\.spec\.ts/,
      dependencies: ['setup'],
      workers: 1,
      use: { ...devices['Desktop Chrome'] },
    },
    // D46: tanks, phases, step types and templates are shared lists, and a
    // reorder names every active row, so the production specs run one at a
    // time (beside the rest of the suite, which never touches them).
    {
      name: 'production',
      testMatch: /regression\/production\/.*\.spec\.ts/,
      dependencies: ['setup'],
      workers: 1,
      use: { ...devices['Desktop Chrome'] },
    },
    // D37: Import → Replace clears the whole shared board, so those specs run
    // alone: one worker, after every other spec has finished.
    {
      name: 'board-replace',
      testMatch: /beer-board-replace\.spec\.ts/,
      dependencies: ['setup', 'chromium'],
      workers: 1,
      use: { ...devices['Desktop Chrome'] },
    },
    // D45: the "New version available" prompt, against two builds behind
    // `vite preview` (:4173). Only with PWA_UPDATE=1: it builds the app twice.
    // See tests/RUNNING.md.
    ...(process.env.PWA_UPDATE
      ? [
          {
            name: 'pwa-update',
            testMatch: /pwa-update\/.*\.spec\.ts/,
            dependencies: ['setup'],
            workers: 1,
            use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4173' },
          },
        ]
      : []),
  ],
})
