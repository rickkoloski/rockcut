import { useState } from 'react'
import { Box, ButtonBase, Checkbox, Collapse, IconButton, Menu, MenuItem, Paper, Tooltip, Typography } from '@mui/material'
import { ExpandLess, ExpandMore, MoreVert } from '@mui/icons-material'
import { firstName, shortTime } from '../../../lib/breweryTasks'
import type { DailyCardData, DailyCardItem } from '../../../lib/types'

interface Props {
  daily: DailyCardData
  today: string
  onToggle: (date: string, item: DailyCardItem) => void
  /** Edit Daily items, for managers and owners; no menu without it. */
  onEditItems?: () => void
}

/**
 * D38 §3.8 Daily card: "Daily 2/4", expanded on today, amber on a past day
 * with unticked checks. Today and past days tick; future days show the checks
 * disabled. A retired item (shown where it was ticked) can't be ticked or
 * unticked: its ticks are kept (D39 Decision 1). It isn't a drag item.
 */
export default function DailyCard({ daily, today, onToggle, onEditItems }: Props) {
  const [expanded, setExpanded] = useState(daily.date === today)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const past = daily.date < today
  const future = daily.date > today
  const behind = past && daily.done < daily.total
  const id = daily.date

  return (
    <Paper variant="outlined" data-testid={`daily-${id}`} data-behind={behind} sx={{ borderColor: behind ? 'warning.main' : undefined }}>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <ButtonBase
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          data-testid={`daily-toggle-${id}`}
          sx={{ flex: 1, minWidth: 0, justifyContent: 'space-between', px: 1, py: 0.5 }}
        >
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, whiteSpace: 'nowrap', color: behind ? 'warning.dark' : undefined }}
            data-testid={`daily-count-${id}`}
          >
            Daily {daily.done}/{daily.total}
          </Typography>
          {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
        </ButtonBase>
        {onEditItems && (
          <>
            <IconButton
              size="small"
              aria-label="Daily card menu"
              onClick={(e) => setMenuAnchor(e.currentTarget)}
              data-testid={`daily-menu-${id}`}
              sx={{ p: 0.25, mr: 0.25 }}
            >
              <MoreVert fontSize="small" />
            </IconButton>
            <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null)
                  onEditItems()
                }}
                data-testid={`daily-menu-edit-${id}`}
              >
                Edit Daily items
              </MenuItem>
            </Menu>
          </>
        )}
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ px: 0.5, pb: 0.5 }}>
          {daily.items.map((item) => {
            // Future days can't be ticked; a retired item's ticks stay as they are.
            const retired = !item.active
            const disabled = future || retired
            const label = item.checked ? `Untick ${item.name}` : `Tick ${item.name}`
            const box = (
              <Checkbox
                size="small"
                checked={item.checked}
                disabled={disabled}
                color="success"
                onChange={() => onToggle(daily.date, item)}
                sx={{ p: 0.5 }}
                slotProps={{ input: { 'aria-label': label, 'data-testid': `daily-check-${id}-${item.daily_item_id}` } as object }}
              />
            )
            return (
              <Box
                key={item.daily_item_id}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.25, opacity: future ? 0.6 : 1 }}
                data-testid={`daily-item-${id}-${item.daily_item_id}`}
                data-checked={item.checked}
              >
                {retired ? (
                  <Tooltip title={`${item.name} is retired; its ticks are kept`}>
                    <span data-testid={`daily-retired-${id}-${item.daily_item_id}`}>{box}</span>
                  </Tooltip>
                ) : (
                  box
                )}
                <Typography variant="caption" data-testid={`daily-label-${id}-${item.daily_item_id}`}>
                  {item.name}
                  {item.checked && item.completed_at && ` — ${firstName(item.completed_by_name)}, ${shortTime(item.completed_at)}`}
                </Typography>
              </Box>
            )
          })}
        </Box>
      </Collapse>
    </Paper>
  )
}
