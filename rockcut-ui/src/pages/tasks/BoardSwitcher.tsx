import { useState } from 'react'
import { Box, Button, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@mui/material'
import { ArrowDropDown, Check, ViewModule } from '@mui/icons-material'
import { ALL_BOARDS, boardTitle, switcherBoards } from '../../lib/tasks'
import type { TaskBoardEntry } from '../../lib/types'

interface Props {
  board: TaskBoardEntry
  boards: TaskBoardEntry[]
  onSwitch: (key: string) => void
  /** Phone width: a smaller title for the toolbar row. */
  compact?: boolean
}

// A department's color; All departments (D41 §3.6, no color) gets a grid icon.
const Swatch = ({ board }: { board: TaskBoardEntry }) =>
  board.key === ALL_BOARDS ? (
    <ViewModule sx={{ fontSize: 16, flexShrink: 0 }} color="action" />
  ) : (
    <Box component="span" sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: board.color ?? 'grey.500', flexShrink: 0, display: 'inline-block' }} />
  )

/**
 * D41 §3.5: the board's title. With two or more boards it's a picker
 * ("Taproom tasks ▾"), each department with its color; with one, plain text.
 * Owners get All departments last (D41 §3.6).
 */
export default function BoardSwitcher({ board, boards, onSwitch, compact }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const variant = compact ? 'h6' : 'h4'
  if (boards.length < 2)
    return (
      <Typography variant={variant} data-testid="board-title">
        {boardTitle(board)}
      </Typography>
    )
  return (
    <>
      <Button
        color="inherit"
        onClick={(e) => setAnchor(e.currentTarget)}
        endIcon={<ArrowDropDown />}
        aria-haspopup="menu"
        aria-label={`${boardTitle(board)}, switch board`}
        data-testid="board-switcher"
        sx={{ textTransform: 'none', px: 1, ml: -1, minWidth: 0 }}
      >
        <Swatch board={board} />
        <Typography variant={variant} component="span" data-testid="board-title" sx={{ ml: 1 }}>
          {boardTitle(board)}
        </Typography>
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} data-testid="board-switcher-menu">
        {switcherBoards(boards).map((b) => (
          <MenuItem
            key={b.key}
            selected={b.key === board.key}
            data-testid={`board-switch-${b.key}`}
            onClick={() => {
              setAnchor(null)
              if (b.key !== board.key) onSwitch(b.key)
            }}
          >
            <ListItemIcon>
              <Swatch board={b} />
            </ListItemIcon>
            <ListItemText primary={b.name} />
            {b.key === board.key && <Check fontSize="small" sx={{ ml: 2 }} />}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
