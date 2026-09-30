/**
 * Synthetic test identities (D30) — the single source of truth for which users
 * an agent or spec may act as. Keys, emails and names match
 * rockcut_api/lib/rockcut_api/seeds/synthetic.ex.
 *
 * Policy (docs/process/test-credentials-policy.md):
 *   - Only these fictional @rockcut-test.com personas, only on allowlisted hosts
 *     (e2e-targets.json). Never a real person's account.
 *   - Log in with a minted token (tests/auth.setup.ts). The shared seed password
 *     is a secret with NO default here; only login-flow specs read it, from
 *     SEED_PASSWORD (rockcut-ui/.env.test.local locally, gitignored).
 */
export type PersonaKey =
  | 'owner'
  | 'breweryMgr'
  | 'barMgr'
  | 'brewer1'
  | 'brewer2'
  | 'bartender1'
  | 'bartender2'
  | 'office1'
  | 'floater'
  | 'newhire'
  | 'inactive'
  | 'hidden'
  | 'dualMgr'
  | 'splitRole'
  | 'noDept'
  | 'owner2'
  | 'sales1'
  | 'taproomDevice'

export interface Persona {
  email: string
  name: string
  /** Department key → role; empty for owners and noDept. */
  memberships: Record<string, 'manager' | 'employee'>
  isOwner?: boolean
  active?: boolean
  mustResetPassword?: boolean
  /** D33: a shared-device account (no password, no memberships; a `dev_` tablet token). */
  device?: { home: string }
}

export const personas: Record<PersonaKey, Persona> = {
  owner: { email: 'owner@rockcut-test.com', name: 'Olivia Owner', memberships: {}, isOwner: true },
  breweryMgr: { email: 'brewery.manager@rockcut-test.com', name: 'Morgan Mash', memberships: { brewery: 'manager' } },
  barMgr: { email: 'bar.manager@rockcut-test.com', name: 'Casey Tap', memberships: { bar: 'manager' } },
  brewer1: { email: 'brewer1@rockcut-test.com', name: 'Jake Brewer', memberships: { brewery: 'employee' } },
  brewer2: { email: 'brewer2@rockcut-test.com', name: 'Riley Wort', memberships: { brewery: 'employee' } },
  bartender1: { email: 'bartender1@rockcut-test.com', name: 'Sam Pour', memberships: { bar: 'employee' } },
  bartender2: { email: 'bartender2@rockcut-test.com', name: 'Alex Draft', memberships: { bar: 'employee' } },
  office1: { email: 'office1@rockcut-test.com', name: 'Pat Ledger', memberships: { office: 'employee' } },
  floater: { email: 'floater@rockcut-test.com', name: 'Jordan Float', memberships: { bar: 'employee', brewery: 'employee' } },
  newhire: { email: 'newhire@rockcut-test.com', name: 'Taylor New', memberships: { bar: 'employee' }, mustResetPassword: true },
  inactive: { email: 'inactive@rockcut-test.com', name: 'Drew Gone', memberships: {}, active: false },
  hidden: { email: 'hidden@rockcut-test.com', name: 'Quinn Hidden', memberships: { office: 'employee' } },
  dualMgr: { email: 'dual.manager@rockcut-test.com', name: 'Dana Dual', memberships: { bar: 'manager', office: 'manager' } },
  splitRole: { email: 'split.role@rockcut-test.com', name: 'Rowan Split', memberships: { bar: 'manager', brewery: 'employee' } },
  noDept: { email: 'nodept@rockcut-test.com', name: 'Nico None', memberships: {} },
  owner2: { email: 'owner2@rockcut-test.com', name: 'Avery Owner', memberships: {}, isOwner: true },
  sales1: { email: 'sales1@rockcut-test.com', name: 'Robin Pitch', memberships: { sales: 'employee' } },
  taproomDevice: { email: 'taproom.device@rockcut-test.com', name: 'Taproom tablets', memberships: {}, device: { home: 'bar' } },
}

export const personaKeys = Object.keys(personas) as PersonaKey[]

/** Active personas — the ones tokens are minted for. */
export const activePersonaKeys = personaKeys.filter((k) => personas[k].active !== false)

/** The seed password, for login-flow specs only. Undefined when not configured. */
export const seedPassword: string | undefined = process.env.SEED_PASSWORD || undefined

/** Path of a persona's Playwright storageState (written by auth.setup.ts, gitignored). */
export const authFile = (key: PersonaKey) => `tests/.playwright-auth/${key}.json`
