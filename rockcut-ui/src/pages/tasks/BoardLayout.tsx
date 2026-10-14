import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import { FUTURE, UNFINISHED, type PhoneView } from '../../lib/tasks'
import PhoneDayView from './PhoneDayView'
import PhoneVerticalView from './PhoneVerticalView'

interface Props {
  /** The range's days, in order. */
  days: string[]
  showUnfinished: boolean
  /** Each list's rendering by container id: the days, UNFINISHED and FUTURE. */
  lists: Record<string, ReactNode>
  /** Phone width: the phone view; null on a wider screen. */
  phoneView: PhoneView | null
  /** Wide enough for nine columns. */
  wide: boolean
  /** Phone one-day view: the strip's stops, the one showing, today, and the open counts. */
  stops: string[]
  selected: string
  today: string
  onSelect: (stop: string) => void
  openCount: (stop: string) => number
}

/**
 * The board's arrangement (D38 §3.8, D39 phone views), shared by a board and
 * the All departments view (D41): nine columns when wide (Unfinished, seven
 * days a row, Future), stacked when narrower, and at phone width every day
 * stacked or one day at a time.
 */
export default function BoardLayout({ days, showUnfinished, lists, phoneView, wide, stops, selected, today, onSelect, openCount }: Props) {
  if (phoneView === 'vertical') return <PhoneVerticalView days={days} showUnfinished={showUnfinished} lists={lists} today={today} />
  if (phoneView === 'day')
    return (
      <PhoneDayView
        stops={stops}
        selected={selected}
        today={today}
        onSelect={onSelect}
        openCount={openCount}
        showUnfinished={showUnfinished}
        lists={lists}
      />
    )
  const rows = Math.ceil(days.length / 7)
  const lead = showUnfinished && wide ? 1 : 0
  const columns = days.map((d, i) => (
    <Box key={d} sx={{ gridColumn: lead + (i % 7) + 1, gridRow: Math.floor(i / 7) + 1, minWidth: 0 }}>
      {lists[d]}
    </Box>
  ))
  if (wide) {
    // Unfinished first and Future last, as side columns spanning every row.
    return (
      <Box
        data-testid="board-grid"
        data-layout="wide"
        sx={{
          display: 'grid',
          gap: 1,
          alignItems: 'start',
          gridTemplateColumns: `${showUnfinished ? 'minmax(150px, 1fr) ' : ''}repeat(7, minmax(120px, 1fr)) minmax(150px, 1fr)`,
          overflowX: 'auto',
          pb: 1,
        }}
      >
        {showUnfinished && <Box sx={{ gridColumn: 1, gridRow: `1 / span ${rows}` }}>{lists[UNFINISHED]}</Box>}
        {columns}
        <Box sx={{ gridColumn: lead + 8, gridRow: `1 / span ${rows}` }}>{lists[FUTURE]}</Box>
      </Box>
    )
  }
  // Too narrow for nine columns: Unfinished above the days, Future below.
  return (
    <Box data-testid="board-grid" data-layout="stacked" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {showUnfinished && lists[UNFINISHED]}
      <Box sx={{ display: 'grid', gap: 1, alignItems: 'start', gridTemplateColumns: 'repeat(7, minmax(160px, 1fr))', overflowX: 'auto', pb: 1 }}>
        {columns}
      </Box>
      {lists[FUTURE]}
    </Box>
  )
}
