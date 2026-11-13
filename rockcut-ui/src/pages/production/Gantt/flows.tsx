import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  GlobalStyles,
  Portal,
  Radio,
  RadioGroup,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import { dayLabel } from '../../../lib/gantt'
import { isActingCancelled } from '../../../lib/acting'
import { plainBatchNumber, prodError, prodPath, SCHEDULE_KEY, type Answer } from '../../../lib/production'
import { codedApi, type CodedApi } from '../../../lib/codedApi'
import { actingRun } from '../../../hooks/useActing'
import { BOARD_QUERY_KEY } from '../../../lib/tasks'
import { usePhoneBackCloses } from '../../../hooks/useBackCloses'
import { renumberText, type Renumber } from './scheduleText'
import {
  failQuestion,
  moveWords,
  needsMovePrompt,
  needsRepreview,
  outcomeBody,
  outcomeWords,
  resultQuestion,
  retestDays,
  RETEST_MAX,
  RETEST_MIN,
  type Outcome,
  type ResultPreview,
  type ResultQuestion,
} from '../../../lib/testResults'
import { FlowsContext, type StepRef } from './flowsContext'
import ConfirmDialog from '../../../components/ConfirmDialog'
import { isUndoShortcut, snackAutoHide, undoHint } from '../../../lib/undoSnack'

// D47 §3.7: every schedule write goes through here. It refetches the
// schedule, says what happened with Undo for 6 seconds (plan decision 5),
// and runs the prompts a move or check-off needs, from the server's preview
// (decision 4): the brew-day number, then the move prompt.
//
// D50: on the brewhouse device each request goes through `useActing.run`, so
// the staff-code dialog opens before the first one (a preview included) and
// the code goes in every body while the "Acting as" window is open. Cancelling
// the dialog is a Failure with code `cancelled` and no message.

export type { Renumber }

export interface MovePreview {
  days: number
  batch_id: number | null
  batch_label: string | null
  /** D48 QA minor 10: every batch the move touches (a split part has its parent's id). */
  batches?: { id: number; label: string; split_parent_id?: number | null }[]
  moved: { id: number; batch_id?: number | null; name: string; due_on: string; new_due_on: string }[]
  /** D48 DEV QA Y1: a moved Split's parts' steps, which go with it whatever the answer. */
  carried?: { id: number; batch_id?: number | null; name: string; due_on: string; new_due_on: string }[]
  following: { id: number; batch_id?: number | null; name: string; due_on: string; new_due_on: string }[]
  default_answer: Answer | null
  /** D56 §3.1: the pre-brew steps that go with a moved brew day, per answer. */
  pre_brew?: Record<Answer, { id: number; batch_id?: number | null; name: string; due_on: string; new_due_on: string }[]>
  /** D56: why an answer can't be used (the API's refusal), or null. */
  refused?: Record<Answer, { error: string; message: string } | null>
  out_of_order: Record<Answer, { from_name: string; to_name: string }[]>
  renumbered: Record<Answer, Renumber[]>
}

interface CompletePreview extends ResultPreview {
  move: MovePreview | null
  done_on: string
  needs_batch_number: boolean
  next_batch_number: string | null
}

export type Failure = { ok: false; error: string; code?: string; body?: Record<string, unknown> }
export type Result<T = Record<string, unknown>> = { ok: true; data: T } | Failure

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const daysWord = (days: number) => `${plural(Math.abs(days), 'day')} ${days > 0 ? 'later' : 'earlier'}`
const andList = (items: string[]) => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`)

/** The parts a moved Split takes along ("Galactic P5.1 and Galactic P5.2"), or null. */
const carriedLabels = (pre: MovePreview) => {
  const ids = new Set((pre.carried ?? []).map((s) => s.batch_id))
  return (pre.batches ?? []).filter((b) => ids.has(b.id)).map((b) => b.label)
}
const carriedText = (pre: MovePreview) => {
  const labels = carriedLabels(pre)
  return labels.length ? andList(labels) : null
}


const bodyOf = (err: unknown) => (err as { response?: { data?: Record<string, unknown>; status?: number } })?.response

function failure(err: unknown): Failure {
  if (isActingCancelled(err)) return { ok: false, error: '', code: 'cancelled' }
  const res = bodyOf(err)
  return { ok: false, error: prodError(err), code: res?.data?.error as string | undefined, body: res?.data }
}

// The server keeps an Undo token for 2 minutes (Undo's @ttl_seconds).
const UNDO_TTL_MS = 120_000

/** One request, with the device's staff code when it's the brewhouse device (`useActing`). */
const coded = <T,>(call: (a: CodedApi) => Promise<T>) => actingRun((code) => call(codedApi(code)))

/** The snackbar: `refused` is a refused Undo, shown until its token runs out (D49 BB1). */
type Snack = { message: string; token: string | null; key: number; expiresAt: number; refused?: boolean }

const dialogOpen = () => typeof document !== 'undefined' && !!document.querySelector('[role="dialog"]')

// D56 §3.7 A: the hint shows on a device with a mouse (and so a keyboard).
const HINT = undoHint(
  typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches,
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? ''),
)

type Prompt =
  | { kind: 'move'; preview: MovePreview; title: string; retestOn: string | null; resolve: (a: Answer | null) => void }
  | { kind: 'schedule'; label: string; resolve: (ok: boolean) => void }
  | { kind: 'number'; label: string; value: string; error: string | null; suggestion: string; resolve: (n: string | null) => void }
  | { kind: 'result'; name: string; question: ResultQuestion; failOnly: boolean; resolve: (o: Outcome | null) => void }
  | { kind: 'confirm'; title: string; message: string; confirmLabel: string; resolve: (ok: boolean) => void }

export function FlowsProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [snack, setSnack] = useState<Snack | null>(null)
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [undoing, setUndoing] = useState(false)
  const counter = useRef(0)

  // D49: production steps are tasks on the Brewery board (and the Task list panel), so those follow too.
  const refresh = useCallback(
    () => Promise.all([qc.invalidateQueries({ queryKey: SCHEDULE_KEY }), qc.invalidateQueries({ queryKey: [BOARD_QUERY_KEY] })]),
    [qc],
  )

  const show = useCallback((snack: Omit<Snack, 'key'>) => {
    counter.current += 1
    setSnack({ ...snack, key: counter.current })
  }, [])

  // D56 §3.7 B: whether a dialog is open while the snackbar shows (it stays
  // up over one, and hides as before once the dialog closes).
  const [overDialog, setOverDialog] = useState(false)
  useEffect(() => {
    if (!snack) return
    setOverDialog(dialogOpen())
    const watch = new MutationObserver(() => setOverDialog(dialogOpen()))
    watch.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['role'] })
    return () => watch.disconnect()
  }, [snack])

  // D56 lead decisions (QA 4 with 4950 C): over a dialog the snackbar sits at
  // the bottom, and the dialog gets that much room below it, so its buttons
  // stay clear and clickable. `room` is the snackbar's top from the bottom.
  const [snackEl, setSnackEl] = useState<HTMLDivElement | null>(null)
  const [room, setRoom] = useState(0)
  useEffect(() => {
    if (!snackEl || !overDialog) return setRoom(0)
    const measure = () => setRoom(Math.ceil(window.innerHeight - snackEl.getBoundingClientRect().top) + 8)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(snackEl)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [snackEl, overDialog])

  // D49 QA 4: it goes when its Undo does (a hovered snackbar's timer stops,
  // so it could outlive the token).
  useEffect(() => {
    if (!snack?.token) return
    const key = snack.key
    const t = setTimeout(() => setSnack((s) => (s?.key === key ? null : s)), Math.max(snack.expiresAt - Date.now(), 0))
    return () => clearTimeout(t)
  }, [snack])

  // An empty message (a cancelled staff-code dialog) shows nothing.
  const notify = useCallback(
    (message: string, token: string | null = null) => {
      if (message) show({ message, token, expiresAt: Date.now() + UNDO_TTL_MS })
    },
    [show],
  )

  const write = useCallback(
    async <T,>(call: (a: CodedApi) => Promise<AxiosResponse>, message: string | ((data: T) => string)): Promise<Result<T>> => {
      try {
        const res = await coded(call)
        const data = (res.data?.data ?? {}) as T
        const renumbered = ((data as { renumbered?: Renumber[] }).renumbered ?? []) as Renumber[]
        const text = typeof message === 'function' ? message(data) : message
        notify([text, renumberText(renumbered)].filter(Boolean).join(' '), res.data?.undo_token ?? null)
        await refresh()
        return { ok: true, data }
      } catch (err) {
        return failure(err)
      }
    },
    [notify, refresh],
  )

  const askMove = (preview: MovePreview, title: string, retestOn: string | null = null) =>
    new Promise<Answer | null>((resolve) => setPrompt({ kind: 'move', preview, title, retestOn, resolve }))

  const askSchedule = (label: string) => new Promise<boolean>((resolve) => setPrompt({ kind: 'schedule', label, resolve }))

  const askNumber = (label: string, value: string, suggestion: string, error: string | null = null) =>
    new Promise<string | null>((resolve) => setPrompt({ kind: 'number', label, value, error, suggestion, resolve }))

  const askResult = (name: string, question: ResultQuestion, failOnly = false) =>
    new Promise<Outcome | null>((resolve) => setPrompt({ kind: 'result', name, question, failOnly, resolve }))

  const askConfirm = (title: string, message: string, confirmLabel: string) =>
    new Promise<boolean>((resolve) => setPrompt({ kind: 'confirm', title, message, confirmLabel, resolve }))

  const moveSteps = useCallback(
    async (ids: number[], days: number): Promise<Result | null> => {
      let pre: MovePreview
      try {
        pre = (await coded((a) => a.post<{ data: { preview: MovePreview } }>(prodPath('steps', 'move'), { ids, days, preview: true }))).data.data.preview
      } catch (err) {
        const f = failure(err)
        if (f.code === 'cancelled') return null
        notify(f.error)
        return f
      }
      const first = pre.moved[0]
      const title = pre.moved.length === 1 ? `${first.name} moved ${daysWord(days)}` : `${plural(pre.moved.length, 'step')} moved ${daysWord(days)}`
      let answer: Answer | null | undefined
      if (pre.following.length) {
        answer = await askMove(pre, title)
        if (!answer) return null
      }
      const r = await write<{ out_of_order?: unknown[] }>(
        (a) => a.post(prodPath('steps', 'move'), { ids, days, answer }),
        () => {
          const preBrew = (pre.pre_brew?.[answer ?? 'move_only'] ?? []).map((s) => s.name)
          const withParts = [
            answer === 'move_all' && plural(pre.following.length, 'following step'),
            carriedText(pre),
            preBrew.length > 0 && andList(preBrew),
          ].filter(Boolean)
          return withParts.length ? `${title}, with ${andList(withParts as string[])}.` : `${title}.`
        },
      )
      if (!r.ok) notify(r.error)
      return r
    },
    [write, notify],
  )

  const checkOff = useCallback(
    async (step: StepRef, doneOn: string, batchLabel: string | null): Promise<Result | null> => {
      const path = prodPath('steps', step.id, 'complete')
      let pre: CompletePreview
      const preview = async () =>
        (await coded((a) => a.post<{ data: { preview: CompletePreview } }>(path, { done_on: doneOn, preview: true }))).data.data.preview
      try {
        pre = await preview()
      } catch (err) {
        const f = failure(err)
        if (f.code === 'cancelled') return null
        // D49 §3.12b (P134): a pencilled batch is scheduled first, then the check-off goes on.
        if (f.code !== 'schedule_first' || step.batch_id == null) return f
        if (!(await askSchedule(batchLabel ?? 'This batch'))) return null
        const s = await write<{ batches: { id: number; label: string }[] }>(
          (a) => a.post(prodPath('batches', step.batch_id!, 'schedule')),
          (d) => `${d.batches.find((b) => b.id === step.batch_id)?.label ?? 'The batch'} is scheduled.`,
        )
        if (!s.ok) return s
        batchLabel = s.data.batches.find((b) => b.id === step.batch_id)?.label ?? batchLabel
        try {
          pre = await preview()
        } catch (again) {
          return failure(again)
        }
      }
      // D56 §3.2: Pass / Fail first, and on a Fail, Retest or Continue.
      let outcome: Outcome | null = null
      const question = resultQuestion(pre)
      if (question) {
        outcome = await askResult(step.name, question)
        if (!outcome) return null
      }
      let retestOn: string | null = null
      if (needsRepreview(outcome)) {
        // The retest moves the steps after the test: one move prompt for it (and any lateness).
        try {
          const again = (
            await coded((a) => a.post<{ data: { preview: CompletePreview } }>(path, { done_on: doneOn, preview: true, ...outcomeBody(outcome) }))
          ).data.data.preview
          pre = { ...pre, move: again.move }
          retestOn = again.retest_on ?? null
        } catch (err) {
          const f = failure(err)
          return f.code === 'cancelled' ? null : f
        }
      }
      let number: string | undefined
      if (pre.needs_batch_number) {
        const n = await askNumber(`${step.name} for ${batchLabel ?? 'this batch'}`, pre.next_batch_number ?? '', pre.next_batch_number ?? '')
        if (n == null) return null
        number = n
      }
      let answer: Answer | undefined
      let move = pre.move
      if (needsMovePrompt(pre.move)) {
        const off = pre.move!.days
        const title = retestOn ? `${step.name} failed · retest ${dayLabel(retestOn)}` : `${step.name} done ${plural(Math.abs(off), 'day')} ${off > 0 ? 'late' : 'early'}`
        const a = await askMove(pre.move!, title, retestOn)
        if (!a) return null
        answer = a
      }
      // "FDH done · 8 following steps moved 2 days later" when it moved them.
      // A Split done late or early names the parts it carries (DEV QA Z2):
      // "Split - Transfer done, 2 days late. … P6.1 and … P6.2 moved with it".
      const doneText = () => {
        const following = answer === 'move_all' && move?.following.length ? plural(move.following.length, 'following step') : null
        const parts = move ? carriedLabels(move) : []
        if (move && parts.length) {
          const off = move.days
          const moved = following ? [...parts, following] : parts
          return `${step.name} done, ${plural(Math.abs(off), 'day')} ${off > 0 ? 'late' : 'early'}. ${andList(moved)} moved with it`
        }
        const result = outcome ? ` · ${outcomeWords(outcome, retestOn)}` : ''
        return following ? `${step.name} done${result} · ${following} moved ${daysWord(move!.days)}` : `${step.name} done${result}`
      }
      for (;;) {
        const r = await write<Record<string, unknown>>(
          (a) => a.post(path, { done_on: doneOn, batch_number: number, answer, ...outcomeBody(outcome) }),
          () => (number ? `${doneText()}. ${batchLabel?.replace(/ P\d+$/, '') ?? 'The batch'} is #${plainBatchNumber(number)}.` : `${doneText()}.`),
        )
        if (r.ok) return r
        if (number !== undefined && r.code?.startsWith('batch_number')) {
          const n = await askNumber(`${step.name} for ${batchLabel ?? 'this batch'}`, number, pre.next_batch_number ?? '', r.error)
          if (n == null) return null
          number = n
          continue
        }
        if (r.code === 'answer_required' && r.body?.preview) {
          move = r.body.preview as MovePreview
          const a = await askMove(move, `${step.name} done on ${dayLabel(doneOn)}`)
          if (!a) return null
          answer = a
          continue
        }
        return r
      }
    },
    [write],
  )

  // D56 decision 8: a failed test's retest goes with it, so that's asked first.
  const uncheck = useCallback(
    async (step: StepRef, retestOn: string | null = null): Promise<Result | null> => {
      if (retestOn && !(await askConfirm(`Mark ${step.name} not done`, `Its retest on ${dayLabel(retestOn)} is removed, and the steps after it go back to their dates.`, 'Mark not done')))
        return null
      return write<{ message?: string | null }>((a) => a.post(prodPath('steps', step.id, 'uncomplete')), (d) => d.message ?? `${step.name} is not done.`)
    },
    [write],
  )

  // D56 §3.2 Change: Fail → Pass removes the retest (decision 17); Pass → Fail asks the Fail question.
  const changeResult = useCallback(
    async (step: StepRef, to: 'pass' | 'fail'): Promise<Result | null> => {
      const path = prodPath('steps', step.id, 'result')
      if (to === 'pass') return write<Record<string, unknown>>((a) => a.patch(path, { result: 'pass' }), `${step.name}: Pass.`)
      const preview = async (body: Record<string, unknown>) =>
        (await coded((a) => a.patch<{ data: { preview: CompletePreview } }>(path, { ...body, preview: true }))).data.data.preview
      let pre: CompletePreview
      try {
        pre = await preview({ result: 'fail' })
      } catch (err) {
        const f = failure(err)
        return f.code === 'cancelled' ? null : f
      }
      const outcome = await askResult(step.name, failQuestion(pre), true)
      if (!outcome) return null
      let retestOn: string | null = null
      if (needsRepreview(outcome)) {
        try {
          pre = await preview(outcomeBody(outcome))
          retestOn = pre.retest_on ?? null
        } catch (err) {
          const f = failure(err)
          return f.code === 'cancelled' ? null : f
        }
      }
      let answer: Answer | undefined
      let move = pre.move
      for (;;) {
        if (!answer && needsMovePrompt(move)) {
          const a = await askMove(move!, `${step.name} failed${retestOn ? ` · retest ${dayLabel(retestOn)}` : ''}`, retestOn)
          if (!a) return null
          answer = a
        }
        const r = await write<Record<string, unknown>>((a) => a.patch(path, { ...outcomeBody(outcome), answer }), `${step.name}: ${outcomeWords(outcome, retestOn)}.`)
        if (r.ok || r.code !== 'answer_required' || !r.body?.preview || answer) return r
        move = r.body.preview as MovePreview
      }
    },
    [write],
  )

  const undo = async ({ token, expiresAt }: { token: string; expiresAt: number }) => {
    setUndoing(true)
    try {
      // D50: on the device, the person whose change it was (their code; another's is refused).
      await coded((a) => a.post(prodPath('undo', token)))
      notify('Undone.')
      await refresh()
    } catch (err) {
      // A cancelled staff-code dialog: the Undo is still there to press.
      if (isActingCancelled(err)) {
        show({ message: 'Not undone.', token, expiresAt })
        return
      }
      // D49 BB1: a refused Undo keeps its button while the token lasts, so
      // it works once the blocker is cleared; only a token that's gone drops it.
      const code = failure(err).code
      const gone = code === 'undo_expired' || code === 'not_found' || expiresAt <= Date.now()
      show({ message: prodError(err), token: gone ? null : token, expiresAt, refused: !gone })
      // A refused Undo ("Something changed since."): show what the server has now (DEV QA X5).
      await refresh()
    } finally {
      setUndoing(false)
    }
  }

  // D56 §3.7 A: Ctrl/Cmd+Z runs the Undo the snackbar offers, dialogs open or not.
  const undoRef = useRef(undo)
  undoRef.current = undo
  useEffect(() => {
    if (!snack?.token || snack.refused) return
    const { token, expiresAt } = snack
    const onKey = (e: KeyboardEvent) => {
      if (!isUndoShortcut(e) || undoing || expiresAt <= Date.now()) return
      e.preventDefault()
      setSnack(null)
      undoRef.current({ token: token!, expiresAt })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [snack, undoing])

  const close = (value: null) => {
    if (!prompt) return
    if (prompt.kind === 'move') prompt.resolve(value)
    else if (prompt.kind === 'schedule' || prompt.kind === 'confirm') prompt.resolve(false)
    else prompt.resolve(value)
    setPrompt(null)
  }

  return (
    <FlowsContext.Provider
      value={{
        write,
        moveSteps,
        checkOff,
        uncheck,
        changeResult,
        notify,
        saved: async (message, token) => {
          notify(message, token)
          await refresh()
        },
      }}
    >
      {children}
      {prompt?.kind === 'move' && (
        <MovePrompt
          preview={prompt.preview}
          title={prompt.title}
          retestOn={prompt.retestOn}
          onCancel={() => close(null)}
          onApply={(a) => {
            prompt.resolve(a)
            setPrompt(null)
          }}
        />
      )}
      {prompt?.kind === 'schedule' && (
        <SchedulePrompt
          label={prompt.label}
          onCancel={() => close(null)}
          onSchedule={() => {
            prompt.resolve(true)
            setPrompt(null)
          }}
        />
      )}
      {prompt?.kind === 'number' && (
        <NumberPrompt
          key={`${prompt.value}-${prompt.error}`}
          label={prompt.label}
          initial={prompt.value}
          suggestion={prompt.suggestion}
          error={prompt.error}
          onCancel={() => close(null)}
          onSave={(n) => {
            prompt.resolve(n)
            setPrompt(null)
          }}
        />
      )}
      {prompt?.kind === 'result' && (
        <ResultPrompt
          name={prompt.name}
          question={prompt.question}
          failOnly={prompt.failOnly}
          onCancel={() => close(null)}
          onApply={(o) => {
            prompt.resolve(o)
            setPrompt(null)
          }}
        />
      )}
      {prompt?.kind === 'confirm' && (
        <ConfirmDialog
          open
          title={prompt.title}
          message={prompt.message}
          confirmLabel={prompt.confirmLabel}
          confirmColor="primary"
          testId="flows-confirm"
          onClose={() => close(null)}
          onConfirm={() => {
            prompt.resolve(true)
            setPrompt(null)
          }}
        />
      )}
      {/* D49 QA 4: in a portal, beside the app root (an open dialog hides that from screen readers). */}
      {snack && room > 0 && <GlobalStyles styles={{ '.MuiDialog-container': { paddingBottom: room, boxSizing: 'border-box' } }} />}
      <Portal>
        <Snackbar
          ref={setSnackEl}
          key={snack?.key}
          open={!!snack}
          autoHideDuration={snack ? snackAutoHide(snack, overDialog, Date.now()) : null}
          // D56 §3.7 C: at the bottom, clear of a dialog's title (D49 QA 4 had it at
          // the top); a dialog under it makes room for it (above).
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          onClose={(_, reason) => reason !== 'clickaway' && setSnack(null)}
          message={
            <>
              <span data-testid="gantt-snack-text">{snack?.message}</span>
              {snack?.token && !snack.refused && HINT && (
                <Box component="span" sx={{ opacity: 0.7 }} data-testid="gantt-snack-hint">
                  {` · ${HINT} to undo`}
                </Box>
              )}
            </>
          }
          data-testid="gantt-snack"
          action={
            snack?.token ? (
              <Button
                color="secondary"
                size="small"
                disabled={undoing}
                onClick={() => {
                  const { token, expiresAt } = snack
                  setSnack(null)
                  undo({ token: token!, expiresAt })
                }}
                data-testid="gantt-undo"
              >
                Undo
              </Button>
            ) : undefined
          }
        />
      </Portal>
    </FlowsContext.Provider>
  )
}

/**
 * §3.7 the move prompt: one question. Move all following steps (listed with
 * their new dates) or only the moved ones; the default carries a pill.
 */
function MovePrompt({
  preview,
  title,
  retestOn,
  onCancel,
  onApply,
}: {
  preview: MovePreview
  title: string
  /** D56: after a Fail with a retest, the words say what happens to the following steps. */
  retestOn: string | null
  onCancel: () => void
  onApply: (a: Answer) => void
}) {
  // D56: an answer the API would refuse can't be picked; the prompt says why.
  const refused = (a: Answer) => preview.refused?.[a] ?? null
  const preferred = preview.default_answer ?? 'move_all'
  const [answer, setAnswer] = useState<Answer>(refused(preferred) ? (preferred === 'move_all' ? 'move_only' : 'move_all') : preferred)
  const preBrew = preview.pre_brew?.[answer] ?? []
  const why = (a: Answer) =>
    refused(a) && (
      <Typography variant="body2" color="warning.main" sx={{ pl: 4, mb: 1 }} data-testid={`move-refused-${a}`}>
        Not possible: {refused(a)!.message}
      </Typography>
    )
  usePhoneBackCloses(true, onCancel)
  const words = moveWords(preview, retestOn)
  const pill = (a: Answer) =>
    preview.default_answer === a ? <Chip label="Default" size="small" color="primary" variant="outlined" sx={{ ml: 1, height: 20 }} data-testid={`move-default-${a}`} /> : null
  const renum = renumberText(preview.renumbered[answer] ?? [])
  const carried = carriedText(preview)
  // Steps in several batches: say how many, and list what follows under each batch (QA minor 10).
  const batches = preview.batches ?? []
  const many = batches.length > 1
  // One split batch and its parts only: "Galactic P5 and its 2 parts" (Matt, fix cycle 5).
  const root = batches.find((b) => !b.split_parent_id)
  const family = many && !!root && batches.every((b) => b === root || b.split_parent_id === root.id)
  const line = (s: MovePreview['following'][number]) => (
    <li key={s.id}>
      {s.name} → {dayLabel(s.new_due_on)}
    </li>
  )

  return (
    <Dialog open onClose={onCancel} maxWidth="sm" fullWidth data-testid="move-prompt">
      <DialogTitle>
        {title}
        {many ? (
          <Typography variant="body2" color="text.secondary" data-testid="move-prompt-sub">
            {family ? `${root!.label} and its ${plural(batches.length - 1, 'part')}` : `${batches.length} batches`} · {title}
          </Typography>
        ) : (
          preview.batch_label && (
            <Typography variant="body2" color="text.secondary" data-testid="move-prompt-sub">
              {preview.batch_label} · {words.now}
            </Typography>
          )
        )}
      </DialogTitle>
      <DialogContent>
        {carried && (
          <Typography variant="body2" sx={{ mb: 1 }} data-testid="move-carried">
            {carried} move{carried.includes(' and ') ? '' : 's'} with it either way.
          </Typography>
        )}
        {preBrew.length > 0 && (
          <Typography variant="body2" sx={{ mb: 1 }} data-testid="move-pre-brew">
            {andList(preBrew.map((s) => `${s.name} (→ ${dayLabel(s.new_due_on)})`))} move{preBrew.length === 1 ? 's' : ''} with brew day either way.
          </Typography>
        )}
        <RadioGroup value={answer} onChange={(e) => setAnswer(e.target.value as Answer)}>
          <FormControlLabel
            value="move_all"
            disabled={!!refused('move_all')}
            control={<Radio slotProps={{ input: { 'data-testid': 'move-all' } as object }} />}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                {words.all}
                {pill('move_all')}
              </Box>
            }
          />
          <Box component="ul" sx={{ m: 0, mb: 1.5, pl: 6, color: 'text.secondary', fontSize: 14 }} data-testid="move-following">
            {many
              ? batches
                  .filter((b) => preview.following.some((s) => s.batch_id === b.id))
                  .map((b) => (
                    <li key={`b-${b.id}`} data-testid={`move-following-batch-${b.id}`}>
                      <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
                        {b.label}
                      </Box>
                      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                        {preview.following.filter((s) => s.batch_id === b.id).map(line)}
                      </Box>
                    </li>
                  ))
              : preview.following.map(line)}
          </Box>
          {why('move_all')}
          <FormControlLabel
            value="move_only"
            disabled={!!refused('move_only')}
            control={<Radio slotProps={{ input: { 'data-testid': 'move-only' } as object }} />}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                {words.only}
                {pill('move_only')}
              </Box>
            }
          />
          {words.onlyNote && (
            <Typography variant="body2" color="text.secondary" sx={{ pl: 4 }}>
              {words.onlyNote}
            </Typography>
          )}
          {why('move_only')}
          {preview.out_of_order.move_only.length > 0 && (
            <Typography variant="body2" color="warning.main" sx={{ pl: 4, mt: 0.5 }} data-testid="move-only-warning">
              Some of them would then come before the step they follow. They’ll be flagged.
            </Typography>
          )}
        </RadioGroup>
        {renum && (
          <Typography variant="body2" sx={{ mt: 1.5 }} data-testid="move-renumber">
            {renum}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} data-testid="move-cancel">
          Undo
        </Button>
        <Button variant="contained" onClick={() => onApply(answer)} data-testid="move-apply">
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** §3.5 checking off a planned batch's brew day asks for its number. */
/** D49 §3.12b (P134): "Schedule this batch first." with a Schedule button. */
function SchedulePrompt({ label, onCancel, onSchedule }: { label: string; onCancel: () => void; onSchedule: () => void }) {
  usePhoneBackCloses(true, onCancel)
  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth data-testid="schedule-prompt">
      <DialogTitle>Schedule this batch first.</DialogTitle>
      <DialogContent>
        <Typography variant="body2">{label} is pencilled in. Schedule it to check off its steps; it gets a P-number and its steps can go on the task list.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} data-testid="schedule-prompt-cancel">
          Cancel
        </Button>
        <Button variant="contained" autoFocus onClick={onSchedule} data-testid="schedule-prompt-ok">
          Schedule
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function NumberPrompt({
  label,
  initial,
  suggestion,
  error,
  onCancel,
  onSave,
}: {
  label: string
  initial: string
  suggestion: string
  error: string | null
  onCancel: () => void
  onSave: (n: string) => void
}) {
  const [value, setValue] = useState(initial)
  usePhoneBackCloses(true, onCancel)
  const trimmed = plainBatchNumber(value)
  const plain = /^\d+$/.test(trimmed)
  const last = Number(suggestion) - 1
  const local = !trimmed ? 'Enter the batch number.' : trimmed.length > 20 ? 'A batch number is 1 to 20 characters.' : null
  const [busy, setBusy] = useState(false)

  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth data-testid="number-prompt">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (local) return
          setBusy(true)
          onSave(trimmed)
        }}
      >
        <DialogTitle>{label}</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <TextField
            autoFocus
            fullWidth
            label="Batch number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={!!error && value === initial}
            helperText={
              (value === initial ? error : null) ??
              (trimmed && !plain && last > 0 ? `Not a plain number; the next suggestion still counts from #${last}.` : suggestion ? `Suggested: ${suggestion}` : undefined)
            }
            slotProps={{ htmlInput: { maxLength: 20, 'data-testid': 'number-input' }, formHelperText: { 'data-testid': 'number-helper' } as object }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel} data-testid="number-cancel">
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={!!local || busy} data-testid="number-save">
            {busy ? <CircularProgress size={20} /> : 'Check off'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

/**
 * D56 §3.2: Pass or Fail, and on a Fail, "Retest in [N] days" or "Continue
 * as planned". Decision 15: where a retest can't go, only Continue, with why.
 * `failOnly`: Change from Pass to Fail asks just the Fail question.
 */
function ResultPrompt({
  name,
  question,
  failOnly,
  onCancel,
  onApply,
}: {
  name: string
  question: ResultQuestion
  failOnly: boolean
  onCancel: () => void
  onApply: (o: Outcome) => void
}) {
  const [result, setResult] = useState<'pass' | 'fail' | ''>(failOnly ? 'fail' : '')
  const [action, setAction] = useState<'retest' | 'continue' | ''>(question.retestAllowed ? '' : 'continue')
  const [days, setDays] = useState(String(question.days))
  usePhoneBackCloses(true, onCancel)
  const n = retestDays(days)
  const outcome: Outcome | null =
    result === 'pass'
      ? { result: 'pass' }
      : result === 'fail' && action === 'continue'
        ? { result: 'fail', action: 'continue' }
        : result === 'fail' && action === 'retest' && n != null
          ? { result: 'fail', action: 'retest', days: n }
          : null

  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth data-testid="result-prompt">
      <DialogTitle>{failOnly ? `${name} failed` : `${name}: Pass or Fail?`}</DialogTitle>
      <DialogContent>
        {!failOnly && (
          <RadioGroup row value={result} onChange={(e) => setResult(e.target.value as 'pass' | 'fail')}>
            <FormControlLabel value="pass" control={<Radio slotProps={{ input: { 'data-testid': 'result-pass' } as object }} />} label="Pass" />
            <FormControlLabel value="fail" control={<Radio slotProps={{ input: { 'data-testid': 'result-fail' } as object }} />} label="Fail" />
          </RadioGroup>
        )}
        {result === 'fail' && (
          <Box sx={{ mt: failOnly ? 0 : 1 }}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              What next?
            </Typography>
            <RadioGroup value={action} onChange={(e) => setAction(e.target.value as 'retest' | 'continue')}>
              {question.retestAllowed && (
                <FormControlLabel
                  value="retest"
                  control={<Radio slotProps={{ input: { 'data-testid': 'result-retest' } as object }} />}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      Retest in
                      <TextField
                        size="small"
                        type="number"
                        value={days}
                        onChange={(e) => {
                          setDays(e.target.value)
                          setAction('retest')
                        }}
                        error={action === 'retest' && n == null}
                        sx={{ width: 72 }}
                        slotProps={{ htmlInput: { min: RETEST_MIN, max: RETEST_MAX, 'aria-label': 'Retest in days', 'data-testid': 'result-retest-days' } }}
                      />
                      days
                    </Box>
                  }
                />
              )}
              {question.retestAllowed && action === 'retest' && n == null && (
                <Typography variant="body2" color="error.main" sx={{ pl: 4 }} data-testid="result-retest-days-error">
                  Retest in {RETEST_MIN} to {RETEST_MAX} days.
                </Typography>
              )}
              <FormControlLabel value="continue" control={<Radio slotProps={{ input: { 'data-testid': 'result-continue' } as object }} />} label="Continue as planned" />
            </RadioGroup>
            {!question.retestAllowed && (
              <Typography variant="body2" color="text.secondary" sx={{ pl: 4 }} data-testid="result-no-retest">
                A retest can only follow a plain step or a Set temp step.
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} data-testid="result-cancel">
          Cancel
        </Button>
        <Button variant="contained" disabled={!outcome} onClick={() => outcome && onApply(outcome)} data-testid="result-apply">
          {failOnly ? 'Save' : 'Check off'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
