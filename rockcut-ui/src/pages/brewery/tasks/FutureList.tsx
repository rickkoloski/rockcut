import { Box, Button, Chip, Paper, Typography } from '@mui/material'
import { Add } from '@mui/icons-material'
import type { ContainerSlot } from '../../../components/dnd/SortableLists'

interface Props {
  openCount: number
  empty: boolean
  slot: ContainerSlot
  onAdd: () => void
}

/** D38 §3.8 Future list: tasks on no day yet. Always shown, so there's always somewhere to drop. */
export default function FutureList({ openCount, empty, slot: { setNodeRef, isOver, items }, onAdd }: Props) {
  return (
    <Paper variant="outlined" data-testid="future-list" sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1, bgcolor: 'background.default' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Future
        </Typography>
        <Chip size="small" label={openCount} data-testid="future-count" aria-label={`${openCount} open`} sx={{ height: 20 }} />
      </Box>
      <Box
        ref={setNodeRef}
        data-testid="future-items"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
          minHeight: 48,
          borderRadius: 1,
          outline: isOver ? '2px dashed' : undefined,
          outlineColor: 'primary.light',
        }}
      >
        {empty && (
          <Typography variant="caption" color="text.secondary" sx={{ p: 1 }} data-testid="future-empty">
            Nothing here. Drag a task here or add one.
          </Typography>
        )}
        {items}
      </Box>
      <Button size="small" startIcon={<Add />} onClick={onAdd} data-testid="future-add" sx={{ alignSelf: 'flex-start' }}>
        Add a task
      </Button>
    </Paper>
  )
}
