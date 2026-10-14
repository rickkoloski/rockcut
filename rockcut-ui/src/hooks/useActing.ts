import { create } from 'zustand'
import useAuth from './useAuth'
import {
  ActingCancelled,
  actingExpired,
  recordedAs,
  staffCodeFailure,
  startActing,
  touchActing,
  type ActingSession,
} from '../lib/acting'

type Write<T> = (code: string | undefined) => Promise<T>

interface Waiting {
  write: Write<unknown>
  resolve: (value: unknown) => void
  reject: (err: unknown) => void
}

interface ActingState {
  /** The person the tablet is acting as, while their code is remembered. */
  session: ActingSession | null
  /**
   * The staff-code dialog, open with an error under the field (or none).
   * `attempt` changes with each refusal, so the dialog clears the field.
   */
  asking: { error: string | null; attempt: number } | null
  submitting: boolean
  /** Writes waiting for a code (the first one runs with the code typed). */
  waiting: Waiting[]
  /**
   * Run a task-board write. People: `write(undefined)`. A shared tablet: with
   * the remembered code, else after asking for one. A write refused for its
   * code forgets the code and asks again. Rejects with `ActingCancelled` when
   * the dialog is cancelled.
   */
  run: <T>(write: Write<T>) => Promise<T>
  /** The dialog's submit: run the first waiting write with `code`. */
  submit: (code: string) => Promise<void>
  cancel: () => void
  /** Done in the banner: forget the code now. */
  done: () => void
  /** Pointer or key activity on the tablet (keeps the code for another 5 minutes). */
  activity: () => void
  /** Forget the code once it's been idle too long (ticked by the banner). */
  expire: () => void
}

const isDevice = () => useAuth.getState().user?.kind === 'device'

/**
 * D40 (plan decision 3, spec §3.4): a shared tablet's "acting as" state for
 * the task boards. The code lives only here, in memory: Done, 5 idle
 * minutes, a reload or a refused code end it.
 */
const useActing = create<ActingState>((set, get) => {
  const ask = <T,>(write: Write<T>, error: string | null) =>
    new Promise<T>((resolve, reject) => {
      set((s) => ({
        waiting: [...s.waiting, { write: write as Write<unknown>, resolve: resolve as (v: unknown) => void, reject }],
        asking: s.asking ? (error ? { error, attempt: s.asking.attempt + 1 } : s.asking) : { error, attempt: 0 },
      }))
    })

  const current = () => {
    const s = get().session
    if (s && actingExpired(s, Date.now())) {
      set({ session: null })
      return null
    }
    return s
  }

  return {
    session: null,
    asking: null,
    submitting: false,
    waiting: [],

    run: async <T,>(write: Write<T>): Promise<T> => {
      if (!isDevice()) return write(undefined)
      // A dialog is already open: wait in line for its code.
      if (get().asking) return ask(write, null)
      const s = current()
      if (!s) return ask(write, null)
      try {
        const res = await write(s.code)
        get().activity()
        return res
      } catch (err) {
        const failure = staffCodeFailure(err)
        if (!failure) throw err
        set({ session: null })
        return ask(write, failure.message)
      }
    },

    submit: async (code: string) => {
      const [first, ...rest] = get().waiting
      if (!first) return set({ asking: null })
      set({ submitting: true })
      try {
        const res = await first.write(code)
        set({
          session: startActing(code, recordedAs(res) ?? get().session?.name ?? '', Date.now()),
          asking: null,
          submitting: false,
          waiting: [],
        })
        first.resolve(res)
        // The rest go through with the code now remembered.
        for (const w of rest) get().run(w.write).then(w.resolve, w.reject)
      } catch (err) {
        const failure = staffCodeFailure(err)
        if (failure) {
          set((s) => ({ submitting: false, asking: { error: failure.message, attempt: (s.asking?.attempt ?? 0) + 1 } }))
          return
        }
        // Refused for another reason: that write fails as it would for anyone.
        set({ submitting: false, asking: rest.length ? get().asking : null, waiting: rest })
        first.reject(err)
      }
    },

    cancel: () => {
      const waiting = get().waiting
      set({ asking: null, waiting: [], submitting: false })
      waiting.forEach((w) => w.reject(new ActingCancelled()))
    },

    done: () => set({ session: null }),

    activity: () => {
      const s = get().session
      if (s) set({ session: touchActing(s, Date.now()) })
    },

    expire: () => {
      current()
    },
  }
})

export default useActing

/** Run a task-board write, with a staff code on a shared tablet (see `useActing`). */
export const actingRun = <T,>(write: (code: string | undefined) => Promise<T>) => useActing.getState().run(write)

// Whoever is signed in changed (a sign-out, "Sign in as me" and back): forget the code.
useAuth.subscribe((s, prev) => {
  if (s.user?.id !== prev.user?.id && useActing.getState().session) useActing.setState({ session: null })
})
