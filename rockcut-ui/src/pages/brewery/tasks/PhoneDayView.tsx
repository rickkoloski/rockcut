import { useEffect, useRef, type ReactNode, type TouchEvent } from 'react'
import { Box, ButtonBase, IconButton, Tooltip, Typography } from '@mui/material'
import { ChevronLeft, ChevronRight } from '@mui/icons-material'
import { useDragActive } from '../../../components/dnd/dragActive'
import { FUTURE, UNFINISHED, formatTaskDay } from '../../../lib/breweryTasks'

interface Props {
  /** The range's days, then FUTURE: the strip's stops in order. */
  stops: string[]
  selected: string
  today: string
  onSelect: (stop: string) => void
  /** Open tasks in a list, following the filter. */
  openCount: (stop: string) => number
  showUnfinished: boolean
  /** The rendered lists from SortableLists, by container id. */
  lists: Record<string, ReactNode>
}

/** A horizontal swipe at least this long (px), and mostly sideways, changes day. */
const SWIPE_PX = 60

/**
 * D38 §3.8 phone width: one day at a time. A strip of the range's days with
 * their open counts, ending in a Future stop; arrows and a sideways swipe move
 * along it. The Unfinished card shows on today only. A swipe never fires
 * after a long press has lifted a task (§3.7).
 */
export default function PhoneDayView({ stops, selected, today, onSelect, openCount, showUnfinished, lists }: Props) {
  const index = stops.indexOf(selected)
  const go = (step: 1 | -1) => {
    const next = stops[index + step]
    if (next) onSelect(next)
  }

  // Keep the selected stop in view in the strip.
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>(`[data-stop="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selected])

  // Swipe: where the touch started, and whether a drag happened during it.
  const dragging = useDragActive()
  const gesture = useRef<{ x: number; y: number; dragged: boolean } | null>(null)
  useEffect(() => {
    if (dragging && gesture.current) gesture.current.dragged = true
  }, [dragging])
  const onTouchStart = (e: TouchEvent<HTMLElement>) => {
    const t = e.touches[0]
    // One finger, on the day itself (not in a menu or dialog portalled from it).
    gesture.current =
      e.touches.length === 1 && e.currentTarget.contains(e.target as Node) ? { x: t.clientX, y: t.clientY, dragged: dragging } : null
  }
  const onTouchEnd = (e: TouchEvent<HTMLElement>) => {
    const g = gesture.current
    gesture.current = null
    if (!g || g.dragged || dragging) return
    const t = e.changedTouches[0]
    const dx = t.clientX - g.x
    const dy = t.clientY - g.y
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > 2 * Math.abs(dy)) go(dx < 0 ? 1 : -1)
  }

  return (
    <Box data-testid="board-grid" data-layout="phone" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Tooltip title="Previous day">
          <span>
            <IconButton size="small" aria-label="Previous day" disabled={index <= 0} onClick={() => go(-1)} data-testid="phone-prev-day">
              <ChevronLeft />
            </IconButton>
          </span>
        </Tooltip>
        <Box
          ref={strip}
          role="tablist"
          aria-label="Days"
          data-testid="phone-strip"
          sx={{ flex: 1, minWidth: 0, display: 'flex', gap: 0.5, overflowX: 'auto', py: 0.5, scrollbarWidth: 'none' }}
        >
          {stops.map((stop) => {
            const isSelected = stop === selected
            const isToday = stop === today
            const label = stop === FUTURE ? 'Future' : formatTaskDay(stop)
            const [weekday, date] = stop === FUTURE ? ['Future', ''] : label.split(' ')
            const count = openCount(stop)
            return (
              <ButtonBase
                key={stop}
                role="tab"
                aria-selected={isSelected}
                aria-label={`${label}${isToday ? ', today' : ''}, ${count} open`}
                data-stop={stop}
                data-testid={stop === FUTURE ? 'phone-stop-future' : `phone-stop-${stop}`}
                data-selected={isSelected}
                onClick={() => onSelect(stop)}
                sx={{
                  flex: '0 0 auto',
                  minWidth: 48,
                  px: 0.75,
                  py: 0.5,
                  borderRadius: 1,
                  border: 1,
                  borderColor: isSelected ? 'primary.main' : isToday ? 'primary.light' : 'divider',
                  bgcolor: isSelected ? 'primary.main' : 'background.paper',
                  color: isSelected ? 'primary.contrastText' : 'text.primary',
                  flexDirection: 'column',
                  lineHeight: 1.2,
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: isToday ? 700 : 500, lineHeight: 1.2 }}>
                  {weekday}
                </Typography>
                {date && (
                  <Typography variant="caption" sx={{ lineHeight: 1.2 }}>
                    {date}
                  </Typography>
                )}
                <Typography
                  variant="caption"
                  data-testid={stop === FUTURE ? 'phone-stop-count-future' : `phone-stop-count-${stop}`}
                  sx={{ lineHeight: 1.2, fontWeight: 700, opacity: count ? 1 : 0.6 }}
                >
                  {count}
                </Typography>
              </ButtonBase>
            )
          })}
        </Box>
        <Tooltip title="Next day">
          <span>
            <IconButton
              size="small"
              aria-label="Next day"
              disabled={index < 0 || index >= stops.length - 1}
              onClick={() => go(1)}
              data-testid="phone-next-day"
            >
              <ChevronRight />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      <Box
        role="tabpanel"
        data-testid="phone-day"
        data-stop={selected}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => (gesture.current = null)}
        // Sideways movement is ours (the swipe); up and down still scroll the page.
        sx={{ display: 'flex', flexDirection: 'column', gap: 1, touchAction: 'pan-y' }}
      >
        {showUnfinished && selected === today && lists[UNFINISHED]}
        {lists[selected]}
      </Box>
    </Box>
  )
}
