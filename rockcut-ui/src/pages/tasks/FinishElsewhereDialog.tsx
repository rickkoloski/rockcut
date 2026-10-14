import { useState } from 'react'
import { usePhoneBackCloses } from '../../hooks/useBackCloses'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material'
import { formatTaskDay } from '../../lib/tasks'
import type { CompletedDisplay, TaskCardData } from '../../lib/types'

interface Props {
  card: TaskCardData
  today: string
  onCancel: () => void
  onConfirm: (display: CompletedDisplay) => void
}

/**
 * D38 §3.8 "Finishing a task on another day": where the finished card shows.
 * Nothing is preselected; Cancel leaves the task open. Mount with a `key`.
 */
export default function FinishElsewhereDialog({ card, today, onCancel, onConfirm }: Props) {
  usePhoneBackCloses(true, onCancel)
  const [choice, setChoice] = useState<CompletedDisplay | null>(null)
  const planned = formatTaskDay(card.due_on!)

  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth data-testid="finish-dialog">
      <DialogTitle>Where should "{card.title}" show as done?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} data-testid="finish-dialog-text">
          Planned for {planned}, finished today ({formatTaskDay(today)}).
        </Typography>
        <RadioGroup value={choice ?? ''} onChange={(e) => setChoice(e.target.value as CompletedDisplay)}>
          <FormControlLabel
            value="planned_day"
            control={<Radio slotProps={{ input: { 'data-testid': 'finish-planned' } as object }} />}
            label={`On ${planned} (its planned day)`}
          />
          <FormControlLabel value="completed_day" control={<Radio slotProps={{ input: { 'data-testid': 'finish-today' } as object }} />} label="On today" />
          <FormControlLabel value="both" control={<Radio slotProps={{ input: { 'data-testid': 'finish-both' } as object }} />} label="On both days" />
        </RadioGroup>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} data-testid="finish-cancel">
          Cancel
        </Button>
        <Button variant="contained" disabled={!choice} onClick={() => choice && onConfirm(choice)} data-testid="finish-confirm">
          Mark done
        </Button>
      </DialogActions>
    </Dialog>
  )
}
