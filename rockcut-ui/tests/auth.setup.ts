import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { test as setup, expect } from '@playwright/test'
import { activePersonaKeys, authFile, personas } from './config/test-env'
import { activeProfile } from './config/targets'

type Minted = Record<string, { email: string; token: string }>

/**
 * Mint a short-lived token for every active persona in ONE call and write a
 * Playwright storageState per persona — no UI login, no password (D30).
 *   local: `mix rockcut.synthetic.token --all` in ../rockcut_api
 *   dev:   `fly ssh console` → RockcutApi.Release.mint_tokens_json()
 *   E2E_TOKENS_JSON: pre-minted JSON, for agents without mix/fly access.
 */
function mintAll(source: 'mix' | 'fly'): Minted {
  if (process.env.E2E_TOKENS_JSON) return JSON.parse(process.env.E2E_TOKENS_JSON)

  const out =
    source === 'mix'
      ? execFileSync('mix', ['rockcut.synthetic.token', '--all'], { cwd: '../rockcut_api', encoding: 'utf8' })
      : execFileSync(
          'fly',
          ['ssh', 'console', '-a', 'rockcut-api-dev', '-C', "/app/bin/rockcut_api eval 'RockcutApi.Release.mint_tokens_json()'"],
          { encoding: 'utf8' },
        )

  const json = out.trim().split('\n').reverse().find((line) => line.startsWith('{'))
  if (!json) throw new Error(`No token JSON in output:\n${out}`)
  return JSON.parse(json)
}

setup('mint persona tokens', async ({ request }) => {
  const profile = activeProfile()
  const minted = mintAll(profile.tokenSource)
  mkdirSync('tests/.playwright-auth', { recursive: true })

  for (const key of activePersonaKeys) {
    const entry = minted[key]
    expect(entry, `no token minted for ${key}`).toBeTruthy()
    expect(entry.email).toBe(personas[key].email)

    // The token must be accepted by the target API before we rely on it.
    const me = await request.get(`${profile.apiUrl}/api/me`, { headers: { Authorization: `Bearer ${entry.token}` } })
    expect(me.status(), `token for ${key} rejected by ${profile.apiUrl}`).toBe(200)

    writeFileSync(
      authFile(key),
      JSON.stringify({
        cookies: [],
        origins: [
          {
            origin: new URL(profile.uiUrl).origin,
            localStorage: [
              { name: 'rockcut_token', value: entry.token },
              { name: 'rockcut_email', value: entry.email },
            ],
          },
        ],
      }),
    )
  }
})
