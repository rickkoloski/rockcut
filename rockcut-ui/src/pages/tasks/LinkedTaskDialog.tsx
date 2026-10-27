import { useState } from 'react'
import { Alert, Button, MenuItem, TextField, Typography } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import { usePhoneBackCloses } from '../../hooks/useBackCloses'
import api from '../../lib/api'
import { boardPath, formatTaskDay } from '../../lib/tasks'
import type { RosterEntry, TaskBoardEntry, TaskCardData } from '../../lib/types'
import { useFlows } from '../production/Gantt/flowsContext'

const NOTES_MAX = 2000

interface Props {
  card: TaskCardData
  board: TaskBoardEntry
  /** The Brewery's members: who a step can be assigned to. */
  members: RosterEntry[]
  focusNotes?: boolean
  onClose: () => void
  onDelete: (card: TaskCardData) => void
  onOpenSchedule: () => void
}

/**
 * D49 §3.12 (P96): Edit on a task made from a production step. The title
 * and day are the step's ("This task comes from the production schedule",
 * with Open in schedule); notes and the assignee are one value with the
 * step's, saved through the board (the schedule's Undo).
 */
export default function LinkedTaskDialog({ card, board, members, focusNotes, onClose, onDelete, onOpenSchedule }: Props) {
  usePhoneBackCloses(true, onClose)
  const flows = useFlows()
  const [notes, setNotes] = useState(card.notes ?? '')
  const [assigneeId, setAssigneeId] = useState<number | ''>(card.assignee_id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const options =
    card.assignee_id && !members.some((b) => b.id === card.assignee_id)
      ? [...members, { id: card.assignee_id, name: card.assignee_name ?? 'Unknown', departments: [] }]
      : members

  const submit = async () => {
    if (notes.length > NOTES_MAX) return setError(`Notes: up to ${NOTES_MAX} characters`)
    const body: Record<string, unknown> = {}
    const trimmed = notes.trim() || null
    if (trimmed !== (card.notes?.trim() || null)) body.notes = trimmed
    const assignee = assigneeId === '' ? null : assigneeId
    if (assignee !== (card.assignee_id ?? null)) body.assignee_id = assignee
    if (!Object.keys(body).length) return onClose()
    setSaving(true)
    const r = await flows.write(() => api.patch(boardPath(board.key, 'tasks', card.id), body), 'Saved.')
    setSaving(false)
    if (!r.ok) {
      const fields = (r.body?.errors ?? {}) as Record<string, string[]>
      return setError(Object.values(fields)[0]?.[0] ?? r.error)
    }
    onClose()
  }

  return (
    <FormDialog
      open
      onClose={onClose}
      title="Edit task"
      onSubmit={submit}
      loading={saving}
      error={error}
      testId="task-dialog"
      secondaryAction={
        <Button color="error" onClick={() => onDelete(card)} disabled={saving} data-testid="task-dialog-delete">
          Delete
        </Button>
      }
    >
      <Alert
        severity="info"
        sx={{ py: 0, alignItems: 'center' }}
        data-testid="task-dialog-linked"
        action={
          <Button size="small" onClick={onOpenSchedule} data-testid="task-dialog-open-schedule">
            Open in schedule
          </Button>
        }
      >
        This task comes from the production schedule
      </Alert>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, overflowWrap: 'break-word' }} data-testid="task-dialog-linked-title">
        {card.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: -1.5 }}>
        {card.due_on ? formatTaskDay(card.due_on) : ''} · Change day… moves the step
      </Typography>
      <TextField
        label="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        multiline
        minRows={2}
        autoFocus={focusNotes}
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
    </FormDialog>
  )
}
