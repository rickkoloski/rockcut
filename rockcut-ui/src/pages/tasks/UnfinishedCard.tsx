import { Box, Button, Paper, Typography } from '@mui/material'
import { Today } from '@mui/icons-material'
import type { ContainerSlot } from '../../components/dnd/SortableLists'

interface Props {
  /** Every open task before today, whatever the filter (what Move all moves). */
  total: number
  slot: ContainerSlot
  onMoveAll: () => void
}

/**
 * D38 §3.8 Unfinished card: open tasks from earlier days, oldest first. Tasks
 * can be dragged out of it onto a day, not into it.
 */
export default function UnfinishedCard({ total, slot: { setNodeRef, items }, onMoveAll }: Props) {
  return (
    <Paper
      variant="outlined"
      data-testid="unfinished-card"
      sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1, borderColor: 'warning.main', bgcolor: 'background.boardColumn' }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }} data-testid="unfinished-title">
        Unfinished ({total})
      </Typography>
      <Box ref={setNodeRef} data-testid="unfinished-list" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minHeight: 48 }}>
        {items}
      </Box>
      <Button size="small" variant="outlined" color="warning" startIcon={<Today />} onClick={onMoveAll} data-testid="unfinished-move-all">
        Move all to today
      </Button>
    </Paper>
  )
}
