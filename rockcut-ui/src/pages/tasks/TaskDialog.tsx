import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Checkbox, CircularProgress, FormControlLabel, MenuItem, TextField } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import { useApiQuery } from '../../hooks/useApiQuery'
import { usePhoneBackCloses } from '../../hooks/useBackCloses'
import { actingRun } from '../../hooks/useActing'
import api from '../../lib/api'
import { isActingCancelled, withCode } from '../../lib/acting'
import { boardPath, taskError, taskGone, taskSaveError } from '../../lib/tasks'
import { defaultRule, endsOnlyChange, reseed, ruleFromTaskSeries, ruleProblem, sameRule, taskRepeatParams, type TaskRule } from '../../lib/repeat'
import type { RosterEntry, SeriesChange, TaskBoardEntry, TaskCardData, TaskSeriesData } from '../../lib/types'
import RepeatFields from './RepeatFields'
import { ExtendDialog, RemoveLaterDialog, ScopeDialog, type Changed, type SeriesScope } from './SeriesDialogs'

const TITLE_MAX = 200
const NOTES_MAX = 2000

export type TaskDialogMode =
  | { kind: 'add'; dueOn: string | null }
  /** `series`: Edit series… (D39), already set to "This and all following". */
  | { kind: 'edit'; card: TaskCardData; focusNotes?: boolean; series?: boolean }

interface Props {
  mode: TaskDialogMode
  /** The board (D41): its department's members can be assigned. */
  board: TaskBoardEntry
  /** The department's members, in roster order. */
  members: RosterEntry[]
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
 * never asks (it's this one). D42 §2.6: a change to Ends alone asks the API
 * what it does, and the confirm says "Extends the series" or "Removes N
 * later occurrences".
 *
 * D39 Decision 6: an open one-off shows Repeat too (from Never; a Future one
 * needs a day first). Saving a rule makes it the first occurrence of a new
 * series. A finished one-off has no Repeat.
 */
export default function TaskDialog({ mode, board, members, today, onClose, onSaved, onStale, onDelete, onHistory }: Props) {
  // S76: the phone's back gesture closes the dialog, not the board.
  usePhoneBackCloses(true, onClose)
  const card = mode.kind === 'edit' ? mode.card : null
  const inSeries = !!card?.series_id
  const showRepeat = !card || inSeries || !card.done
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

  // Repeat: on add (and on a one-off) it follows the Day until the person
  // changes it. On an occurrence it's the series' rule, anchored on this
  // occurrence's date.
  const [rule, setRule] = useState<TaskRule>(() => defaultRule(startDay ?? today))
  const [ruleTouched, setRuleTouched] = useState(false)
  const { data: series, isError: seriesFailed, error: seriesError } = useApiQuery<TaskSeriesData>(
    ['task-series', card?.id],
    boardPath(board.key, 'tasks', card?.id, 'series'),
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
  // Opened to edit the notes (menu, or the card's notes icon by click or key): focus Notes with
  // the cursor after them. Not autoFocus: the dialog's focus trap takes focus after it when the
  // dialog opens from a key (D52). The field mounts a render after the dialog (its portal), so a
  // callback ref, focusing a frame later, once the trap has settled.
  const focusNotes = mode.kind === 'edit' && !!mode.focusNotes
  const notesFocused = useRef(false)
  const notesRef = (el: HTMLTextAreaElement | null) => {
    if (!focusNotes || !el || notesFocused.current) return
    notesFocused.current = true
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }

  // D42: an Ends-only change, with what saving it does.
  const [confirmEnds, setConfirmEnds] = useState<{ body: Record<string, unknown>; change: SeriesChange } | null>(null)

  // A finished task shown on the day it was done can't change day (Mark not
  // done first), and no finished task goes to Future.
  const dayLocked = !!card?.locked
  const futureLocked = !!card?.done
  // Someone who left the department stays selectable on a task that still names them.
  const options =
    card?.assignee_id && !members.some((b) => b.id === card.assignee_id)
      ? [...members, { id: card.assignee_id, name: card.assignee_name ?? 'Unknown', departments: [] }]
      : members

  const changeDay = (value: string) => {
    setDay(value)
    if (!inSeries && value) setRule((r) => (ruleTouched ? { ...r, startDate: value } : reseed(r, value)))
  }

  const changeRule = (next: TaskRule) => {
    setRule(next)
    setRuleTouched(true)
  }

  const send = async (body: Record<string, unknown>, scope?: SeriesScope, changed?: Changed) => {
    setAsking(null)
    setConfirmRemove(null)
    setConfirmEnds(null)
    setSaving(true)
    try {
      // D40: on a shared tablet, with the staff code (asked for first if none is remembered).
      await actingRun((code) =>
        card
          ? api.patch(boardPath(board.key, 'tasks', card.id), withCode({ ...body, ...(scope ? { scope } : {}), ...(changed ? { changed } : {}) }, code))
          : api.post(boardPath(board.key, 'tasks'), withCode(body, code)),
      )
      onSaved()
    } catch (err) {
      // The staff-code dialog was cancelled: nothing saved, the dialog stays.
      if (isActingCancelled(err)) return
      // Someone deleted it meanwhile: "This task was deleted", and the board catches up.
      if (taskGone(err)) onStale()
      setError(taskSaveError(err, board))
    } finally {
      setSaving(false)
    }
  }

  /** D42 §2.6: what an Ends-only save does (the API works it out), then confirm. */
  const askEnds = async (body: Record<string, unknown>) => {
    if (!card) return
    setSaving(true)
    try {
      const { data } = await api.get<{ data: TaskSeriesData }>(boardPath(board.key, 'tasks', card.id, 'series'), {
        params: taskRepeatParams(rule),
      })
      const change = data.data.change
      const removes = change ? change.removes_open + change.removes_changed : 0
      // Only an Ends change that removes nothing "extends"; anything else without removals just saves.
      if (!change || change.kind === 'same' || (change.kind === 'rule' && removes === 0)) return send(body, 'following')
      setConfirmEnds({ body, change })
    } catch (err) {
      if (taskGone(err)) onStale()
      setError(taskSaveError(err, board))
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
      // A rule makes it repeat, from its day (Decision 6).
      if (repeating) return send({ ...content, ...dayChange, ...taskRepeatParams(rule) })
      const changed = { ...content, ...dayChange }
      if (Object.keys(changed).length === 0) return onClose()
      return send(changed)
    }

    // An occurrence. A new rule applies from here on, and replaces the later
    // open ones: confirm first when there are any (Decision 2).
    if (repeating && original && !sameRule(rule, original)) {
      const full = { ...content, ...dayChange, ...taskRepeatParams(rule) }
      if (endsOnlyChange(rule, original)) return askEnds(full)
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
          inputRef={notesRef}
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
        {showRepeat &&
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
      {confirmEnds &&
        (confirmEnds.change.removes_open + confirmEnds.change.removes_changed > 0 ? (
          <RemoveLaterDialog
            title={confirmEnds.change.kind === 'ends' ? 'Change when it ends' : 'Change the repeat'}
            laterOpen={confirmEnds.change.removes_open}
            laterChanged={confirmEnds.change.removes_changed}
            loading={saving}
            onConfirm={(changed) => send(confirmEnds.body, 'following', changed)}
            onCancel={() => setConfirmEnds(null)}
          />
        ) : (
          <ExtendDialog loading={saving} onConfirm={() => send(confirmEnds.body, 'following')} onCancel={() => setConfirmEnds(null)} />
        ))}
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
