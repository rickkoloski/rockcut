// D56 §3.4: when the app comes back to the screen it re-reads /api/me, at
// most once a minute, and takes the settings another device may have
// changed: board settings, the theme and "Show planned batches". A setting
// written here since the read was sent (a PUT in flight, or one that just
// finished) keeps this page's value.

import type { ColorMode } from './colorMode'
import type { BoardSettings } from './tasks'

export const REFRESH_GAP_MS = 60_000

/** At most one refresh a minute (the first always goes). */
export const refreshDue = (last: number | null, now: number, gap = REFRESH_GAP_MS) => last == null || now - last >= gap

export interface Refreshed {
  colorMode: ColorMode | null
  showPlannedBatches: boolean
  boardSettings: Record<string, Partial<BoardSettings>>
}

/** The key a local write is recorded under: `color_mode`, `show_planned_batches`, `board:<board>:<setting>`. */
export const boardKey = (board: string, setting: string) => `board:${board}:${setting}`

/**
 * The server's settings, except those `written` here since the read was
 * sent, which keep `local`'s value.
 */
export function mergeRefresh(local: Refreshed, server: Refreshed, written: (key: string) => boolean): Refreshed {
  const boards = new Set([...Object.keys(local.boardSettings), ...Object.keys(server.boardSettings)])
  const boardSettings: Record<string, Partial<BoardSettings>> = {}
  for (const board of boards) {
    const mine = local.boardSettings[board] ?? {}
    const merged: Record<string, unknown> = { ...(server.boardSettings[board] ?? {}) }
    for (const [k, v] of Object.entries(mine)) if (written(boardKey(board, k))) merged[k] = v
    if (Object.keys(merged).length) boardSettings[board] = merged as Partial<BoardSettings>
  }
  return {
    colorMode: written('color_mode') ? local.colorMode : server.colorMode,
    showPlannedBatches: written('show_planned_batches') ? local.showPlannedBatches : server.showPlannedBatches,
    boardSettings,
  }
}

/**
 * Local writes: a read keeps a setting whose PUT is still in flight, or
 * started or finished after the read was sent.
 */
export function writeLog() {
  let seq = 0
  const last = new Map<string, number>()
  const inFlight = new Map<string, number>()
  const touch = (keys: string[], d: number) => {
    seq += 1
    for (const k of keys) {
      last.set(k, seq)
      inFlight.set(k, (inFlight.get(k) ?? 0) + d)
    }
  }
  return {
    /** A local write of `keys` starts; call the returned function when its PUT ends (either way). */
    begin: (...keys: string[]) => {
      touch(keys, 1)
      return () => touch(keys, -1)
    },
    /** The mark a read takes when it's sent. */
    mark: () => seq,
    /** Whether `key` is in flight or was written after `mark`. */
    since: (mark: number) => (key: string) => (inFlight.get(key) ?? 0) > 0 || (last.get(key) ?? 0) > mark,
  }
}
