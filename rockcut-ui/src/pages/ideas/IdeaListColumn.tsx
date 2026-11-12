import { useRef, useState, type ReactNode } from 'react'
import { Box, Button, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Paper, TextField, Tooltip, Typography } from '@mui/material'
import { Add, ArchiveOutlined, ChevronLeft, ChevronRight, DriveFileRenameOutline, LockOpenOutlined, LockOutlined, MoreVert } from '@mui/icons-material'
import type { ContainerSlot } from '../../components/dnd/SortableLists'
import type { ColumnDrag } from './ListColumnsSortable'
import { formatIdeaDate } from '../../lib/ideas'
import type { IdeaListData } from '../../lib/types'

export type ListAction = 'rename' | 'left' | 'right' | 'lock' | 'unlock' | 'archive'

interface Props {
  list: IdeaListData
  slot: ContainerSlot
  /** Cards showing (after the filter) and on the list. */
  shown: number
  total: number
  /** This person may change it (`:write`, and it isn't locked or they manage the board). */
  canChange: boolean
  /** May add cards here (as `canChange`). */
  canAdd: boolean
  /** Lock / Unlock (the board's managers; owners on Company). */
  canLock: boolean
  isFirst: boolean
  isLast: boolean
  /** A shared tablet: no menu, no add. */
  readOnly: boolean
  onAction: (action: ListAction) => void
  onRename: (name: string) => Promise<boolean>
  onAddCard: (title: string) => Promise<boolean>
  /** Phone width: the column fills the screen. */
  full?: boolean
  footer?: ReactNode
  /** D58 §3.16: desktop, dragged left or right by its header. */
  drag?: ColumnDrag
}

/**
 * D53 §4.4: one list. Its name (click to rename), the card count, the lock
 * ("Locked by Casey · Nov 2"), ⋮ (rename, move left/right, lock or unlock,
 * archive), its cards, and "+ Add a card" at the bottom. What a person can't
 * do is left out rather than refused (§4.5).
 */
export default function IdeaListColumn(props: Props) {
  const { list, shown, total, canChange, canAdd, canLock, readOnly, full } = props
  // Taken apart here: the linter reads `slot.x` beside a ref callback as a ref read.
  const { setNodeRef, isOver, items } = props.slot
  const drag = props.drag
  const columnRef = (node: HTMLElement | null) => {
    setNodeRef(node)
    drag?.setNodeRef(node)
  }
  const draggable = !!drag?.handle
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(list.name)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  // ⋮ → Rename opens the field once the menu has closed (fix cycle 1 gap 1):
  // opened at once, the menu handing focus back to ⋮ blurred it, which ended
  // the rename before it began.
  const renameAfterMenu = useRef(false)
  const startRename = () => {
    setName(list.name)
    setRenaming(true)
  }
  const act = (action: ListAction) => {
    setAnchor(null)
    if (action === 'rename') {
      if (anchor) renameAfterMenu.current = true
      else startRename()
    } else props.onAction(action)
  }

  const saveName = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === list.name) return setRenaming(false)
    setBusy(true)
    const ok = await props.onRename(trimmed)
    setBusy(false)
    if (ok) setRenaming(false)
  }

  const addCard = async () => {
    const trimmed = title.trim()
    if (!trimmed) return setAdding(false)
    setBusy(true)
    const ok = await props.onAddCard(trimmed)
    setBusy(false)
    // Stays open for the next one, as Trello does.
    if (ok) setTitle('')
  }

  const lockText = list.locked
    ? `Locked${list.locked_by ? ` by ${list.locked_by.name.split(' ')[0]}` : ''}${list.locked_at ? ` · ${formatIdeaDate(list.locked_at)}` : ''}`
    : null

  return (
    <Paper
      ref={columnRef}
      variant="outlined"
      data-testid={`idea-list-${list.id}`}
      data-list-name={list.name}
      data-dragging={drag?.dragging || undefined}
      style={drag?.style}
      sx={{
        boxShadow: drag?.dragging ? 6 : undefined,
        width: full ? '100%' : 280,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: full ? undefined : 'calc(100vh - 190px)',
        bgcolor: 'background.boardColumn',
        outline: isOver ? '2px dashed' : undefined,
        outlineColor: 'primary.main',
      }}
    >
      <Box
        {...(draggable && !renaming ? drag?.handle : {})}
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, pt: 1, pb: 0.5, cursor: draggable && !renaming ? 'grab' : undefined }}
        data-testid={`idea-list-header-${list.id}`}
      >
        {renaming ? (
          <TextField
            size="small"
            value={name}
            autoFocus
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveName()
              if (e.key === 'Escape') setRenaming(false)
            }}
            slotProps={{ htmlInput: { maxLength: 80, 'aria-label': 'List name', 'data-testid': `idea-list-name-input-${list.id}` } }}
            sx={{ flex: 1 }}
          />
        ) : (
          <Typography
            variant="subtitle1"
            component="h2"
            onClick={canChange && !readOnly ? () => act('rename') : undefined}
            sx={{ flex: 1, minWidth: 0, fontWeight: 600, overflowWrap: 'anywhere', cursor: canChange && !readOnly ? 'text' : 'default' }}
            data-testid={`idea-list-name-${list.id}`}
          >
            {list.name}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" data-testid={`idea-list-count-${list.id}`} sx={{ flexShrink: 0 }}>
          {shown === total ? total : `${shown}/${total}`}
        </Typography>
        {list.locked && (
          <Tooltip title={lockText ?? ''}>
            <LockOutlined fontSize="small" color="action" aria-label={lockText ?? 'Locked'} role="img" data-testid={`idea-list-lock-${list.id}`} />
          </Tooltip>
        )}
        {!readOnly && (canChange || canLock) && (
          <IconButton size="small" aria-label={`${list.name} menu`} onClick={(e) => setAnchor(e.currentTarget)} data-testid={`idea-list-menu-${list.id}`}>
            <MoreVert fontSize="small" />
          </IconButton>
        )}
      </Box>
      {lockText && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 1, mt: -0.5, mb: 0.5 }} data-testid={`idea-list-locked-by-${list.id}`}>
          {lockText}
        </Typography>
      )}
      <Box sx={{ px: 1, pb: 0.5, overflowY: full ? undefined : 'auto', minHeight: 24, flex: 1 }}>{items}</Box>
      {canAdd && !readOnly && (
        <Box sx={{ px: 1, pb: 1 }}>
          {adding ? (
            <Box>
              <TextField
                size="small"
                fullWidth
                multiline
                autoFocus
                placeholder="Card title"
                value={title}
                disabled={busy}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void addCard()
                  }
                  if (e.key === 'Escape') setAdding(false)
                }}
                slotProps={{ htmlInput: { maxLength: 200, 'aria-label': 'Card title', 'data-testid': `idea-add-card-input-${list.id}` } }}
              />
              <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                <Button size="small" variant="contained" onClick={addCard} disabled={busy} data-testid={`idea-add-card-save-${list.id}`}>
                  Add card
                </Button>
                <Button size="small" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </Box>
            </Box>
          ) : (
            <Button size="small" startIcon={<Add />} onClick={() => setAdding(true)} sx={{ justifyContent: 'flex-start' }} fullWidth data-testid={`idea-add-card-${list.id}`}>
              Add a card
            </Button>
          )}
        </Box>
      )}
      {props.footer}
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        slotProps={{
          transition: {
            onExited: () => {
              if (!renameAfterMenu.current) return
              renameAfterMenu.current = false
              startRename()
            },
          },
        }}
        data-testid={`idea-list-menu-items-${list.id}`}
      >
        {canChange && (
          <MenuItem onClick={() => act('rename')} data-testid="idea-list-rename">
            <ListItemIcon>
              <DriveFileRenameOutline fontSize="small" />
            </ListItemIcon>
            <ListItemText>Rename</ListItemText>
          </MenuItem>
        )}
        {canChange && !props.isFirst && (
          <MenuItem onClick={() => act('left')} data-testid="idea-list-left">
            <ListItemIcon>
              <ChevronLeft fontSize="small" />
            </ListItemIcon>
            <ListItemText>Move left</ListItemText>
          </MenuItem>
        )}
        {canChange && !props.isLast && (
          <MenuItem onClick={() => act('right')} data-testid="idea-list-right">
            <ListItemIcon>
              <ChevronRight fontSize="small" />
            </ListItemIcon>
            <ListItemText>Move right</ListItemText>
          </MenuItem>
        )}
        {canLock && (
          <MenuItem onClick={() => act(list.locked ? 'unlock' : 'lock')} data-testid={list.locked ? 'idea-list-unlock' : 'idea-list-lock'}>
            <ListItemIcon>{list.locked ? <LockOpenOutlined fontSize="small" /> : <LockOutlined fontSize="small" />}</ListItemIcon>
            <ListItemText>{list.locked ? 'Unlock' : 'Lock'}</ListItemText>
          </MenuItem>
        )}
        {canChange && (
          <MenuItem onClick={() => act('archive')} data-testid="idea-list-archive">
            <ListItemIcon>
              <ArchiveOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText>Archive</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </Paper>
  )
}
