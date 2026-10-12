import { useState } from 'react'
import { Box, ButtonBase, Collapse, Paper, Typography } from '@mui/material'
import { CheckBox, CheckBoxOutlineBlank, ExpandLess, ExpandMore } from '@mui/icons-material'
import { firstName, shortTime } from '../../../lib/breweryTasks'
import type { DailyCardData } from '../../../lib/types'

interface Props {
  daily: DailyCardData
  today: string
}

/**
 * D38 §3.8 Daily card, display only (ticking and Edit Daily items come in
 * step 7): "Daily 2/4", expanded on today, amber on a past day with unticked
 * checks. It isn't a drag item.
 */
export default function DailyCard({ daily, today }: Props) {
  const [expanded, setExpanded] = useState(daily.date === today)
  const past = daily.date < today
  const behind = past && daily.done < daily.total
  const id = daily.date

  return (
    <Paper variant="outlined" data-testid={`daily-${id}`} data-behind={behind} sx={{ borderColor: behind ? 'warning.main' : undefined }}>
      <ButtonBase
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        data-testid={`daily-toggle-${id}`}
        sx={{ width: '100%', justifyContent: 'space-between', px: 1, py: 0.5 }}
      >
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, color: behind ? 'warning.dark' : undefined }}
          data-testid={`daily-count-${id}`}
        >
          Daily {daily.done}/{daily.total}
        </Typography>
        {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
      </ButtonBase>
      <Collapse in={expanded}>
        <Box sx={{ px: 1, pb: 0.5 }}>
          {daily.items.map((item) => (
            <Box
              key={item.daily_item_id}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, opacity: daily.date > today ? 0.6 : 1 }}
              data-testid={`daily-item-${id}-${item.daily_item_id}`}
              data-checked={item.checked}
            >
              {item.checked ? <CheckBox fontSize="small" color="success" /> : <CheckBoxOutlineBlank fontSize="small" color="action" />}
              <Typography variant="caption">
                {item.name}
                {item.checked && item.completed_at && ` — ${firstName(item.completed_by_name)}, ${shortTime(item.completed_at)}`}
              </Typography>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Paper>
  )
}
