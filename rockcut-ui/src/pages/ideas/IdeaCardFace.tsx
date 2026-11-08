import { Avatar, Box, Chip, Paper, Tooltip, Typography, useTheme } from '@mui/material'
import { ChecklistRtl, ChatBubbleOutline, LockOutlined, VisibilityOutlined, EventOutlined } from '@mui/icons-material'
import type { IdeaCardFace as Face, IdeaLabel } from '../../lib/types'
import { formatIdeaDate, formatIdeaDay, isPastDue, labelColor } from '../../lib/ideas'
import { initials } from '../../lib/tasks'

interface Props {
  card: Face
  labels: Map<number, IdeaLabel>
  /** Locked through its list (the list shows the lock; the card doesn't repeat it). */
  listLocked?: boolean
  today: string
  dragging?: boolean
  overlay?: boolean
  /** A click opens it; Enter on the focused card is the drag layer's `onItemActivate`. */
  onOpen?: (card: Face) => void
}

/** The face's chip for the latest send (§4.4): "On the task list", "✓ Done", "Repeats", "Removed". */
function sentFace(card: Face): { text: string; color: 'default' | 'success' | 'info' } | null {
  const last = card.sent_tasks.at(-1)
  if (!last) return null
  switch (last.state) {
    case 'done':
      return { text: last.completed_on ? `✓ Done ${formatIdeaDay(last.completed_on)}` : '✓ Done', color: 'success' }
    case 'repeating':
      return { text: 'Repeats on the task list', color: 'info' }
    case 'removed':
      return { text: 'Removed from the task list', color: 'default' }
    default:
      return { text: 'On the task list', color: 'info' }
  }
}

/**
 * D53 §4.4 card face: label bars, title, then a row of what's on it (due date,
 * red when past; checklist "2/5"; notes; a small eye when you watch it; the
 * lock), people's initials, and the "On the task list" chip after a Send.
 */
export default function IdeaCardFace({ card, labels, listLocked, today, dragging, overlay, onOpen }: Props) {
  const theme = useTheme()
  const mode = theme.palette.mode
  const cardLabels = card.label_ids.map((id) => labels.get(id)).filter((l): l is IdeaLabel => !!l)
  const past = isPastDue(card.due_on, today)
  const sent = sentFace(card)
  const people = card.assignees
  const shown = people.slice(0, 3)
  const more = people.length - shown.length

  return (
    <Paper
      variant="outlined"
      onClick={() => onOpen?.(card)}
      data-testid={`idea-card-${card.id}`}
      sx={{
        p: 1,
        mb: 1,
        cursor: onOpen ? 'pointer' : 'default',
        bgcolor: 'background.boardCard',
        opacity: dragging ? 0.4 : 1,
        boxShadow: overlay ? 6 : undefined,
        '&:hover': { borderColor: 'primary.main' },
      }}
    >
      {cardLabels.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.75 }} data-testid={`idea-card-labels-${card.id}`}>
          {cardLabels.map((l) => (
            <Tooltip key={l.id} title={l.name}>
              <Box
                component="span"
                aria-label={l.name}
                role="img"
                sx={{ width: 36, height: 6, borderRadius: 3, bgcolor: labelColor(l.color, mode), display: 'inline-block' }}
              />
            </Tooltip>
          ))}
        </Box>
      )}
      <Typography variant="body2" sx={{ fontWeight: 500, overflowWrap: 'anywhere' }} data-testid={`idea-card-title-${card.id}`}>
        {card.title}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1, rowGap: 0.5, mt: 0.5, color: 'text.secondary' }}>
        {card.due_on && (
          <Box
            component="span"
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontSize: 12, color: past ? 'error.main' : undefined, fontWeight: past ? 600 : undefined }}
            data-testid={`idea-card-due-${card.id}`}
            data-past={past ? 'true' : 'false'}
          >
            <EventOutlined sx={{ fontSize: 14 }} />
            {formatIdeaDay(card.due_on)}
          </Box>
        )}
        {card.checklist.total > 0 && (
          <Box
            component="span"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.25,
              fontSize: 12,
              color: card.checklist.done === card.checklist.total ? 'success.main' : undefined,
            }}
            data-testid={`idea-card-checklist-${card.id}`}
          >
            <ChecklistRtl sx={{ fontSize: 14 }} />
            {card.checklist.done}/{card.checklist.total}
          </Box>
        )}
        {card.note_count > 0 && (
          <Tooltip title={`${card.note_count} ${card.note_count === 1 ? 'note' : 'notes'}`}>
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontSize: 12 }} data-testid={`idea-card-notes-${card.id}`}>
              <ChatBubbleOutline sx={{ fontSize: 14 }} />
              {card.note_count}
            </Box>
          </Tooltip>
        )}
        {card.watching && (
          <Tooltip title="You're watching this">
            <VisibilityOutlined sx={{ fontSize: 15 }} aria-label="Watching" role="img" data-testid={`idea-card-watching-${card.id}`} />
          </Tooltip>
        )}
        {card.locked && !listLocked && (
          <Tooltip title={`Locked${card.locked_by ? ` by ${card.locked_by.name}` : ''}${card.locked_at ? ` · ${formatIdeaDate(card.locked_at)}` : ''}`}>
            <LockOutlined sx={{ fontSize: 15 }} aria-label="Locked" role="img" data-testid={`idea-card-lock-${card.id}`} />
          </Tooltip>
        )}
        <Box sx={{ flex: 1 }} />
        {shown.length > 0 && (
          <Box sx={{ display: 'inline-flex', gap: '2px' }} data-testid={`idea-card-people-${card.id}`}>
            {shown.map((p) => (
              <Tooltip key={p.id} title={p.name}>
                <Avatar sx={{ width: 22, height: 22, fontSize: 10 }}>{initials(p.name)}</Avatar>
              </Tooltip>
            ))}
            {more > 0 && <Avatar sx={{ width: 22, height: 22, fontSize: 10 }}>+{more}</Avatar>}
          </Box>
        )}
      </Box>
      {sent && (
        <Chip
          size="small"
          variant="outlined"
          color={sent.color}
          label={sent.text}
          sx={{ mt: 0.75, height: 20, fontSize: 11, maxWidth: '100%' }}
          data-testid={`idea-card-sent-${card.id}`}
        />
      )}
    </Paper>
  )
}
