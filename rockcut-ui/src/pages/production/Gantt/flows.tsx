import { useCallback, useRef, useState, type ReactNode } from 'react'
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
  Radio,
  RadioGroup,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import api from '../../../lib/api'
import { dayLabel } from '../../../lib/gantt'
import { plainBatchNumber, prodError, prodPath, SCHEDULE_KEY, type Answer, type SchedStep } from '../../../lib/production'
import { usePhoneBackCloses } from '../../../hooks/useBackCloses'
import { renumberText, type Renumber } from './scheduleText'
import { FlowsContext } from './flowsContext'

// D47 §3.7: every schedule write goes through here. It refetches the
// schedule, says what happened with Undo for 6 seconds (plan decision 5),
// and runs the prompts a move or check-off needs, from the server's preview
// (decision 4): the brew-day number, then the move prompt.

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
  out_of_order: Record<Answer, { from_name: string; to_name: string }[]>
  renumbered: Record<Answer, Renumber[]>
}

interface CompletePreview {
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
const carriedText = (pre: MovePreview) => {
  const ids = new Set((pre.carried ?? []).map((s) => s.batch_id))
  const labels = (pre.batches ?? []).filter((b) => ids.has(b.id)).map((b) => b.label)
  return labels.length ? andList(labels) : null
}


const bodyOf = (err: unknown) => (err as { response?: { data?: Record<string, unknown>; status?: number } })?.response

function failure(err: unknown): Failure {
  const res = bodyOf(err)
  return { ok: false, error: prodError(err), code: res?.data?.error as string | undefined, body: res?.data }
}

type Prompt =
  | { kind: 'move'; preview: MovePreview; title: string; resolve: (a: Answer | null) => void }
  | { kind: 'number'; label: string; value: string; error: string | null; suggestion: string; resolve: (n: string | null) => void }

export function FlowsProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [snack, setSnack] = useState<{ message: string; token: string | null; key: number } | null>(null)
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [undoing, setUndoing] = useState(false)
  const counter = useRef(0)

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: SCHEDULE_KEY }), [qc])

  const notify = useCallback((message: string, token: string | null = null) => {
    counter.current += 1
    setSnack({ message, token, key: counter.current })
  }, [])

  const write = useCallback(
    async <T,>(call: () => Promise<AxiosResponse>, message: string | ((data: T) => string)): Promise<Result<T>> => {
      try {
        const res = await call()
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

  const askMove = (preview: MovePreview, title: string) =>
    new Promise<Answer | null>((resolve) => setPrompt({ kind: 'move', preview, title, resolve }))

  const askNumber = (label: string, value: string, suggestion: string, error: string | null = null) =>
    new Promise<string | null>((resolve) => setPrompt({ kind: 'number', label, value, error, suggestion, resolve }))

  const moveSteps = useCallback(
    async (ids: number[], days: number): Promise<Result | null> => {
      let pre: MovePreview
      try {
        pre = (await api.post(prodPath('steps', 'move'), { ids, days, preview: true })).data.data.preview
      } catch (err) {
        const f = failure(err)
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
        () => api.post(prodPath('steps', 'move'), { ids, days, answer }),
        () => {
          const withParts = [answer === 'move_all' && plural(pre.following.length, 'following step'), carriedText(pre)].filter(Boolean)
          return withParts.length ? `${title}, with ${andList(withParts as string[])}.` : `${title}.`
        },
      )
      if (!r.ok) notify(r.error)
      return r
    },
    [write, notify],
  )

  const checkOff = useCallback(
    async (step: SchedStep, doneOn: string, batchLabel: string | null): Promise<Result | null> => {
      const path = prodPath('steps', step.id, 'complete')
      let pre: CompletePreview
      try {
        pre = (await api.post(path, { done_on: doneOn, preview: true })).data.data.preview
      } catch (err) {
        return failure(err)
      }
      let number: string | undefined
      if (pre.needs_batch_number) {
        const n = await askNumber(`${step.name} for ${batchLabel ?? 'this batch'}`, pre.next_batch_number ?? '', pre.next_batch_number ?? '')
        if (n == null) return null
        number = n
      }
      let answer: Answer | undefined
      let move = pre.move
      if (pre.move && pre.move.following.length) {
        const off = pre.move.days
        const a = await askMove(pre.move, `${step.name} done ${plural(Math.abs(off), 'day')} ${off > 0 ? 'late' : 'early'}`)
        if (!a) return null
        answer = a
      }
      // "FDH done · 8 following steps moved 2 days later" when it moved them.
      const doneText = () =>
        answer === 'move_all' && move?.following.length
          ? `${step.name} done · ${plural(move.following.length, 'following step')} moved ${daysWord(move.days)}`
          : `${step.name} done`
      for (;;) {
        const r = await write<Record<string, unknown>>(
          () => api.post(path, { done_on: doneOn, batch_number: number, answer }),
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

  const uncheck = useCallback(
    (step: SchedStep) =>
      write<{ message?: string | null }>(() => api.post(prodPath('steps', step.id, 'uncomplete')), (d) => d.message ?? `${step.name} is not done.`),
    [write],
  )

  const undo = async (token: string) => {
    setUndoing(true)
    try {
      await api.post(prodPath('undo', token))
      notify('Undone.')
      await refresh()
    } catch (err) {
      notify(prodError(err))
      // A refused Undo ("Something changed since."): show what the server has now (DEV QA X5).
      await refresh()
    } finally {
      setUndoing(false)
    }
  }

  const close = (value: null) => {
    if (!prompt) return
    if (prompt.kind === 'move') prompt.resolve(value)
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
          onCancel={() => close(null)}
          onApply={(a) => {
            prompt.resolve(a)
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
      <Snackbar
        key={snack?.key}
        open={!!snack}
        autoHideDuration={6000}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        onClose={(_, reason) => reason !== 'clickaway' && setSnack(null)}
        message={<span data-testid="gantt-snack-text">{snack?.message}</span>}
        data-testid="gantt-snack"
        action={
          snack?.token ? (
            <Button
              color="secondary"
              size="small"
              disabled={undoing}
              onClick={() => {
                const t = snack.token!
                setSnack(null)
                undo(t)
              }}
              data-testid="gantt-undo"
            >
              Undo
            </Button>
          ) : undefined
        }
      />
    </FlowsContext.Provider>
  )
}

/**
 * §3.7 the move prompt: one question. Move all following steps (listed with
 * their new dates) or only the moved ones; the default carries a pill.
 */
function MovePrompt({ preview, title, onCancel, onApply }: { preview: MovePreview; title: string; onCancel: () => void; onApply: (a: Answer) => void }) {
  const [answer, setAnswer] = useState<Answer>(preview.default_answer ?? 'move_all')
  usePhoneBackCloses(true, onCancel)
  const days = preview.days
  const first = preview.moved[0]
  const onlyName = preview.moved.length === 1 ? first.name : plural(preview.moved.length, 'step')
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
              {preview.batch_label} · now {dayLabel(first.new_due_on)}
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
        <RadioGroup value={answer} onChange={(e) => setAnswer(e.target.value as Answer)}>
          <FormControlLabel
            value="move_all"
            control={<Radio slotProps={{ input: { 'data-testid': 'move-all' } as object }} />}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                Move all following steps {daysWord(days)}
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
          <FormControlLabel
            value="move_only"
            control={<Radio slotProps={{ input: { 'data-testid': 'move-only' } as object }} />}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                Move only {onlyName}
                {pill('move_only')}
              </Box>
            }
          />
          <Typography variant="body2" color="text.secondary" sx={{ pl: 4 }}>
            The {plural(preview.following.length, 'following step')} keep{preview.following.length === 1 ? 's' : ''} {preview.following.length === 1 ? 'its date' : 'their dates'}.
          </Typography>
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
