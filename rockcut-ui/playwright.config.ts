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
      testIgnore: /beer-board-replace\.spec\.ts/,
      dependencies: ['setup'],
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
  ],
})
