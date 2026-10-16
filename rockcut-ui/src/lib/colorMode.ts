// D43: the theme setting (`users.color_mode`). `/api/me` sends the one that
// applies here: a shared tablet's own, also while someone uses "Sign in as me".
export type ColorMode = 'light' | 'dark' | 'device'

export const COLOR_MODES: { key: ColorMode; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'device', label: 'Match this device' },
]

// The last mode seen in this browser, used before /api/me answers and on the
// sign-in page so a dark user doesn't get a light flash. A cache only.
const CACHE_KEY = 'rockcut_color_mode'

export function isColorMode(v: unknown): v is ColorMode {
  return v === 'light' || v === 'dark' || v === 'device'
}

export function cachedColorMode(): ColorMode {
  try {
    const v = localStorage.getItem(CACHE_KEY)
    return isColorMode(v) ? v : 'light'
  } catch {
    return 'light'
  }
}

export function cacheColorMode(mode: ColorMode) {
  try {
    localStorage.setItem(CACHE_KEY, mode)
  } catch {
    /* private window or blocked storage: the cache is optional */
  }
}
