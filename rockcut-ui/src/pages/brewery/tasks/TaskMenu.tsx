import { Box, Divider, Drawer, ListItemIcon, ListItemText, Menu, MenuItem, MenuList, Typography } from '@mui/material'
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
import { useBackCloses } from '../../../hooks/useBackCloses'
import { formatTaskDay } from '../../../lib/breweryTasks'
import type { TaskCardData } from '../../../lib/types'

export type TaskAction = 'edit' | 'notes' | 'toggle' | 'change-day' | 'up' | 'down' | 'delete'

interface Props {
  anchor: HTMLElement
  card: TaskCardData
  canMoveUp: boolean
  canMoveDown: boolean
  /** Phone width: a sheet from the bottom of the screen instead of a menu by the card. */
  sheet?: boolean
  onClose: () => void
  onAction: (action: TaskAction) => void
}

/**
 * D38 §3.8 task menu: beside the card, or a sheet from the bottom at phone
 * width (S9a), with the same actions either way. A
 * finished task shown on the day it was done can't move: Change day and Move
 * up/down are greyed out with "Mark not done first to move it". Back closes
 * the sheet (DEV pass 2, B).
 */
export default function TaskMenu({ anchor, card, canMoveUp, canMoveDown, sheet, onClose, onAction }: Props) {
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
  // Android's back gesture closes the sheet, and only the sheet.
  useBackCloses(!!sheet, dismiss)

  // An array, not a fragment: Menu and MenuList walk their children for focus.
  const items = [
    <Box key="header" sx={{ px: 2, py: 1, maxWidth: sheet ? undefined : 280 }} data-testid="task-menu-header">
      <Typography variant="subtitle2" sx={{ wordBreak: 'break-word' }}>
        {card.title}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="div">
        {card.due_on ? formatTaskDay(card.due_on) : 'Future'} · {card.assignee_name ?? 'Anyone'}
      </Typography>
    </Box>,
    <Divider key="divider-top" />,
    <MenuItem key="edit" onClick={pick('edit')} data-testid="task-menu-edit">
      <ListItemIcon><Edit fontSize="small" /></ListItemIcon>
      <ListItemText>Edit</ListItemText>
    </MenuItem>,
    <MenuItem key="notes" onClick={pick('notes')} data-testid="task-menu-notes">
      <ListItemIcon><NotesOutlined fontSize="small" /></ListItemIcon>
      <ListItemText>{card.notes ? 'Edit notes' : 'Add notes'}</ListItemText>
    </MenuItem>,
    <MenuItem key="complete" onClick={pick('toggle')} data-testid="task-menu-complete">
      <ListItemIcon>{card.done ? <CheckBoxOutlineBlank fontSize="small" /> : <CheckBox fontSize="small" />}</ListItemIcon>
      <ListItemText>{card.done ? 'Mark not done' : 'Mark completed'}</ListItemText>
    </MenuItem>,
    <MenuItem key="change-day" onClick={pick('change-day')} disabled={card.locked} data-testid="task-menu-change-day">
      <ListItemIcon><EventRepeat fontSize="small" /></ListItemIcon>
      <ListItemText>Change day…</ListItemText>
    </MenuItem>,
    <MenuItem key="up" onClick={pick('up')} disabled={card.locked || !canMoveUp} data-testid="task-menu-up">
      <ListItemIcon><ArrowUpward fontSize="small" /></ListItemIcon>
      <ListItemText>Move up</ListItemText>
    </MenuItem>,
    <MenuItem key="down" onClick={pick('down')} disabled={card.locked || !canMoveDown} data-testid="task-menu-down">
      <ListItemIcon><ArrowDownward fontSize="small" /></ListItemIcon>
      <ListItemText>Move down</ListItemText>
    </MenuItem>,
    card.locked && (
      <Typography key="locked" variant="caption" color="text.secondary" sx={{ px: 2, display: 'block' }} data-testid="task-menu-locked-hint">
        Mark not done first to move it
      </Typography>
    ),
    <Divider key="divider-bottom" />,
    <MenuItem key="delete" onClick={pick('delete')} data-testid="task-menu-delete" sx={{ color: 'error.main' }}>
      <ListItemIcon><Delete fontSize="small" color="error" /></ListItemIcon>
      <ListItemText>Delete</ListItemText>
    </MenuItem>,
  ]

  if (sheet)
    return (
      <Drawer
        anchor="bottom"
        open
        onClose={dismiss}
        disableRestoreFocus
        slotProps={{ paper: { 'data-testid': 'task-menu', 'data-variant': 'sheet', sx: { borderTopLeftRadius: 12, borderTopRightRadius: 12, pb: 1 } } as object }}
      >
        <MenuList autoFocusItem>{items}</MenuList>
      </Drawer>
    )

  return (
    <Menu
      open
      anchorEl={anchor}
      onClose={dismiss}
      disableRestoreFocus
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{ paper: { 'data-testid': 'task-menu' } as object }}
    >
      {items}
    </Menu>
  )
}
