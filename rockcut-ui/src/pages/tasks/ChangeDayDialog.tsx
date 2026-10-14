import { useState } from 'react'
import { usePhoneBackCloses } from '../../hooks/useBackCloses'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Tooltip } from '@mui/material'
import { isDateKey } from '../../lib/tasks'
import type { TaskCardData } from '../../lib/types'

interface Props {
  card: TaskCardData
  today: string
  onCancel: () => void
  /** `null` = the Future list. The task goes to the bottom either way. */
  onMove: (dueOn: string | null) => void
}

/** D38 §3.8 Change day…: any date, or Move to Future. Mount with a `key`. */
export default function ChangeDayDialog({ card, today, onCancel, onMove }: Props) {
  usePhoneBackCloses(true, onCancel)
  const [day, setDay] = useState(card.due_on ?? today)
  const onFuture = card.due_on === null
  const valid = isDateKey(day) && day !== card.due_on

  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth data-testid="change-day-dialog">
      <DialogTitle>Change day for "{card.title}"</DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <TextField
          type="date"
          label="Day"
          fullWidth
          value={day}
          onChange={(e) => setDay(e.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'change-day-input' } }}
        />
      </DialogContent>
      <DialogActions>
        {!onFuture && (
          <Tooltip title={card.done ? 'Mark not done first to move it' : ''}>
            {/* A finished task can't go to Future (lead, 2026-10-11). */}
            <span style={{ marginRight: 'auto' }}>
              <Button onClick={() => onMove(null)} disabled={card.done} data-testid="change-day-future">
                Move to Future
              </Button>
            </span>
          </Tooltip>
        )}
        <Button onClick={onCancel} data-testid="change-day-cancel">
          Cancel
        </Button>
        <Button variant="contained" disabled={!valid} onClick={() => onMove(day)} data-testid="change-day-confirm">
          Move
        </Button>
      </DialogActions>
    </Dialog>
  )
}
