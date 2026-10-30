import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react'
import { Avatar, Box, Checkbox, Chip, Paper, Tooltip, Typography } from '@mui/material'
import { NotesOutlined, Repeat } from '@mui/icons-material'
import { firstName, formatTaskDay, initials } from '../../lib/tasks'
import type { TaskCardData } from '../../lib/types'

interface Props {
  card: TaskCardData
  /** The lifted copy under the pointer while dragging. */
  overlay?: boolean
  /** Its place in the list while it's being dragged. */
  dragging?: boolean
  /** On the Unfinished card: the planned day leads the card. */
  showDate?: boolean
  onToggle?: (card: TaskCardData) => void
  onOpen?: (card: TaskCardData, anchor: HTMLElement) => void
  /**
   * D41 All departments view: no checkbox and no drag; the card is a link
   * (click or Enter) to `onOpen`.
   */
  readOnly?: boolean
  /** D49: no checkbox (a linked task on a shared tablet, read-only until D50). */
  noCheck?: boolean
  /** Can't be dragged (the board's rule; defaults to the server's `locked`). */
  locked?: boolean
  /** D52: a click on the notes icon (or its popup) edits the notes; left out where notes can't be edited. */
  onNotes?: (card: TaskCardData) => void
}

/**
 * D38 §3.8 task card: checkbox, title, initials, notes icon (D52: hover shows
 * the notes, a click edits them) and tags (D39: a
 * ↻ on an occurrence of a recurring task). A click
 * anywhere but the checkbox opens the task menu (Enter does too, through
 * SortableLists).
 */
export default function TaskCard({ card, overlay, dragging, showDate, onToggle, onOpen, readOnly, noCheck, locked = card.locked, onNotes }: Props) {
  const open = (e: MouseEvent<HTMLElement>) => onOpen?.(card, e.currentTarget)
  const tags = [
    card.planned_on && !showDate && { id: 'planned', label: `planned ${formatTaskDay(card.planned_on)}` },
    card.done_on && { id: 'done', label: `done ${formatTaskDay(card.done_on)}` },
    card.from_future && { id: 'from-future', label: 'from Future' },
    // D52: the last of a series that ends; checking it off offers to extend it.
    card.series_last && !card.done && { id: 'series-last', label: 'last in series' },
  ].filter(Boolean) as { id: string; label: string }[]

  return (
    <Paper
      variant="outlined"
      data-testid={`task-${card.key}`}
      data-done={card.done}
      data-locked={locked}
      data-overdue={card.overdue}
      onClick={open}
      {...(readOnly && {
        role: 'link',
        tabIndex: 0,
        'aria-label': `${card.title}, open on its board`,
        onKeyDown: (e: KeyboardEvent<HTMLElement>) => e.key === 'Enter' && onOpen?.(card, e.currentTarget),
      })}
      sx={{
        py: 0.5,
        pr: 0.75,
        pl: readOnly || noCheck ? 0.75 : 0,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0.25,
        cursor: locked || readOnly ? 'pointer' : 'grab',
        // A done card dims its title, not the whole card: the "✓ name" line and
        // the initials stay readable (D43 QA G3).
        opacity: dragging ? 0.4 : 1,
        borderLeft: card.overdue ? '4px solid' : undefined,
        borderLeftColor: card.overdue ? 'warning.main' : undefined,
        boxShadow: overlay ? 6 : undefined,
        bgcolor: 'background.boardCard',
        '&:hover': { borderColor: 'primary.light' },
      }}
    >
      {!readOnly && !noCheck && (
        <Checkbox
          size="small"
          checked={card.done}
          sx={{ p: 0.5, mt: -0.25 }}
          onClick={(e) => e.stopPropagation()}
          // Space on the checkbox ticks it; it mustn't reach the drag handle.
          onKeyDown={(e) => e.stopPropagation()}
          onChange={() => onToggle?.(card)}
          slotProps={{ input: { 'aria-label': card.done ? `Mark ${card.title} not done` : `Mark ${card.title} completed`, 'data-testid': `task-check-${card.key}` } as object }}
        />
      )}
      <Box sx={{ flex: 1, minWidth: 0, pt: 0.25 }}>
        {showDate && card.planned_on && (
          <Typography variant="caption" color="warning.dark" sx={{ display: 'block', fontWeight: 600 }} data-testid={`task-date-${card.key}`}>
            {formatTaskDay(card.planned_on)}
          </Typography>
        )}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
          <Typography
            variant="body2"
            data-testid={`task-title-${card.key}`}
            sx={{ flex: 1, minWidth: 0, textDecoration: card.done ? 'line-through' : undefined, color: card.done ? 'text.secondary' : undefined, overflowWrap: 'break-word' }}
          >
            {card.title}
          </Typography>
          {card.series_id != null && (
            <Tooltip title="Repeats">
              <Repeat sx={{ fontSize: 16, mt: 0.25 }} color="action" role="img" aria-label="Repeats" aria-hidden={false} data-testid={`task-repeat-icon-${card.key}`} />
            </Tooltip>
          )}
          {card.notes && (
            // D52: the hover shows the notes; a click on the icon or the popup edits them.
            // The popup is portalled, but its clicks still bubble to the card in React, hence
            // stopPropagation; and the dialog opens a frame later, once the click has settled
            // focus on the card, so the notes field keeps the cursor.
            <Tooltip
              title={
                <Box
                  onClick={(e) => {
                    e.stopPropagation()
                    if (onNotes) requestAnimationFrame(() => onNotes(card))
                  }}
                  sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'break-word', cursor: onNotes ? 'pointer' : 'default' }}
                  data-testid={`task-notes-popup-${card.key}`}
                >
                  {card.notes}
                </Box>
              }
              slotProps={{ tooltip: { sx: { maxWidth: 320, fontSize: 13 } } }}
            >
              <NotesOutlined
                sx={{ fontSize: 16, mt: 0.25, cursor: onNotes ? 'pointer' : undefined }}
                color="action"
                // The press stays off the card (its drag and focus), so the dialog keeps focus.
                onPointerDown={onNotes && ((e: PointerEvent) => e.stopPropagation())}
                onMouseDown={onNotes && ((e: MouseEvent) => e.preventDefault())}
                onClick={
                  onNotes &&
                  ((e: MouseEvent) => {
                    e.stopPropagation()
                    requestAnimationFrame(() => onNotes(card))
                  })
                }
                // QA gap 4: reachable by keyboard; focus shows the notes (the tooltip), Enter or Space edits them.
                tabIndex={onNotes ? 0 : undefined}
                role={onNotes ? 'button' : undefined}
                aria-hidden={onNotes ? undefined : true}
                aria-label={onNotes ? `Notes: ${card.notes}` : undefined}
                onKeyDown={
                  onNotes &&
                  ((e: KeyboardEvent<SVGSVGElement>) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return
                    e.preventDefault()
                    e.stopPropagation()
                    // A frame later, as the click: the key's own handling settles focus first.
                    requestAnimationFrame(() => onNotes(card))
                  })
                }
                data-testid={`task-notes-icon-${card.key}`}
              />
            </Tooltip>
          )}
          {card.assignee_name && (
            <Tooltip title={card.assignee_name}>
              <Avatar sx={{ width: 20, height: 20, fontSize: 10 }} data-testid={`task-assignee-${card.key}`}>
                {initials(card.assignee_name)}
              </Avatar>
            </Tooltip>
          )}
        </Box>
        {card.production?.planned && (
          // D49 §3.12: a planned batch's step ("Show planned batches" hides these).
          <Chip label="Planned batch" size="small" variant="outlined" color="info" sx={{ height: 18, fontSize: 11, mt: 0.25 }} data-testid={`task-planned-${card.key}`} />
        )}
        {(card.done || tags.length > 0) && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.25, alignItems: 'center' }}>
            {card.done && (
              <Typography variant="caption" color="success.main" data-testid={`task-done-by-${card.key}`}>
                ✓ {firstName(card.completed_by_name)}
              </Typography>
            )}
            {tags.map((t) => (
              <Typography
                key={t.id}
                variant="caption"
                data-testid={`task-tag-${t.id}-${card.key}`}
                sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 0.5, lineHeight: 1.6, color: 'text.secondary' }}
              >
                {t.label}
              </Typography>
            ))}
          </Box>
        )}
      </Box>
    </Paper>
  )
}
