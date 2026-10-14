import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import { FUTURE, UNFINISHED } from '../../lib/tasks'

interface Props {
  /** The range's days, in order. */
  days: string[]
  showUnfinished: boolean
  /** The rendered lists from SortableLists, by container id. */
  lists: Record<string, ReactNode>
}

/**
 * D39 spec §3.8 "Phone width", the vertical view: the desktop board in one
 * column. The Unfinished card first (when there is one), each day with its
 * header, Daily card and tasks, then the Future list, so the order matches
 * the desktop's left to right. A long press drags a task between any of them;
 * the page scrolls while it's held near the top or bottom edge. There's no
 * sideways swipe here: the page scrolls up and down.
 */
export default function PhoneVerticalView({ days, showUnfinished, lists }: Props) {
  return (
    <Box data-testid="board-grid" data-layout="vertical" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {showUnfinished && lists[UNFINISHED]}
      {days.map((d) => (
        <Box key={d}>{lists[d]}</Box>
      ))}
      {lists[FUTURE]}
    </Box>
  )
}
