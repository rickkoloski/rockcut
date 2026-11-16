import { create } from 'zustand'
import api, { PASSWORD_RESET_EVENT, SERVER_BACK_EVENT, SERVER_DOWN_EVENT } from '../lib/api'
import queryClient from '../lib/queryClient'
import type { Me, User, Capabilities, IdeaBoardEntry, TaskBoardEntry } from '../lib/types'
import { cacheColorMode, isColorMode, type ColorMode } from '../lib/colorMode'
import { cleanSettings } from '../lib/tasks'
import { GANTT_BOARD, cleanGanttSettings } from '../lib/gantt'
import { boardKey, mergeRefresh, refreshDue, writeLog, type StoredSettings } from '../lib/meRefresh'
import {
  SHARED_DEVICE_LOGIN_REFUSED,
  TOKEN_KEY,
  clearUnpaired,
  isDeviceToken,
  markUnpaired,
  signOutOnServer,
} from '../lib/device'

interface AuthState {
  token: string | null
  user: User | null
  capabilities: Capabilities | null
  sharedDevices: boolean
  staffCodes: boolean
  beerBoardManage: boolean
  /** D41: the task boards this person can open (D40: a device, its home board). */
  taskBoards: TaskBoardEntry[]
  /** D53 Part 2: the Idea Boards this person can open (`/api/me`), Company last. */
  ideaBoards: IdeaBoardEntry[]
  /** D43: the theme that applies here; null until /api/me answers. */
  colorMode: ColorMode | null
  /** D49: the Brewery board's "Show planned batches", saved per person on the server. */
  showPlannedBatches: boolean
  /**
   * D58: each board's settings saved on the server for this account (a
   * tablet: its own), only what was changed. D56 decision 18: `production`
   * holds the Gantt's expanded tanks and "Label by".
   */
  boardSettings: Record<string, StoredSettings>
  isAuthenticated: boolean
  bootstrapped: boolean
  isLoading: boolean
  error: string | null
  /** /api/me failed on the network or with a 5xx: the token is kept and loadMe is retried (DEV pass 1 G1). */
  unreachable: boolean
  /** D55 gap 2: mid-session, a 401's /api/me recheck couldn't reach the server; App rechecks and shows a banner. */
  serverDown: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  /** `force` (Try now, back online) replaces a check that's still waiting on a stalled connection. */
  loadMe: (opts?: { force?: boolean }) => Promise<void>
  /**
   * D56 §3.4: re-read /api/me (at most once a minute) and take the board
   * settings, theme and Show planned batches from it. Settings being saved
   * here keep this page's value; a failure is silent.
   */
  refreshMe: (now?: number) => Promise<void>
  /** D43: save the person's theme. Applied at once; put back (and rethrown) if the server refuses. */
  setColorMode: (mode: ColorMode) => Promise<void>
  /** D49: save "Show planned batches". Applied at once; put back (and rethrown) if the server refuses. */
  setShowPlannedBatches: (show: boolean) => Promise<void>
  /**
   * D58: save some of a board's settings. Applied at once; if the server
   * refuses, the change stays for this page and the error is rethrown.
   */
  saveBoardSettings: (board: string, changes: StoredSettings) => Promise<void>
  // D33 — shared tablets
  pairDevice: (code: string, name: string) => Promise<void>
  signOutDevice: () => Promise<void>
}

/** How long start-up waits for /api/me before showing "Can't reach the server" (DEV pass 2 G4). */
const ME_TIMEOUT_MS = 15_000

// One /api/me at a time per token, so the retries can't pile up. A forced
// call aborts it and takes over (DEV pass 3 G1).
interface Load {
  token: string
  controller: AbortController
  promise: Promise<void>
}
let loading: Load | null = null

// D56 §3.4: the settings saved from this page, and when /api/me was last re-read.
const writes = writeLog()
let lastRefresh: number | null = null

const serverSettings = (data: Me) => ({
  colorMode: isColorMode(data.color_mode) ? data.color_mode : ('light' as ColorMode),
  showPlannedBatches: data.show_planned_batches !== false,
  boardSettings: Object.fromEntries(
    Object.entries(data.board_settings ?? {}).map(([k, v]) => [k, k === GANTT_BOARD ? cleanGanttSettings(v) : cleanSettings(v)]),
  ) as Record<string, StoredSettings>,
})

function errorMessage(err: unknown, fallback: string): string {
  return err && typeof err === 'object' && 'response' in err
    ? (err as { response: { data: { error?: string } } }).response?.data?.error || fallback
    : fallback
}

const useAuth = create<AuthState>((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY),
  user: null,
  capabilities: null,
  sharedDevices: false,
  staffCodes: false,
  beerBoardManage: false,
  taskBoards: [],
  ideaBoards: [],
  colorMode: null,
  showPlannedBatches: true,
  boardSettings: {},
  isAuthenticated: !!localStorage.getItem(TOKEN_KEY),
  bootstrapped: false,
  isLoading: false,
  error: null,
  unreachable: false,
  serverDown: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      // D54: a paired tablet says so, and the API refuses the login.
      const current = localStorage.getItem(TOKEN_KEY)
      const device = isDeviceToken(current) ? current : null
      const { data } = await api.post<{ token: string }>(
        '/api/session',
        { email, password },
        device ? { headers: { 'X-Rockcut-Device': device } } : undefined
      )
      localStorage.setItem(TOKEN_KEY, data.token)
      set({ token: data.token, isAuthenticated: true })
      // loadMe sets bootstrapped, or leaves it unset to retry if the server can't be reached.
      await get().loadMe()
      set({ isLoading: false })
    } catch (err: unknown) {
      const refused = (err as { response?: { status?: number } })?.response?.status === 403
      set({ error: refused ? SHARED_DEVICE_LOGIN_REFUSED : errorMessage(err, 'Login failed'), isLoading: false })
    }
  },

  logout: () => {
    const { token } = get()
    // DEV G4: a person's Logout never unpairs a tablet. If storage holds a
    // tablet token (another tab already ended this person's session), re-sync.
    if (isDeviceToken(localStorage.getItem(TOKEN_KEY)) || isDeviceToken(token)) {
      window.location.assign('/')
      return
    }
    if (token) {
      // D34: the server revokes this session. D36-H: if it can't be reached
      // (offline, or the tab closes), the sign-out is retried later.
      void signOutOnServer(token)
    }
    localStorage.removeItem(TOKEN_KEY)
    set({ token: null, user: null, capabilities: null, sharedDevices: false, staffCodes: false, beerBoardManage: false, taskBoards: [], ideaBoards: [], colorMode: null, boardSettings: {}, isAuthenticated: false })
  },

  loadMe: (opts) => {
    const { token } = get()
    if (!token) {
      set({ bootstrapped: true, unreachable: false })
      return Promise.resolve()
    }
    if (loading?.token === token) {
      if (!opts?.force) return loading.promise
      loading.controller.abort()
    }
    const load = { token, controller: new AbortController() } as Load
    // A call that a forced one replaced has nothing more to say.
    const superseded = () => loading !== load
    load.promise = (async () => {
      try {
        const { data } = await api.get<Me>('/api/me', { timeout: ME_TIMEOUT_MS, signal: load.controller.signal })
        if (superseded()) return
        // DEV pass 2 G4: a captive Wi-Fi page answers 200 with HTML.
        if (!data?.user || !data?.capabilities) throw new Error('Not an /api/me answer')
        // The token changed while this was in flight (another tab signed in or
        // out): this answer is for a session that's gone (D33).
        if (localStorage.getItem(TOKEN_KEY) !== token) return
        const { colorMode, showPlannedBatches, boardSettings } = serverSettings(data)
        cacheColorMode(colorMode)
        lastRefresh = Date.now()
        set({
          user: data.user,
          capabilities: data.capabilities,
          sharedDevices: !!data.shared_devices,
          staffCodes: !!data.staff_codes,
          beerBoardManage: !!data.beer_board_manage,
          taskBoards: Array.isArray(data.task_boards) ? data.task_boards : [],
          ideaBoards: Array.isArray(data.idea_boards) ? data.idea_boards : [],
          colorMode,
          showPlannedBatches,
          boardSettings,
          isAuthenticated: true,
          bootstrapped: true,
          unreachable: false,
        })
      } catch {
        // A token that really ended is already gone: the axios interceptor
        // signed out or unpaired before this request failed.
        if (superseded() || localStorage.getItem(TOKEN_KEY) !== token) return
        // DEV pass 1 G1, pass 2 G1, D55 §2.1: so the token is still good.
        // Offline, a timeout, a 5xx, a proxy's 404/408/429, or a 401 that
        // GET /api/me's recheck didn't confirm say nothing about it: keep it
        // (on a tablet it may be the pairing itself) and retry; App shows
        // "Can't reach the server".
        set({ bootstrapped: false, unreachable: true })
      } finally {
        if (loading === load) loading = null
      }
    })()
    loading = load
    return load.promise
  },

  refreshMe: async (now = Date.now()) => {
    const { token, user, bootstrapped } = get()
    // Start-up's /api/me (or its retries) is in charge until it has answered.
    if (!token || !user || !bootstrapped || loading || !refreshDue(lastRefresh, now)) return
    lastRefresh = now
    const mark = writes.mark()
    try {
      const { data } = await api.get<Me>('/api/me', { timeout: ME_TIMEOUT_MS })
      if (!data?.user || localStorage.getItem(TOKEN_KEY) !== token || get().token !== token) return
      const s = get()
      const merged = mergeRefresh(
        { colorMode: s.colorMode, showPlannedBatches: s.showPlannedBatches, boardSettings: s.boardSettings },
        serverSettings(data),
        writes.since(mark),
      )
      if (merged.colorMode) cacheColorMode(merged.colorMode)
      set(merged)
    } catch {
      // Silent: the app is working; a token that really ended is handled by
      // the axios interceptor, and the next return to the screen tries again.
    }
  },

  setColorMode: async (mode) => {
    const before = get().colorMode
    set({ colorMode: mode })
    cacheColorMode(mode)
    const done = writes.begin('color_mode')
    try {
      // A stalled connection fails too, rather than leaving an unsaved theme showing.
      await api.put('/api/me/color_mode', { color_mode: mode }, { timeout: 10_000 })
    } catch (err) {
      set({ colorMode: before })
      if (before) cacheColorMode(before)
      throw err
    } finally {
      done()
    }
  },

  setShowPlannedBatches: async (show) => {
    const before = get().showPlannedBatches
    set({ showPlannedBatches: show })
    const done = writes.begin('show_planned_batches')
    try {
      await api.put('/api/me/show_planned_batches', { show_planned_batches: show }, { timeout: 10_000 })
    } catch (err) {
      set({ showPlannedBatches: before })
      throw err
    } finally {
      done()
    }
  },

  saveBoardSettings: async (board, changes) => {
    set((s) => ({ boardSettings: { ...s.boardSettings, [board]: { ...s.boardSettings[board], ...changes } } }))
    const done = writes.begin(...Object.keys(changes).map((k) => boardKey(board, k)))
    try {
      await api.put(`/api/me/board_settings/${encodeURIComponent(board)}`, changes, { timeout: 10_000 })
    } finally {
      done()
    }
  },

  // Exchange a pairing code for this tablet's token (D33 §3.2).
  pairDevice: async (code: string, name: string) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await api.post<{ token: string }>('/api/device_tokens', { code, name })
      localStorage.setItem(TOKEN_KEY, data.token)
      clearUnpaired()
      // DEV QA G5: the tablet's Home, from whatever URL it was paired on. The
      // form stays on "Setting up..." until the page reloads.
      window.location.assign('/')
    } catch (err: unknown) {
      set({ error: errorMessage(err, 'Could not set up this tablet'), isLoading: false })
    }
  },

  // Signing out a tablet revokes its token; it needs a new code afterwards.
  // DEV G4: only once the server has revoked it. On any failure the error is
  // rethrown and the tablet keeps its token, so the user can retry. (A 401
  // means it was already revoked: the interceptor shows the setup screen.)
  signOutDevice: async () => {
    await api.delete('/api/session')
    markUnpaired()
    window.location.assign('/')
  },
}))

// D42 §2.1: the API refused a call because a new password is required: show
// "Set a new password" (App), as when /api/me says so.
window.addEventListener(PASSWORD_RESET_EVENT, () => {
  const { user } = useAuth.getState()
  if (user && !user.must_reset_password) useAuth.setState({ user: { ...user, must_reset_password: true } })
})

// D55 lead decisions 6 (gap 2): a 401's /api/me recheck couldn't reach the
// server. App shows "Can't reach the server, retrying…" and rechecks; when it
// answers again, the banner goes and every query on screen loads again (the
// failed view recovers without navigating).
window.addEventListener(SERVER_DOWN_EVENT, () => useAuth.setState({ serverDown: true }))
window.addEventListener(SERVER_BACK_EVENT, () => {
  useAuth.setState({ serverDown: false })
  void queryClient.invalidateQueries()
})

// D56 §3.4: back on the screen (another tab, the tablet waking, the PWA
// brought back), pick up settings changed elsewhere. Shared tablets too.
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void useAuth.getState().refreshMe()
  })

export default useAuth
