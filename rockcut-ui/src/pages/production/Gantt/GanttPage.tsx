import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Typography, useMediaQuery } from '@mui/material'
import PageHeader from '../../../components/PageHeader'
import { useApiQuery } from '../../../hooks/useApiQuery'
import useAuth from '../../../hooks/useAuth'
import { coloradoToday } from '../../../lib/tasks'
import {
  buildParts,
  clampRange,
  dayWidth,
  daysBetween,
  defaultRange,
  layoutRows,
  rangeAroundToday,
  readPrefs,
  rowKey,
  shiftRange,
  writePref,
  type Range,
  type Zoom,
} from '../../../lib/gantt'
import { prodError, prodPath, scheduleKey, type Schedule } from '../../../lib/production'
import GanttGrid, { LEFT_W, LEFT_W_COMPACT, type GanttActions } from './GanttGrid'
import GanttLegend from './GanttLegend'
import GanttToolbar from './GanttToolbar'

/**
 * D47 §3.6 Brewery → Production (`/brewery/production`): the tank schedule.
 * One request loads the range (refetched on focus and every minute); the
 * view (range, zoom, names-only column, expanded tanks) is remembered per
 * person in this browser (plan decision 6).
 */
export default function GanttPage({ actions, ...handlers }: GanttActions & { actions?: React.ReactNode }) {
  const userId = useAuth((s) => s.user?.id) ?? 'anon'
  const phone = useMediaQuery('(max-width:559.95px)')
  const today = coloradoToday()
  const [prefs] = useState(() => readPrefs(userId, phone))
  const [range, setRangeState] = useState<Range>(() => prefs.range ?? defaultRange(today))
  const [zoom, setZoomState] = useState<Zoom>(prefs.zoom)
  const [compact, setCompactState] = useState(prefs.collapsed)
  const [expanded, setExpandedState] = useState(() => new Set(prefs.expanded))

  const setRange = (r: Range) => {
    const next = clampRange(r)
    setRangeState(next)
    writePref(userId, 'range', next)
  }
  const setZoom = (z: Zoom) => {
    setZoomState(z)
    writePref(userId, 'zoom', z)
  }
  const setCompact = (c: boolean) => {
    setCompactState(c)
    writePref(userId, 'collapsed', c)
  }
  const setExpanded = (keys: Set<string>) => {
    setExpandedState(keys)
    writePref(userId, 'expanded', [...keys])
  }

  const { data, isLoading, error } = useApiQuery<Schedule>(
    scheduleKey(range.from, range.to),
    prodPath('schedule'),
    { from: range.from, to: range.to },
    { refetchInterval: 60_000, refetchOnWindowFocus: true, placeholderData: (prev) => prev },
  )

  // The timeline's width sets the pixels per day for the zoom.
  const scroller = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)
  useEffect(() => {
    const el = scroller.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [isLoading])

  const leftW = compact ? LEFT_W_COMPACT : LEFT_W
  const dayPx = dayWidth(Math.max(200, width - leftW - 2), zoom)
  const days = daysBetween(range.from, range.to) + 1

  const parts = useMemo(() => (data ? data.batches.flatMap(buildParts) : []), [data])
  const rows = useMemo(() => (data ? layoutRows(data.tanks, parts, data.cips, expanded) : []), [data, parts, expanded])

  // Scroll today into view when the range or zoom changes.
  useEffect(() => {
    const el = scroller.current
    if (!el || !data) return
    const at = daysBetween(range.from, data.today)
    if (at >= 0 && at < days) el.scrollLeft = Math.max(0, at * dayPx - 7 * dayPx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, zoom, !!data])

  const toggleRow = (key: string) => {
    const next = new Set(expanded)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setExpanded(next)
  }

  return (
    <Box>
      <PageHeader breadcrumbs={[{ label: 'Production' }]} title="Production" />
      <GanttToolbar
        range={range}
        zoom={zoom}
        flags={data?.flags ?? []}
        onRange={setRange}
        onShift={(d) => setRange(shiftRange(range, d))}
        onToday={() => setRange(rangeAroundToday(range, data?.today ?? today))}
        onZoom={setZoom}
        onExpandAll={() => setExpanded(new Set(rows.map((r) => rowKey(r.tank))))}
        onCollapseAll={() => setExpanded(new Set())}
        actions={actions}
      />
      {error && !data && (
        <Alert severity="error" data-testid="gantt-error">
          {prodError(error)}
        </Alert>
      )}
      <Box
        ref={scroller}
        sx={{
          position: 'relative',
          overflow: 'auto',
          maxHeight: { xs: '70vh', md: '72vh' },
          minHeight: 320,
          border: 1,
          borderColor: 'divider',
          borderRadius: 2.5,
          bgcolor: 'background.paper',
          overscrollBehavior: 'contain',
        }}
        data-testid="gantt"
        data-compact={compact || undefined}
      >
        {isLoading && !data ? (
          <Typography variant="body2" sx={{ p: 2 }}>
            Loading…
          </Typography>
        ) : data ? (
          <GanttGrid
            {...handlers}
            from={range.from}
            days={days}
            dayPx={dayPx}
            today={data.today}
            rows={rows}
            phases={data.phases}
            statuses={data.statuses}
            flags={data.flags}
            compact={compact}
            expanded={expanded}
            onToggleRow={toggleRow}
            onToggleCompact={() => setCompact(!compact)}
          />
        ) : null}
      </Box>
      {data && <GanttLegend phases={data.phases} />}
    </Box>
  )
}
