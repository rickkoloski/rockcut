import { Box, Divider, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@mui/material'
import {
  ArrowDownward,
  ArrowUpward,
  CheckBox,
  CheckBoxOutlineBlank,
  Delete,
  Edit,
  EventRepeat,
  NotesOutlined,
} from '@mui/icons-material'
import { formatTaskDay } from '../../../lib/breweryTasks'
import type { TaskCardData } from '../../../lib/types'

export type TaskAction = 'edit' | 'notes' | 'toggle' | 'change-day' | 'up' | 'down' | 'delete'

interface Props {
  anchor: HTMLElement
  card: TaskCardData
  canMoveUp: boolean
  canMoveDown: boolean
  onClose: () => void
  onAction: (action: TaskAction) => void
}

/**
 * D38 §3.8 task menu, beside the card (the phone sheet comes in step 9). A
 * finished task shown on the day it was done can't move: Change day and Move
 * up/down are greyed out with "Mark not done first to move it".
 */
export default function TaskMenu({ anchor, card, canMoveUp, canMoveDown, onClose, onAction }: Props) {
  const pick = (action: TaskAction) => () => {
    onClose()
    onAction(action)
  }
  // Focus goes back to the card only when the menu is dismissed; a picked
  // action may open a dialog that takes focus (Add notes → Notes).
  const dismiss = () => {
    const focusable = anchor.closest<HTMLElement>('[tabindex]') ?? anchor
    focusable.focus()
    onClose()
  }

  return (
    <Menu
      open
      anchorEl={anchor}
      onClose={dismiss}
      disableRestoreFocus
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{ paper: { 'data-testid': 'task-menu' } as object }}
    >
      <Box sx={{ px: 2, py: 1, maxWidth: 280 }} data-testid="task-menu-header">
        <Typography variant="subtitle2" sx={{ wordBreak: 'break-word' }}>
          {card.title}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div">
          {card.due_on ? formatTaskDay(card.due_on) : 'Future'} · {card.assignee_name ?? 'Anyone'}
        </Typography>
      </Box>
      <Divider />
      <MenuItem onClick={pick('edit')} data-testid="task-menu-edit">
        <ListItemIcon><Edit fontSize="small" /></ListItemIcon>
        <ListItemText>Edit</ListItemText>
      </MenuItem>
      <MenuItem onClick={pick('notes')} data-testid="task-menu-notes">
        <ListItemIcon><NotesOutlined fontSize="small" /></ListItemIcon>
        <ListItemText>{card.notes ? 'Edit notes' : 'Add notes'}</ListItemText>
      </MenuItem>
      <MenuItem onClick={pick('toggle')} data-testid="task-menu-complete">
        <ListItemIcon>{card.done ? <CheckBoxOutlineBlank fontSize="small" /> : <CheckBox fontSize="small" />}</ListItemIcon>
        <ListItemText>{card.done ? 'Mark not done' : 'Mark completed'}</ListItemText>
      </MenuItem>
      <MenuItem onClick={pick('change-day')} disabled={card.locked} data-testid="task-menu-change-day">
        <ListItemIcon><EventRepeat fontSize="small" /></ListItemIcon>
        <ListItemText>Change day…</ListItemText>
      </MenuItem>
      <MenuItem onClick={pick('up')} disabled={card.locked || !canMoveUp} data-testid="task-menu-up">
        <ListItemIcon><ArrowUpward fontSize="small" /></ListItemIcon>
        <ListItemText>Move up</ListItemText>
      </MenuItem>
      <MenuItem onClick={pick('down')} disabled={card.locked || !canMoveDown} data-testid="task-menu-down">
        <ListItemIcon><ArrowDownward fontSize="small" /></ListItemIcon>
        <ListItemText>Move down</ListItemText>
      </MenuItem>
      {card.locked && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 2, display: 'block' }} data-testid="task-menu-locked-hint">
          Mark not done first to move it
        </Typography>
      )}
      <Divider />
      <MenuItem onClick={pick('delete')} data-testid="task-menu-delete" sx={{ color: 'error.main' }}>
        <ListItemIcon><Delete fontSize="small" color="error" /></ListItemIcon>
        <ListItemText>Delete</ListItemText>
      </MenuItem>
    </Menu>
  )
}
