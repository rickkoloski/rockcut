import { useState } from 'react'
import { Box, Button, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@mui/material'
import { ArrowDropDown, Check } from '@mui/icons-material'
import { boardTitle } from '../../lib/tasks'
import type { TaskBoardEntry } from '../../lib/types'

interface Props {
  board: TaskBoardEntry
  boards: TaskBoardEntry[]
  onSwitch: (key: string) => void
  /** Phone width: a smaller title for the toolbar row. */
  compact?: boolean
}

const Swatch = ({ color }: { color: string | null }) => (
  <Box component="span" sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: color ?? 'grey.500', flexShrink: 0, display: 'inline-block' }} />
)

/**
 * D41 §3.5: the board's title. With two or more boards it's a picker
 * ("Taproom tasks ▾"), each department with its color; with one, plain text.
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
        <Swatch color={board.color} />
        <Typography variant={variant} component="span" data-testid="board-title" sx={{ ml: 1 }}>
          {boardTitle(board)}
        </Typography>
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} data-testid="board-switcher-menu">
        {boards.map((b) => (
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
              <Swatch color={b.color} />
            </ListItemIcon>
            <ListItemText primary={b.name} />
            {b.key === board.key && <Check fontSize="small" sx={{ ml: 2 }} />}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
