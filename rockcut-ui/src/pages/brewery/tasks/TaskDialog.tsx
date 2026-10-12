import { useState } from 'react'
import { Button, Checkbox, FormControlLabel, MenuItem, TextField } from '@mui/material'
import FormDialog from '../../../components/FormDialog'
import api from '../../../lib/api'
import { taskError } from '../../../lib/breweryTasks'
import type { RosterEntry, TaskCardData } from '../../../lib/types'

const TITLE_MAX = 200
const NOTES_MAX = 2000

export type TaskDialogMode = { kind: 'add'; dueOn: string | null } | { kind: 'edit'; card: TaskCardData; focusNotes?: boolean }

interface Props {
  mode: TaskDialogMode
  /** Brewery members, in roster order. */
  brewers: RosterEntry[]
  today: string
  onClose: () => void
  onSaved: () => void
  onDelete: (card: TaskCardData) => void
  /** This task's History (managers and owners). */
  onHistory?: (card: TaskCardData) => void
}

/**
 * D38 §3.8 add/edit dialog: title, notes, assignee and Day (or No day,
 * Future). Mount it with a `key` per task so it starts from that task.
 */
export default function TaskDialog({ mode, brewers, today, onClose, onSaved, onDelete, onHistory }: Props) {
  const card = mode.kind === 'edit' ? mode.card : null
  const [title, setTitle] = useState(card?.title ?? '')
  const [notes, setNotes] = useState(card?.notes ?? '')
  const [assigneeId, setAssigneeId] = useState<number | ''>(card?.assignee_id ?? '')
  const startDay = card ? card.due_on : mode.kind === 'add' ? mode.dueOn : null
  const [noDay, setNoDay] = useState(startDay === null)
  const [day, setDay] = useState(startDay ?? today)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // A finished task shown on the day it was done can't change day (Mark not
  // done first), and no finished task goes to Future.
  const dayLocked = !!card?.locked
  const futureLocked = !!card?.done
  // Someone who left the Brewery stays selectable on a task that still names them.
  const options =
    card?.assignee_id && !brewers.some((b) => b.id === card.assignee_id)
      ? [...brewers, { id: card.assignee_id, name: card.assignee_name ?? 'Unknown', departments: [] }]
      : brewers

  const submit = async () => {
    const trimmed = title.trim()
    if (!trimmed) return setTitleError('Enter a title')
    if (trimmed.length > TITLE_MAX) return setTitleError(`Up to ${TITLE_MAX} characters`)
    if (notes.length > NOTES_MAX) return setError(`Notes: up to ${NOTES_MAX} characters`)
    if (!noDay && !day) return setError('Pick a day, or No day (Future)')
    setTitleError(null)
    setError(null)
    setSaving(true)
    const dueOn = noDay ? null : day
    const body: Record<string, unknown> = { title: trimmed, notes: notes.trim() || null, assignee_id: assigneeId === '' ? null : assigneeId }
    try {
      if (card) {
        if (!dayLocked && dueOn !== card.due_on) body.due_on = dueOn
        await api.patch(`/api/brewery/tasks/${card.id}`, body)
      } else {
        await api.post('/api/brewery/tasks', { ...body, due_on: dueOn })
      }
      onSaved()
    } catch (err) {
      setError(taskError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog
      open
      onClose={onClose}
      title={card ? 'Edit task' : 'Add a task'}
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
        onChange={(e) => setDay(e.target.value)}
        disabled={noDay || dayLocked}
        helperText={dayLocked ? 'Mark not done first to move it' : undefined}
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
        label="No day (Future)"
      />
    </FormDialog>
  )
}
