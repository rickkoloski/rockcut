import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, ListSubheader, Menu, MenuItem, Typography, useMediaQuery } from '@mui/material'
import api from '../../../lib/api'
import PageHeader from '../../../components/PageHeader'
import { useApiQuery } from '../../../hooks/useApiQuery'
import useAuth from '../../../hooks/useAuth'
import { coloradoToday } from '../../../lib/tasks'
import {
  buildParts,
  clampRange,
  dayLabel,
  dayWidth,
  daysBetween,
  defaultRange,
  expandMode,
  layoutRows,
  rangeForZoom,
  readPrefs,
  rowKey,
  shiftRange,
  STEP_ROW_H,
  STEP_ROW_H_FINE,
  writePref,
  type ExpandMode,
  type Part,
  type Range,
  type Zoom,
} from '../../../lib/gantt'
import { prodError, prodPath, scheduleKey, shortPeriod, type Outage, type Schedule, type SchedStep, type Tank } from '../../../lib/production'
import OutageDialog from '../OutageDialog'
import BatchDialog from './BatchDialog'
import CipAddDialog from './CipAddDialog'
import FlagsDialog from './FlagsDialog'
import GanttGrid, { HEAD_H, LEFT_W, LEFT_W_COMPACT } from './GanttGrid'
import GanttLegend from './GanttLegend'
import GanttToolbar from './GanttToolbar'
import PlanBatchDialog from './PlanBatchDialog'
import StepDialog from './StepDialog'
import TankPanel from './TankPanel'
import { FlowsProvider } from './flows'
import { useFlows } from './flowsContext'
import { useTimelineDrag } from './useTimelineDrag'

type Open =
  | { kind: 'plan'; tankId: number | null; day: string }
  | { kind: 'cip'; tankId: number | null; day: string }
  | { kind: 'flags' }
  | { kind: 'tank'; tankId: number }
  | { kind: 'outage'; tankId: number; outage: Outage | null; fromPanel: boolean; day?: string }
  | null

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const daysWord = (d: number) => `${plural(Math.abs(d), 'day')} ${d > 0 ? 'later' : 'earlier'}`

/**
 * D47 §3.6 Brewery → Production (`/brewery/production`): the tank schedule.
 * One request loads the range (refetched on focus and every minute); the
 * view (range, zoom, names-only column, expanded tanks) is remembered per
 * person in this browser (plan decision 6).
 */
export default function GanttPage() {
  return (
    <FlowsProvider>
      <GanttScreen />
    </FlowsProvider>
  )
}

function GanttScreen() {
  const flows = useFlows()
  // The grid scrolls under a drag near its edges (D48), below the date header and right of the tank column.
  const scroller = useRef<HTMLDivElement>(null)
  const drag = useTimelineDrag({ scroller, insets: () => ({ top: HEAD_H + 1, left: leftW }) })
  const userId = useAuth((s) => s.user?.id) ?? 'anon'
  const phone = useMediaQuery('(max-width:559.95px)')
  // Compact step rows with a mouse; a finger (the tablet, phones) keeps 28 px (D48 §3.6, P121).
  const fine = useMediaQuery('(pointer: fine)') && !phone
  const stepRowH = fine ? STEP_ROW_H_FINE : STEP_ROW_H
  const today = coloradoToday()
  const [prefs] = useState(() => readPrefs(userId, phone))
  const [range, setRangeState] = useState<Range>(() => prefs.range ?? defaultRange(today, prefs.zoom))
  const [zoom, setZoomState] = useState<Zoom>(prefs.zoom)
  const [compact, setCompactState] = useState(prefs.collapsed)
  const [expanded, setExpandedState] = useState(() => new Set(prefs.expanded))
  const [mix, setMixState] = useState(() => new Set(prefs.mix))
  // Bumped by Today so it scrolls even when the range is unchanged (D48 §3.6, the D47 no-op).
  const [todayTick, setTodayTick] = useState(0)

  const setRange = (r: Range) => {
    const next = clampRange(r)
    setRangeState(next)
    writePref(userId, 'range', next)
  }
  const setZoom = (z: Zoom) => {
    setZoomState(z)
    writePref(userId, 'zoom', z)
    setRange(rangeForZoom(range, z))
  }
  const setCompact = (c: boolean) => {
    setCompactState(c)
    writePref(userId, 'collapsed', c)
  }
  const setExpanded = (keys: Set<string>) => {
    setExpandedState(keys)
    writePref(userId, 'expanded', [...keys])
  }
  const setMix = (keys: Set<string>) => {
    setMixState(keys)
    writePref(userId, 'mix', [...keys])
  }

  const { data, isLoading, error } = useApiQuery<Schedule>(
    scheduleKey(range.from, range.to),
    prodPath('schedule'),
    { from: range.from, to: range.to },
    { refetchInterval: 60_000, refetchOnWindowFocus: true, placeholderData: (prev) => prev },
  )

  // The timeline's width sets the pixels per day for the zoom.
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
  const rows = useMemo(() => (data ? layoutRows(data.tanks, parts, data.cips, expanded, stepRowH) : []), [data, parts, expanded, stepRowH])
  const rowKeys = rows.map((r) => rowKey(r.tank))
  // The switch reads the tanks, which have carets; Expand all opens Unassigned too.
  const tankKeys = rows.flatMap((r) => (r.tank ? [rowKey(r.tank)] : []))

  // Scroll a week before today to the left edge when the range or zoom changes, and on every Today.
  useEffect(() => {
    const el = scroller.current
    if (!el || !data) return
    const at = daysBetween(range.from, data.today)
    if (at >= 0 && at < days) el.scrollLeft = Math.max(0, at * dayPx - 7 * dayPx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, zoom, !!data, todayTick])

  const goToday = () => {
    setRange(defaultRange(data?.today ?? today, zoom))
    setTodayTick((t) => t + 1)
  }

  // ── Dialogs (§3.5–§3.10). The step dialog can sit over the batch dialog. ──
  const [open, setOpen] = useState<Open>(null)
  const [batchOpen, setBatchOpen] = useState<{ id: number; flags: boolean } | null>(null)
  const [stepOpen, setStepOpen] = useState<number | null>(null)
  const [spot, setSpot] = useState<{ tank: Tank | null; day: string; x: number; y: number } | null>(null)

  const findStep = (id: number): SchedStep | undefined =>
    data?.cips.find((c) => c.id === id) ?? data?.batches.flatMap((b) => b.steps).find((s) => s.id === id)
  const openStep = stepOpen != null ? findStep(stepOpen) : undefined
  const openBatch = batchOpen ? data?.batches.find((b) => b.id === batchOpen.id) : undefined
  const tankById = (id: number) => data?.tanks.find((t) => t.id === id)

  // What's planned in a tank on some days, for the out-of-service dialog (P6).
  const plannedIn = (tankId: number) => (from: string, to: string | null) =>
    parts
      .filter((p) => p.tankId === tankId && p.end >= from && (!to || p.start <= to))
      .map((p) => `${p.batch.label} · ${shortPeriod({ starts_on: p.start, ends_on: p.end })}`)

  const report = (r: { ok: boolean; error?: string }) => {
    if (!r.ok && r.error) flows.notify(r.error)
  }

  const handlers = {
    onStep: (s: SchedStep) => setStepOpen(s.id),
    onCip: (s: SchedStep) => setStepOpen(s.id),
    onBar: (p: Part, flags?: boolean) => setBatchOpen({ id: p.batch.id, flags: !!flags }),
    onBand: (t: Tank, o: Outage) => setOpen({ kind: 'outage', tankId: t.id, outage: o, fromPanel: false }),
    onTankMenu: (t: Tank) => setOpen({ kind: 'tank', tankId: t.id }),
    onSpot: (tank: Tank | null, day: string, at: { x: number; y: number }) => setSpot({ tank, day, ...at }),
    onMoveStep: (s: SchedStep, days: number) => void flows.moveSteps([s.id], days),
    onMoveCip: async (c: SchedStep, days: number) =>
      report(await flows.write(() => api.post(prodPath('steps', 'move'), { ids: [c.id], days }), `CIP & Sanitize moved ${daysWord(days)}.`)),
    onShiftBar: async (p: Part, days: number) =>
      report(
        await flows.write<{ moved: number; kept: number }>(
          () => api.post(prodPath('batches', p.batch.id, 'shift'), { days }),
          (d) =>
            d.kept
              ? `${plural(d.moved, 'unfinished step')} ${daysWord(days)} (finished steps keep their dates).`
              : `${p.batch.label}: every step ${daysWord(days)}.`,
        ),
      ),
    onMoveBar: async (p: Part, tankId: number | null) =>
      report(
        await flows.write(
          () => api.patch(prodPath('batches', p.batch.id, 'vessels', p.vessel), { tank_id: tankId }),
          `${p.batch.label}${p.vessel ? ' (after transfer)' : ''} → ${tankId ? (tankById(tankId)?.name ?? 'tank') : 'Unassigned'}.`,
        ),
      ),
  }

  // A caret makes the open tanks the person's own mix, unless it opened or closed them all (P119).
  const toggleRow = (key: string) => {
    const next = new Set(expanded)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setExpanded(next)
    if (expandMode(tankKeys, next) === 'mine') setMix(new Set(tankKeys.filter((k) => next.has(k))))
  }
  const pickExpandMode = (m: ExpandMode) => {
    if (m === 'expand') setExpanded(new Set(rowKeys))
    else if (m === 'collapse') setExpanded(new Set())
    else if (mix.size) setExpanded(new Set(mix))
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
        onToday={goToday}
        onZoom={setZoom}
        expandMode={expandMode(tankKeys, expanded)}
        hasMix={mix.size > 0}
        onExpandMode={pickExpandMode}
        onFlags={() => setOpen({ kind: 'flags' })}
        onPlan={() => setOpen({ kind: 'plan', tankId: null, day: data?.today ?? today })}
        onAddCip={() => setOpen({ kind: 'cip', tankId: null, day: data?.today ?? today })}
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
            drag={drag}
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
            stepRowH={stepRowH}
            onToggleRow={toggleRow}
            onToggleCompact={() => setCompact(!compact)}
          />
        ) : null}
      </Box>
      {data && <GanttLegend phases={data.phases} />}

      <Menu
        open={!!spot}
        onClose={() => setSpot(null)}
        anchorReference="anchorPosition"
        anchorPosition={spot ? { top: spot.y, left: spot.x } : undefined}
        data-testid="gantt-spot-menu"
      >
        <ListSubheader sx={{ lineHeight: '32px' }}>{spot && `${spot.tank?.name ?? 'Unassigned'} · ${dayLabel(spot.day)}`}</ListSubheader>
        <MenuItem
          onClick={() => {
            setOpen({ kind: 'plan', tankId: spot!.tank?.id ?? null, day: spot!.day })
            setSpot(null)
          }}
          data-testid="spot-plan"
        >
          Plan a batch
        </MenuItem>
        {spot?.tank && (
          <MenuItem
            onClick={() => {
              setOpen({ kind: 'cip', tankId: spot.tank!.id, day: spot.day })
              setSpot(null)
            }}
            data-testid="spot-cip"
          >
            Add CIP & Sanitize
          </MenuItem>
        )}
        {spot?.tank && (
          <MenuItem
            onClick={() => {
              setOpen({ kind: 'outage', tankId: spot.tank!.id, outage: null, fromPanel: false, day: spot.day })
              setSpot(null)
            }}
            data-testid="spot-outage"
          >
            Mark out of service
          </MenuItem>
        )}
      </Menu>

      {data && open?.kind === 'plan' && <PlanBatchDialog tanks={data.tanks} initialTankId={open.tankId} initialDay={open.day} onClose={() => setOpen(null)} />}
      {data && open?.kind === 'cip' && <CipAddDialog tanks={data.tanks} initialTankId={open.tankId} initialDay={open.day} today={data.today} onClose={() => setOpen(null)} />}
      {data && open?.kind === 'flags' && <FlagsDialog flags={data.flags} onClose={() => setOpen(null)} />}
      {open?.kind === 'tank' && tankById(open.tankId) && (
        <TankPanel tank={tankById(open.tankId)!} onOpen={(o) => setOpen({ kind: 'outage', tankId: open.tankId, outage: o, fromPanel: true })} onClose={() => setOpen(null)} />
      )}
      {open?.kind === 'outage' && tankById(open.tankId) && (
        <OutageDialog
          tank={tankById(open.tankId)!}
          outage={open.outage}
          day={open.day}
          plannedIn={plannedIn(open.tankId)}
          onClose={() => setOpen(open.fromPanel ? { kind: 'tank', tankId: open.tankId } : null)}
          onSaved={async (message, token) => {
            setOpen(open.fromPanel ? { kind: 'tank', tankId: open.tankId } : null)
            await flows.saved(message, token)
          }}
        />
      )}
      {data && batchOpen && openBatch && (
        <BatchDialog
          batch={openBatch}
          tanks={data.tanks}
          flags={data.flags}
          today={data.today}
          types={data.step_types}
          phases={data.phases}
          brewers={data.brewers}
          focusFlags={batchOpen.flags}
          onOpenStep={(s) => setStepOpen(s.id)}
          onClose={() => setBatchOpen(null)}
        />
      )}
      {data && openStep && (
        <StepDialog
          key={openStep.id}
          step={openStep}
          batch={openStep.batch_id ? (data.batches.find((b) => b.id === openStep.batch_id) ?? null) : null}
          tanks={data.tanks}
          brewers={data.brewers}
          today={data.today}
          onClose={() => setStepOpen(null)}
        />
      )}
    </Box>
  )
}
