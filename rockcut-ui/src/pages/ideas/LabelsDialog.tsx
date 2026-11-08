import { useState } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, TextField, useTheme } from '@mui/material'
import { DeleteOutline } from '@mui/icons-material'
import ConfirmDialog from '../../components/ConfirmDialog'
import { usePhoneBackCloses } from '../../hooks/useBackCloses'
import api from '../../lib/api'
import { LABEL_COLORS, LABEL_COLOR_KEYS, ideaError, ideaPath, labelColor } from '../../lib/ideas'
import type { IdeaBoardEntry, IdeaLabel } from '../../lib/types'

interface Props {
  board: IdeaBoardEntry
  labels: IdeaLabel[]
  onClose: () => void
  onChanged: () => void
}

/**
 * Decision 16: the board's managers (owners on Company) rename, recolor and
 * delete its labels. Deleting one takes it off every card, locked ones too.
 */
export default function LabelsDialog({ board, labels, onClose, onChanged }: Props) {
  usePhoneBackCloses(true, onClose)
  const mode = useTheme().palette.mode
  const [problem, setProblem] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<IdeaLabel | null>(null)
  const [names, setNames] = useState<Record<number, string>>({})

  const update = async (label: IdeaLabel, body: Record<string, unknown>) => {
    setProblem(null)
    try {
      await api.patch(ideaPath(board.key, 'labels', label.id), body)
      onChanged()
    } catch (err) {
      setProblem(ideaError(err))
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" data-testid="idea-labels-dialog">
      <DialogTitle>Edit labels</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '8px !important' }}>
        {problem && <Alert severity="error">{problem}</Alert>}
        {labels.length === 0 && 'No labels yet. Add one from a card.'}
        {labels.map((l) => (
          <Box key={l.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }} data-testid={`idea-label-row-${l.id}`}>
            <TextField
              select
              size="small"
              value={l.color}
              onChange={(e) => update(l, { color: e.target.value })}
              sx={{ width: 76 }}
              slotProps={{ htmlInput: { 'aria-label': `${l.name} color` } }}
            >
              {LABEL_COLOR_KEYS.map((c) => (
                <MenuItem key={c} value={c} aria-label={LABEL_COLORS[c].label}>
                  <Box sx={{ width: 28, height: 12, borderRadius: 6, bgcolor: labelColor(c, mode) }} />
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              fullWidth
              value={names[l.id] ?? l.name}
              onChange={(e) => setNames({ ...names, [l.id]: e.target.value })}
              onBlur={() => {
                const name = (names[l.id] ?? l.name).trim()
                if (name && name !== l.name) void update(l, { name })
              }}
              slotProps={{ htmlInput: { maxLength: 30, 'aria-label': 'Label name', 'data-testid': `idea-label-name-${l.id}` } }}
            />
            <IconButton aria-label={`Delete ${l.name}`} onClick={() => setDeleting(l)} data-testid={`idea-label-delete-${l.id}`}>
              <DeleteOutline />
            </IconButton>
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
      <ConfirmDialog
        open={!!deleting}
        title={`Delete the label ${deleting?.name ?? ''}?`}
        message="It comes off every card that has it, locked ones too."
        confirmLabel="Delete"
        confirmColor="error"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await api.delete(ideaPath(board.key, 'labels', deleting.id))
            onChanged()
          } catch (err) {
            setProblem(ideaError(err))
          }
          setDeleting(null)
        }}
      />
    </Dialog>
  )
}
