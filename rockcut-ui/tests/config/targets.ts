import targets from './e2e-targets.json' with { type: 'json' }

export type ProfileName = keyof typeof targets.profiles
export interface Profile {
  uiUrl: string
  apiUrl: string
  tokenSource: 'mix' | 'fly'
}

/**
 * The active target (E2E_TARGET=local|dev, default local), checked against the
 * prod guard. Fail-closed: a host that isn't explicitly allowed is refused.
 */
export function activeProfile(): Profile & { name: ProfileName } {
  const name = (process.env.E2E_TARGET || 'local') as ProfileName
  const profile = targets.profiles[name] as Profile | undefined
  if (!profile) throw new Error(`Unknown E2E_TARGET "${name}"; expected one of ${Object.keys(targets.profiles).join(', ')}`)

  for (const url of [profile.uiUrl, profile.apiUrl]) assertAllowed(url)
  return { name, ...profile }
}

export function assertAllowed(url: string) {
  const host = new URL(url).hostname
  const { allowedHosts, deniedPatterns } = targets.prodGuard
  if (deniedPatterns.some((p) => new RegExp(p).test(host))) {
    throw new Error(`prodGuard: ${host} is production — synthetic tests never run there`)
  }
  if (!allowedHosts.includes(host)) {
    throw new Error(`prodGuard: ${host} is not in allowedHosts (fail-closed)`)
  }
}
