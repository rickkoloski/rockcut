import { useEffect, useState } from 'react'
import { Alert, Button, Checkbox, CircularProgress, FormControlLabel, MenuItem, TextField } from '@mui/material'
import FormDialog from '../../../components/FormDialog'
import { useApiQuery } from '../../../hooks/useApiQuery'
import api from '../../../lib/api'
import { taskError, taskGone } from '../../../lib/breweryTasks'
import { defaultRule, reseed, ruleFromTaskSeries, ruleProblem, sameRule, taskRepeatParams, type TaskRule } from '../../../lib/repeat'
import type { RosterEntry, TaskCardData, TaskSeriesData } from '../../../lib/types'
import RepeatFields from './RepeatFields'
import { RemoveLaterDialog, ScopeDialog, type Changed, type SeriesScope } from './SeriesDialogs'

const TITLE_MAX = 200
const NOTES_MAX = 2000

export type TaskDialogMode =
  | { kind: 'add'; dueOn: string | null }
  /** `series`: Edit series… (D39), already set to "This and all following". */
  | { kind: 'edit'; card: TaskCardData; focusNotes?: boolean; series?: boolean }

interface Props {
  mode: TaskDialogMode
  /** Brewery members, in roster order. */
  brewers: RosterEntry[]
  today: string
  onClose: () => void
  onSaved: () => void
  /** The board is out of date (the task is gone: deleted, or removed with its series): refetch it, keep the dialog. */
  onStale: () => void
  onDelete: (card: TaskCardData) => void
  /** This task's History (managers and owners). */
  onHistory?: (card: TaskCardData) => void
}

/**
 * D38 §3.8 add/edit dialog: title, notes, assignee and Day (or No day,
 * Future). Mount it with a `key` per task so it starts from that task. Save
 * sends only the fields that changed; with none, it just closes.
 *
 * D39 §3.10: a Repeat field on add (disabled with No day, S67) and on an
 * occurrence, whose rule loads from `GET …/series` (Never isn't offered).
 * Saving an occurrence asks "Just this one" / "This and all following"
 * (S69) unless it's Edit series…; a changed rule always goes as "following",
 * after the Decision 2 confirm when it removes later ones; a day-only change
 * never asks (it's this one).
 */
export default function TaskDialog({ mode, brewers, today, onClose, onSaved, onStale, onDelete, onHistory }: Props) {
  const card = mode.kind === 'edit' ? mode.card : null
  const inSeries = !!card?.series_id
  const presetFollowing = mode.kind === 'edit' && !!mode.series
  const [title, setTitle] = useState(card?.title ?? '')
  const [notes, setNotes] = useState(card?.notes ?? '')
  const [assigneeId, setAssigneeId] = useState<number | ''>(card?.assignee_id ?? '')
  const startDay = card ? card.due_on : mode.kind === 'add' ? mode.dueOn : null
  const [noDay, setNoDay] = useState(startDay === null)
  const [day, setDay] = useState(startDay ?? today)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Repeat: on add it follows the Day until the person changes it. On an
  // occurrence it's the series' rule, anchored on this occurrence's date.
  const [rule, setRule] = useState<TaskRule>(() => defaultRule(startDay ?? today))
  const [ruleTouched, setRuleTouched] = useState(false)
  const { data: series, isError: seriesFailed, error: seriesError } = useApiQuery<TaskSeriesData>(
    ['brewery-task-series', card?.id],
    `/api/brewery/tasks/${card?.id}/series`,
    undefined,
    { enabled: inSeries, staleTime: 0, gcTime: 0 },
  )
  const [original, setOriginal] = useState<TaskRule | null>(null)
  useEffect(() => {
    if (!series || original || !card?.series_date) return
    const loaded = { ...ruleFromTaskSeries(series), startDate: card.series_date }
    setOriginal(loaded)
    setRule(loaded)
  }, [series, original, card?.series_date])

  // Asking before a save or a delete on an occurrence.
  const [asking, setAsking] = useState<{ body: Record<string, unknown> } | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<{ body: Record<string, unknown> } | null>(null)

  // A finished task shown on the day it was done can't change day (Mark not
  // done first), and no finished task goes to Future.
  const dayLocked = !!card?.locked
  const futureLocked = !!card?.done
  // Someone who left the Brewery stays selectable on a task that still names them.
  const options =
    card?.assignee_id && !brewers.some((b) => b.id === card.assignee_id)
      ? [...brewers, { id: card.assignee_id, name: card.assignee_name ?? 'Unknown', departments: [] }]
      : brewers

  const changeDay = (value: string) => {
    setDay(value)
    if (!card && value) setRule((r) => (ruleTouched ? { ...r, startDate: value } : reseed(r, value)))
  }

  const changeRule = (next: TaskRule) => {
    setRule(next)
    setRuleTouched(true)
  }

  const send = async (body: Record<string, unknown>, scope?: SeriesScope, changed?: Changed) => {
    setAsking(null)
    setConfirmRemove(null)
    setSaving(true)
    try {
      if (card) await api.patch(`/api/brewery/tasks/${card.id}`, { ...body, ...(scope ? { scope } : {}), ...(changed ? { changed } : {}) })
      else await api.post('/api/brewery/tasks', body)
      onSaved()
    } catch (err) {
      // Someone deleted it meanwhile: "This task was deleted", and the board catches up.
      if (taskGone(err)) onStale()
      setError(taskError(err))
    } finally {
      setSaving(false)
    }
  }

  const submit = async () => {
    const trimmed = title.trim()
    if (!trimmed) return setTitleError('Enter a title')
    if (trimmed.length > TITLE_MAX) return setTitleError(`Up to ${TITLE_MAX} characters`)
    if (notes.length > NOTES_MAX) return setError(`Notes: up to ${NOTES_MAX} characters`)
    if (!noDay && !day) return setError('Pick a day, or No day (Future)')
    const repeating = !noDay && rule.frequency !== 'never'
    const problem = repeating ? ruleProblem(rule) : null
    if (problem) return setError(problem)
    setTitleError(null)
    setError(null)
    const dueOn = noDay ? null : day
    const body: Record<string, unknown> = { title: trimmed, notes: notes.trim() || null, assignee_id: assigneeId === '' ? null : assigneeId }

    if (!card) return send({ ...body, due_on: dueOn, ...(repeating ? taskRepeatParams(rule) : {}) })

    // Only what the person changed from the card the dialog opened with, so
    // saving can't undo someone else's edit made meanwhile (G1).
    const content: Record<string, unknown> = {}
    if (body.title !== card.title) content.title = body.title
    if (body.notes !== (card.notes?.trim() || null)) content.notes = body.notes
    if (body.assignee_id !== (card.assignee_id ?? null)) content.assignee_id = body.assignee_id
    const dayChange: Record<string, unknown> = !dayLocked && dueOn !== card.due_on ? { due_on: dueOn } : {}

    if (!inSeries) {
      const changed = { ...content, ...dayChange }
      if (Object.keys(changed).length === 0) return onClose()
      return send(changed)
    }

    // An occurrence. A new rule applies from here on, and replaces the later
    // open ones: confirm first when there are any (Decision 2).
    if (repeating && original && !sameRule(rule, original)) {
      const full = { ...content, ...dayChange, ...taskRepeatParams(rule) }
      if (series && series.later_open + series.later_changed > 0) return setConfirmRemove({ body: full })
      return send(full, 'following')
    }
    if (Object.keys(content).length > 0) {
      const full = { ...content, ...dayChange }
      if (presetFollowing) return send(full, 'following')
      return setAsking({ body: full })
    }
    // The day alone is always just this one, and never asks.
    if (Object.keys(dayChange).length > 0) return send(dayChange)
    onClose()
  }

  const dialogTitle = !card ? 'Add a task' : presetFollowing ? 'Edit series' : 'Edit task'

  return (
    <>
      <FormDialog
        open
        onClose={onClose}
        title={dialogTitle}
        onSubmit={submit}
        loading={saving}
        error={error}
        testId="task-dialog"
        secondaryAction={
          card && (
            <>
              <Button color="error" onClick={() => onDelete(card)} disabled={saving} data-testid="task-dialog-delete">
                Delete
              </Button>
              {onHistory && (
                <Button onClick={() => onHistory(card)} disabled={saving} data-testid="task-dialog-history">
                  History
                </Button>
              )}
            </>
          )
        }
      >
        {presetFollowing && (
          <Alert severity="info" sx={{ py: 0 }} data-testid="task-dialog-following">
            Changes apply to this one and every later open one that wasn't changed on its own.
          </Alert>
        )}
        {card?.series_exception && (
          <Alert severity="info" sx={{ py: 0 }} data-testid="task-dialog-exception">
            This one was changed on its own.
          </Alert>
        )}
        <TextField
          label="Title *"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            if (titleError) setTitleError(null)
          }}
          autoFocus={!(mode.kind === 'edit' && mode.focusNotes)}
          error={!!titleError}
          helperText={titleError ?? `${title.trim().length}/${TITLE_MAX}`}
          slotProps={{ htmlInput: { 'data-testid': 'task-title-input' } }}
        />
        <TextField
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          multiline
          minRows={2}
          autoFocus={mode.kind === 'edit' && mode.focusNotes}
          helperText={notes.length > NOTES_MAX * 0.9 ? `${notes.length}/${NOTES_MAX}` : undefined}
          slotProps={{ htmlInput: { 'data-testid': 'task-notes-input' } }}
        />
        <TextField
          select
          label="Assign to"
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value === '' ? '' : Number(e.target.value))}
          slotProps={{ select: { displayEmpty: true, SelectDisplayProps: { 'data-testid': 'task-assignee-select' } as object }, inputLabel: { shrink: true } }}
        >
          <MenuItem value="" data-testid="task-assignee-anyone">
            Anyone
          </MenuItem>
          {options.map((b) => (
            <MenuItem key={b.id} value={b.id} data-testid={`task-assignee-option-${b.id}`}>
              {b.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          type="date"
          label="Day"
          value={noDay ? '' : day}
          onChange={(e) => changeDay(e.target.value)}
          disabled={noDay || dayLocked}
          helperText={dayLocked ? 'Mark not done first to move it' : inSeries ? 'A new day moves just this one' : undefined}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'task-day-input' } }}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={noDay}
              onChange={(e) => setNoDay(e.target.checked)}
              disabled={dayLocked || (futureLocked && !noDay)}
              slotProps={{ input: { 'data-testid': 'task-no-day' } as object }}
            />
          }
          label={inSeries ? 'No day (Future; it stops repeating)' : 'No day (Future)'}
        />
        {(!card || inSeries) &&
          (inSeries && !original ? (
            seriesFailed ? (
              <Alert severity="error">{taskError(seriesError)}</Alert>
            ) : (
              <CircularProgress size={20} aria-label="Loading the repeat" />
            )
          ) : (
            <RepeatFields
              rule={rule}
              day={card?.series_date ?? (noDay ? today : day)}
              disabled={noDay}
              inSeries={inSeries}
              onChange={changeRule}
            />
          ))}
      </FormDialog>
      {asking && <ScopeDialog action="save" loading={saving} onChoose={(scope) => send(asking.body, scope)} onCancel={() => setAsking(null)} />}
      {confirmRemove && series && (
        <RemoveLaterDialog
          title="Change the repeat"
          laterOpen={series.later_open}
          laterChanged={series.later_changed}
          loading={saving}
          onConfirm={(changed) => send(confirmRemove.body, 'following', changed)}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </>
  )
}
