import { closeSync, existsSync, openSync, readFileSync } from 'node:fs'

// D34: a pool of extra sessions of one persona (`bartender2`), minted by
// auth.setup.ts with everyone else's tokens. A spec that signs a session out
// claims its own spare, so it never revokes a shared persona token, and no
// password hash is spent (DEV fix cycle 2: Argon2 on DEV's one vCPU starved
// the suite). Claims are files created exclusively, so parallel workers never
// get the same spare.

export const SPARES_FILE = 'tests/.playwright-auth/spares.json'
export const SPARE_CLAIMS_DIR = 'tests/.playwright-auth/spare-claims'
/** The spare persona's display name (synthetic seed). */
export const SPARE_NAME = 'Alex Draft'

/** A session token of the spare persona that no other spec has used. */
export function claimSpare(): string {
  if (!existsSync(SPARES_FILE)) throw new Error(`no ${SPARES_FILE}: run the setup project (auth.setup.ts)`)
  const { tokens } = JSON.parse(readFileSync(SPARES_FILE, 'utf8')) as { tokens: string[] }
  for (let i = 0; i < tokens.length; i++) {
    try {
      closeSync(openSync(`${SPARE_CLAIMS_DIR}/${i}`, 'wx'))
      return tokens[i]
    } catch {
      // Claimed by another spec; try the next one.
    }
  }
  throw new Error(`all ${tokens.length} spare sessions are used; raise @spare_count in synthetic.ex`)
}
