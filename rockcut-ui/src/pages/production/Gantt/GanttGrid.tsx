import { useLayoutEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { alpha, Box, IconButton, Tooltip, Typography, useTheme } from '@mui/material'
import { ChevronRight, CleaningServices, KeyboardDoubleArrowLeft, KeyboardDoubleArrowRight, MoreHoriz, WarningAmber } from '@mui/icons-material'
import { addDaysKey } from '../../../lib/datetime'
import { initials } from '../../../lib/tasks'
import {
  BAR_H,
  BAR_TOP,
  DOT,
  DOT_TOP,
  INITIALS_TOP,
  STEP_ROW_H,
  TRACK_H,
  badgeText,
  dayLabel,
  daysBetween,
  dotState,
  dragHint,
  type DragHint as DragHintT,
  isWeekend,
  maxKey,
  minKey,
  monthLabels,
  partDots,
  partFlags,
  partLabel,
  phaseAt,
  rowKey,
  segments,
  showInitials,
  type DotState,
  type Part,
  type Row,
} from '../../../lib/gantt'
import {
  CIP_COLOR,
  headlineOutage,
  phaseFill,
  shortPeriod,
  type ConditionMark,
  type Flag,
  type Mode,
  type Outage,
  type Phase,
  type SchedStep,
  type Tank,
  type TankStatusLine,
} from '../../../lib/production'
import type { DropInfo, DragState } from './useTimelineDrag'

export const LEFT_W = 240
export const LEFT_W_COMPACT = 124
/** The date header, sticky over the grid (D48: drags auto-scroll below it). */
export const HEAD_H = 46

/** What a click (or Enter) on the Gantt opens, and what a drag does (§3.6 interactions). */
/** D48: how a step was clicked: Ctrl/Cmd toggles it in the selection, Shift selects a range in its tank. */
export interface StepClick {
  toggle?: boolean
  range?: boolean
}

export interface GanttActions {
  onStep?: (step: SchedStep, click?: StepClick) => void
  /** D48: a long-press let go without moving (touch): selection mode, starting with it. */
  onHoldStep?: (step: SchedStep) => void
  onBar?: (part: Part, flags?: boolean) => void
  onCip?: (cip: SchedStep) => void
  onBand?: (tank: Tank, outage: Outage) => void
  /** Tank ⋯: its out-of-service panel. */
  onTankMenu?: (tank: Tank) => void
  /** A tap on an empty spot: the row's tank (null = Unassigned), the day, where. */
  onSpot?: (tank: Tank | null, day: string, at: { x: number; y: number }) => void
  /** `only`: Shift held at the drop (D48, P113: move only, no prompt). */
  onMoveStep?: (step: SchedStep, days: number, only?: boolean) => void
  onShiftBar?: (part: Part, days: number) => void
  onMoveBar?: (part: Part, tankId: number | null) => void
  onMoveCip?: (cip: SchedStep, days: number) => void
}

/** The drag layer (`useTimelineDrag`), passed in by the page. */
export interface GanttDrag {
  active: DragState | null
  bind: (key: string, onDrop: (d: DropInfo) => void, onHold?: () => void) => object
  consumeClick: (e?: { clientX: number; clientY: number }) => boolean
  /** From a drag's start until the pointer moves after it: hover tooltips stay hidden (N2). */
  quiet?: boolean
}

interface Props extends GanttActions {
  drag?: GanttDrag
  from: string
  days: number
  dayPx: number
  today: string
  rows: Row[]
  phases: Phase[]
  statuses: TankStatusLine[]
  flags: Flag[]
  compact: boolean
  expanded: Set<string>
  /** An expanded tank's step rows: 20 px with a mouse, 28 px on touch (D48 §3.6). */
  stepRowH?: number
  onToggleRow: (key: string) => void
  onToggleCompact: () => void
  /** D48: the selected steps (multi-select), drawn ringed and dragged together. */
  selected?: Set<number>
  /** D48: tanks' clean / dirty marks, drawn on their day. */
  marks?: ConditionMark[]
}

const STATE_WORDS: Record<DotState, string> = { done: 'done', late: 'late', stranded: 'after the tank was emptied', today: 'due today', planned: 'planned' }

/** Enter (or Space) on a focusable Gantt element opens it, as a click does (not the click that ends a drag). */
const activate = (fn?: () => void, drag?: GanttDrag) => ({
  role: 'button',
  tabIndex: 0,
  onClick: fn
    ? (e: MouseEvent) => {
        e.stopPropagation()
        if (!drag?.consumeClick(e)) fn()
      }
    : undefined,
  onKeyDown: (e: KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && fn) {
      e.preventDefault()
      fn()
    }
  },
})

/** D48: a step's click and Enter: the modifiers say whether it selects instead of opening. */
const activateStep = (step: SchedStep, fn: GanttActions['onStep'], drag?: GanttDrag) => ({
  role: 'button',
  tabIndex: 0,
  onClick: fn
    ? (e: MouseEvent) => {
        e.stopPropagation()
        if (!drag?.consumeClick(e)) fn(step, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey })
      }
    : undefined,
  onKeyDown: (e: KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && fn) {
      e.preventDefault()
      // Ctrl/Cmd+Space toggles it in the selection (QA minor 11).
      fn(step, e.key === ' ' && (e.ctrlKey || e.metaKey) ? { toggle: true } : undefined)
    }
  },
})

/**
 * The drag hint, beside the pointer and inside the window (N3): below-right
 * of a mouse, flipped left near the right edge and above near the bottom;
 * above a finger, below it near the top. Placed after measuring itself.
 */
function HintBox({ hint, at }: { hint: DragHintT; at: DragState }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const M = 8
    const [vw, vh] = [window.innerWidth, window.innerHeight]
    const { width: w, height: h } = el.getBoundingClientRect()
    let left: number
    let top: number
    if (at.touch) {
      left = at.x - w / 2
      top = at.y - 48 - h
      if (top < M) top = at.y + 48
    } else {
      left = at.x + 14
      if (left + w > vw - M) left = at.x - 14 - w
      top = at.y + 18
      if (top + h > vh - M) top = at.y - 18 - h
    }
    el.style.left = `${Math.max(M, Math.min(left, vw - w - M))}px`
    el.style.top = `${Math.max(M, Math.min(top, vh - h - M))}px`
  })
  return (
    <Box
      ref={ref}
      role="status"
      sx={{
        position: 'fixed',
        left: 0,
        top: 0,
        maxWidth: 'min(440px, calc(100vw - 16px))',
        zIndex: 1500,
        pointerEvents: 'none',
        borderRadius: 1,
        overflow: 'hidden',
        fontSize: 12,
        fontWeight: 600,
        boxShadow: 3,
        '& > div': { px: 1, py: 0.5 },
      }}
      data-testid="gantt-drag-hint"
      data-warn={hint.warn || undefined}
    >
      <Box sx={{ bgcolor: hint.warn ? 'error.main' : 'grey.900', color: hint.warn ? 'error.contrastText' : 'common.white' }} data-testid="gantt-drag-hint-text">
        {hint.text}
      </Box>
      {/* Only with the other answer: neutral, not an error (lead decisions 6). */}
      {hint.note && (
        <Box sx={{ bgcolor: 'grey.800', color: 'common.white', fontWeight: 500 }} data-testid="gantt-drag-hint-note">
          {hint.note}
        </Box>
      )}
    </Box>
  )
}

/**
 * D47 §3.6 the grid: a sticky tank column and date header over day columns;
 * per tank, its parts as bars colored by phase (planned ones ghosted), the
 * dots under them with initials, standalone CIP blocks, out-of-service
 * bands and flag badges, stacked on tracks so nothing overlaps; an
 * expanded tank lists every step as a diamond with its links. Transfer
 * arrows join a batch's parts across rows.
 */
export default function GanttGrid(props: Props) {
  const { from, days, dayPx, today, rows, phases, statuses, flags, compact, expanded, onToggleRow, onToggleCompact, drag } = props
  const stepRowH = props.stepRowH ?? STEP_ROW_H
  const tight = stepRowH < STEP_ROW_H
  const innerRef = useRef<HTMLDivElement>(null)
  const theme = useTheme()
  const mode = theme.palette.mode as Mode
  const leftW = compact ? LEFT_W_COMPACT : LEFT_W
  const width = days * dayPx
  const totalH = rows.reduce((h, r) => h + r.height, 0)
  const to = addDaysKey(from, days - 1)
  const phaseById = useMemo(() => new Map(phases.map((p) => [p.id, p])), [phases])
  const statusOf = useMemo(() => new Map(statuses.map((s) => [s.tank_id, s])), [statuses])
  const phaseFns = useMemo(() => {
    const m = new Map<number, (day: string) => number | null>()
    for (const r of rows) for (const p of r.parts) if (!m.has(p.batch.id)) m.set(p.batch.id, phaseAt(p.batch))
    return m
  }, [rows])
  const cipHatch = mode === 'dark' ? CIP_COLOR.dark : CIP_COLOR.light
  const col = (key: string) => daysBetween(from, key)
  const x = (key: string) => col(key) * dayPx
  const surface2 = theme.palette.background.boardColumn ?? theme.palette.background.default

  // ── Drags ──
  // Hover tooltips step aside for the drag hint (N2).
  const hover = (title: string) => (drag?.quiet ? '' : title)
  const snap = (dx: number) => Math.round(dx / dayPx)
  // D48: dragging a selected step lifts every selected one with it.
  const selected = props.selected ?? new Set<number>()
  const activeStep = drag?.active && /^(dot|dia):/.test(drag.active.key) ? Number(drag.active.key.split(':')[1]) : null
  const groupDrag = activeStep != null && selected.has(activeStep)
  const lifted = (key: string, vertical = false) => {
    const a = drag?.active
    const id = /^(dot|dia):/.test(key) ? Number(key.split(':')[1]) : null
    if (!a || (a.key !== key && !(groupDrag && id != null && selected.has(id)))) return {}
    return {
      transform: `translate(${snap(a.dx) * dayPx}px, ${vertical ? a.dy : 0}px)`,
      zIndex: 6,
      opacity: 0.9,
      boxShadow: '0 4px 14px rgba(0,0,0,.25)',
      cursor: 'grabbing',
    }
  }
  // A drop runs the handler bound when the drag began; a refetch during the
  // drag (someone else adding a tank) can change the rows, so the drop reads
  // the latest layout and compares rows by tank id (P32 on DEV).
  const rowsRef = useRef(rows)
  useLayoutEffect(() => {
    rowsRef.current = rows
  }, [rows])
  /** The row under a pointer (client y), from the latest layout (or `among`). */
  const rowAt = (clientY: number, among: Row[] = rowsRef.current): Row | null => {
    const el = innerRef.current
    if (!el) return null
    const y = clientY - el.getBoundingClientRect().top - HEAD_H - 1
    return among.find((r) => y >= r.top && y < r.top + r.height) ?? null
  }
  /** Dropped over the day columns (not the tank column, the header or outside the chart)? Otherwise the drag is cancelled. */
  const overChart = (d: { x: number; y: number }) => {
    const box = innerRef.current?.parentElement?.getBoundingClientRect()
    return !!box && d.x >= box.left + leftW && d.x < box.right && d.y >= box.top + HEAD_H && d.y < box.bottom
  }
  const dropRow =
    drag?.active && drag.active.key.startsWith('bar:') && Math.abs(drag.active.dy) > TRACK_H / 2 ? rowAt(drag.active.y, rows) : null
  const bindDrag = (key: string, onDrop: (d: DropInfo) => void, enabled = true, onHold?: () => void) =>
    drag && enabled ? drag.bind(key, onDrop, onHold) : {}
  const ring = (id: number) => (selected.has(id) ? { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 } : {})

  // The tooltip that follows the pointer: where it goes, and in red why it'd be refused or flagged.
  const hint = (() => {
    const a = drag?.active
    if (!a) return null
    const kind = a.key.slice(0, a.key.indexOf(':'))
    const id = a.key.slice(a.key.indexOf(':') + 1)
    const parts = rows.flatMap((r) => r.parts)
    const base = { days: snap(a.dx), over: overChart(a), tanks: rows.flatMap((r) => (r.tank ? [r.tank] : [])), parts }
    if (kind === 'bar') {
      const part = parts.find((p) => p.key === id)
      if (!part) return null
      const moved = dropRow && rowKey(dropRow.tank) !== (part.tankId == null ? 'unassigned' : String(part.tankId))
      return dragHint({ ...base, kind: 'bar', part, toRow: moved ? dropRow.tank : undefined })
    }
    if (kind === 'dot') {
      const part = parts.find((p) => p.steps.some((s) => s.id === Number(id)))
      const step = part?.steps.find((s) => s.id === Number(id))
      return step ? dragHint({ ...base, kind: 'dot', part, step }) : null
    }
    const cip = rows.flatMap((r) => r.cips).find((c) => c.id === Number(id))
    return cip ? dragHint({ ...base, kind: 'cip', step: cip }) : null
  })()

  const fillColor = (fill: number | 'cip' | null) => {
    if (fill === 'cip') return `repeating-linear-gradient(135deg, ${cipHatch} 0 4px, transparent 4px 8px)`
    const phase = fill != null ? phaseById.get(fill) : undefined
    return phase ? phaseFill(phase.color, mode).bg : alpha(theme.palette.text.secondary, 0.25)
  }

  const dotSx = (state: DotState) => ({
    done: { bgcolor: 'primary.main', borderColor: 'primary.main' },
    late: { bgcolor: alpha(theme.palette.error.main, 0.18), borderColor: 'error.main' },
    stranded: { bgcolor: alpha(theme.palette.error.main, 0.18), borderColor: 'error.main' },
    today: { bgcolor: 'background.paper', borderColor: 'primary.main', boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.3)}` },
    planned: { bgcolor: 'background.paper', borderColor: 'text.secondary' },
  })[state]

  // ── Pieces ──

  const header = (
    <Box sx={{ position: 'sticky', top: 0, zIndex: 9, display: 'flex', bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
      <Box
        sx={{
          position: 'sticky',
          left: 0,
          zIndex: 10,
          width: leftW,
          flex: 'none',
          bgcolor: surface2,
          borderRight: 1,
          borderColor: 'divider',
          px: 1,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          pb: 0.5,
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'text.secondary' }}>
          Tanks
        </Typography>
        <Tooltip title={compact ? 'Show status' : 'Names only'}>
          <IconButton size="small" onClick={onToggleCompact} aria-label={compact ? 'Show the tank status column' : 'Show tank names only'} data-testid="gantt-compact">
            {compact ? <KeyboardDoubleArrowRight fontSize="small" /> : <KeyboardDoubleArrowLeft fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ position: 'relative', flex: 'none', width, height: HEAD_H }} data-testid="gantt-dates">
        {monthLabels(from, days).map((m) => (
          <Typography key={m.index} variant="caption" sx={{ position: 'absolute', top: 2, left: m.index * dayPx + 4, fontWeight: 600, color: 'text.secondary', whiteSpace: 'nowrap' }}>
            {m.label}
          </Typography>
        ))}
        {Array.from({ length: days }, (_, i) => {
          const key = addDaysKey(from, i)
          const isToday = key === today
          // Every day when there's room, else Mondays (today then has its line only).
          if (dayPx < 16 && new Date(`${key}T12:00:00Z`).getUTCDay() !== 1) return null
          return (
            <Box
              key={key}
              sx={{
                position: 'absolute',
                top: 20,
                left: i * dayPx,
                width: Math.max(dayPx, 16),
                textAlign: 'center',
                fontSize: 11,
                lineHeight: 1.05,
                color: isToday ? 'primary.main' : 'text.secondary',
                fontWeight: isToday ? 700 : 400,
                fontVariantNumeric: 'tabular-nums',
              }}
              data-testid={isToday ? 'gantt-today-label' : undefined}
            >
              {Number(key.slice(8))}
              {dayPx >= 18 && <Box sx={{ fontSize: 10 }}>{dayLabel(key).slice(0, 1)}</Box>}
            </Box>
          )
        })}
      </Box>
    </Box>
  )

  // Weekends, day lines and the today line, under every row.
  const background = (
    <Box sx={{ position: 'absolute', top: HEAD_H + 1, left: leftW, width, height: totalH, pointerEvents: 'none', zIndex: 0 }}>
      {Array.from({ length: days }, (_, i) =>
        isWeekend(addDaysKey(from, i)) ? <Box key={i} sx={{ position: 'absolute', top: 0, bottom: 0, left: i * dayPx, width: dayPx, bgcolor: alpha(theme.palette.text.primary, 0.035) }} /> : null,
      )}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `linear-gradient(to right, ${alpha(theme.palette.divider, 0.6)} 1px, transparent 1px)`,
          backgroundSize: `${dayPx}px 100%`,
        }}
      />
      {today >= from && today <= to && (
        <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: x(today) + dayPx / 2 - 1, width: 2, bgcolor: 'primary.main', opacity: 0.75 }} data-testid="gantt-today-line" />
      )}
    </Box>
  )

  const tankHeader = (row: Row) => {
    const tank = row.tank
    const key = rowKey(tank)
    const open = expanded.has(key)
    if (!tank) {
      const n = row.parts.length
      return (
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14 }}>Unassigned</Typography>
          {!compact && (
            <Typography variant="caption" color="text.secondary" component="div" data-testid="gantt-unassigned-line">
              {n ? `${n} part${n === 1 ? '' : 's'} with no tank` : 'Drag a batch here to unassign it'}
            </Typography>
          )}
        </Box>
      )
    }
    const status = statusOf.get(tank.id)
    const out = headlineOutage(tank)
    const statusLine = (
      <Typography
        variant="caption"
        component="div"
        noWrap
        sx={{ color: status?.alert ? 'error.main' : status?.state === 'dirty' ? 'warning.main' : status?.state === 'in_use' ? 'text.primary' : 'text.secondary', fontWeight: status?.alert ? 600 : 400 }}
        data-testid={`gantt-status-${tank.id}`}
        title={status?.line}
      >
        {status?.line ?? ''}
      </Typography>
    )
    const name = (
      // One line: the name, then the batch (shortened when it doesn't fit).
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', minWidth: 0, flexWrap: 'nowrap', overflow: 'hidden' }}>
        <Typography
          sx={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: compact ? '1 1 auto' : '0 0 auto' }}
          title={compact ? undefined : tank.name}
          data-testid={`gantt-tank-name-${tank.id}`}
        >
          {tank.name}
        </Typography>
        {!compact && status?.batch_label && (
          <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, color: 'primary.main', minWidth: 0, flex: '0 1 auto' }} data-testid={`gantt-tank-batch-${tank.id}`}>
            · {status.batch_label}
          </Typography>
        )}
      </Box>
    )
    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', columnGap: 0.5, alignItems: 'start', minWidth: 0, pr: compact ? 0 : 3 }}>
        <IconButton
          size="small"
          sx={{ p: 0, width: 24, height: 24, '& svg': { transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'none' } }}
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${tank.name}`}
          onClick={() => onToggleRow(key)}
          data-testid={`gantt-caret-${tank.id}`}
        >
          <ChevronRight fontSize="small" />
        </IconButton>
        {compact ? (
          // Names only cuts long names: the tooltip starts with the full name.
          <Tooltip title={hover([tank.name, status?.batch_label, status?.line].filter(Boolean).join(' · '))} placement="right">
            {name}
          </Tooltip>
        ) : (
          name
        )}
        {!compact && props.onTankMenu && (
          <IconButton
            size="small"
            sx={{ position: 'absolute', top: 4, right: 4, p: 0.25 }}
            aria-label={`${tank.name}: out of service`}
            onClick={() => props.onTankMenu!(tank)}
            data-testid={`gantt-tank-menu-${tank.id}`}
          >
            <MoreHoriz fontSize="small" />
          </IconButton>
        )}
        {!compact && (
          <Box sx={{ gridColumn: 2, minWidth: 0, display: 'flex', gap: 0.75, alignItems: 'center' }}>
            {out && (
              <Box
                component="span"
                sx={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'error.main', bgcolor: alpha(theme.palette.error.main, 0.12), borderRadius: 0.5, px: 0.6, whiteSpace: 'nowrap', flex: 'none' }}
                data-testid={`gantt-out-tag-${tank.id}`}
              >
                Out {shortPeriod(out.outage)}
                {out.more ? ` +${out.more}` : ''}
              </Box>
            )}
            <Box sx={{ minWidth: 0, flex: 1 }}>{statusLine}</Box>
          </Box>
        )}
      </Box>
    )
  }

  const bands = (row: Row) =>
    (row.tank?.outages ?? [])
      .filter((o) => o.starts_on <= to && (!o.ends_on || o.ends_on >= from))
      .map((o) => {
        const start = maxKey(o.starts_on, from)
        const end = o.ends_on ? minKey(o.ends_on, to) : to
        const label = `Out of service ${o.label}${o.reason ? ` · ${o.reason}` : ''}`
        return (
          <Tooltip key={o.id} title={hover(label)}>
            <Box
              {...activate(props.onBand && row.tank ? () => props.onBand!(row.tank!, o) : undefined, drag)}
              aria-label={label}
              data-testid={`gantt-band-${o.id}`}
              sx={{
                position: 'absolute',
                top: 0,
                height: row.tracks * TRACK_H,
                left: x(start),
                width: (col(end) - col(start) + 1) * dayPx,
                zIndex: 1,
                cursor: props.onBand ? 'pointer' : 'default',
                background: `repeating-linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.14)} 0 6px, transparent 6px 12px)`,
                borderLeft: 2,
                borderRight: o.ends_on && o.ends_on <= to ? 2 : 0,
                borderColor: 'error.main',
                color: 'error.main',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '.04em',
                px: 0.75,
                pt: '2px',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: -2 },
              }}
            >
              Out{o.reason ? ` · ${o.reason}` : ''}
            </Box>
          </Tooltip>
        )
      })

  // D48 §3.8: a tank's clean / dirty marks, a small icon on their day.
  const marksIn = (row: Row) =>
    (props.marks ?? [])
      .filter((m) => row.tank && m.tank_id === row.tank.id && m.marked_on >= from && m.marked_on <= to)
      .map((m) => {
        const tip = `Marked ${m.state} by ${m.user_name ?? 'someone'} · ${dayLabel(m.marked_on)}${m.note ? ` · “${m.note}”` : ''}`
        const Icon = m.state === 'clean' ? CleaningServices : WarningAmber
        return (
          <Tooltip key={`mark-${m.id}`} title={hover(tip)}>
            <Box
              tabIndex={0}
              aria-label={tip}
              data-testid={`gantt-mark-${m.id}`}
              data-state={m.state}
              sx={{
                position: 'absolute',
                top: TRACK_H / 2 - 8,
                left: x(m.marked_on) + dayPx / 2 - 8,
                width: 16,
                height: 16,
                zIndex: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                bgcolor: 'background.paper',
                color: m.state === 'clean' ? 'success.main' : 'warning.main',
                boxShadow: `0 0 0 1px ${theme.palette.divider}`,
                '&:focus-visible': { outline: `2px solid ${theme.palette.text.primary}`, outlineOffset: 1 },
              }}
            >
              <Icon sx={{ fontSize: 12 }} />
            </Box>
          </Tooltip>
        )
      })

  const bar = (row: Row, part: Part) => {
    if (part.reach < from || part.start > to) return null
    const segs = segments(part, from, days, phaseFns.get(part.batch.id)!)
    // Only stranded dots in view (the bar ended before it): just the dots.
    const left = segs.length ? segs[0].from * dayPx : 0
    const right = segs.length ? (segs.at(-1)!.to + 1) * dayPx : 0
    const top = row.track.get(part)! * TRACK_H
    const myFlags = partFlags(part, flags)
    const badge = badgeText(myFlags)
    const cut = part.start < from
    const label = `${cut ? '‹ ' : ''}${partLabel(part)}`
    const textColor = mode === 'dark' ? '#F1F4EE' : '#172014'
    const showI = showInitials(dayPx)
    return (
      <Box key={part.key} sx={{ position: 'absolute', left: 0, top, width: '100%', height: TRACK_H, pointerEvents: 'none' }}>
        {segs.length > 0 && (
          <Tooltip title={hover(`${part.batch.label}${part.planned ? ' · planned' : ''} · ${dayLabel(part.start)} – ${dayLabel(part.end)}`)}>
            <Box
              {...activate(props.onBar ? () => props.onBar!(part) : undefined, drag)}
              {...bindDrag(`bar:${part.key}`, (d) => {
                if (!overChart(d)) return
                const target = Math.abs(d.dy) > TRACK_H / 2 ? rowAt(d.y) : null
                if (target && rowKey(target.tank) !== rowKey(row.tank)) props.onMoveBar?.(part, target.tank?.id ?? null)
                else if (snap(d.dx)) props.onShiftBar?.(part, snap(d.dx))
              })}
              aria-label={`${partLabel(part)}${part.planned ? ', planned' : ''}`}
              data-testid={`gantt-bar-${part.batch.id}-${part.vessel}`}
              data-planned={part.planned || undefined}
              sx={{
                position: 'absolute',
                top: BAR_TOP,
                height: BAR_H,
                left,
                width: right - left,
                borderRadius: 1.5,
                overflow: 'hidden',
                pointerEvents: 'auto',
                cursor: props.onBar ? 'grab' : 'default',
                touchAction: 'pan-x pan-y',
                userSelect: 'none',
                ...lifted(`bar:${part.key}`, true),
                boxShadow: part.planned ? `0 0 0 1.5px ${theme.palette.text.secondary} inset` : `0 0 0 1px ${alpha('#000', 0.08)} inset`,
                outline: part.planned ? `1.5px dashed ${theme.palette.text.secondary}` : 'none',
                outlineOffset: -1.5,
                opacity: part.planned ? 0.62 : 1,
                '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 1, opacity: 1 },
                ...(drag?.active?.key === `bar:${part.key}` ? { boxShadow: '0 4px 14px rgba(0,0,0,.25)' } : {}),
              }}
            >
              {segs.map((s) => (
                <Box key={s.from} sx={{ position: 'absolute', top: 0, bottom: 0, left: s.from * dayPx - left, width: (s.to - s.from + 1) * dayPx, background: fillColor(s.fill) }} />
              ))}
              <Typography
                component="span"
                sx={{ position: 'relative', zIndex: 1, px: 1, fontWeight: 600, fontSize: 12, lineHeight: `${BAR_H}px`, whiteSpace: 'nowrap', color: textColor, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {label}
              </Typography>
            </Box>
          </Tooltip>
        )}
        {badge && segs.length > 0 && (
          <Tooltip title={hover(myFlags.map((f) => `${f.signed_off ? '✓ ' : ''}${f.message}`).join('\n'))}>
            <Box
              component="button"
              type="button"
              onClick={props.onBar ? (e: MouseEvent) => !drag?.consumeClick(e) && props.onBar!(part, true) : undefined}
              aria-label={`${myFlags.length} flag${myFlags.length === 1 ? '' : 's'} on ${part.batch.label}`}
              data-testid={`gantt-badge-${part.batch.id}-${part.vessel}`}
              sx={{
                position: 'absolute',
                top: BAR_TOP - 3,
                left: Math.max(left, right - 22),
                height: 18,
                minWidth: 18,
                px: 0.6,
                borderRadius: 9,
                border: 0,
                fontSize: 11,
                fontWeight: 700,
                zIndex: 5,
                pointerEvents: 'auto',
                cursor: 'pointer',
                fontFamily: 'inherit',
                ...(badge === '✓'
                  ? { bgcolor: surface2, color: 'text.secondary', boxShadow: `0 0 0 1px ${theme.palette.divider}` }
                  : { bgcolor: 'error.main', color: 'error.contrastText' }),
              }}
            >
              {badge}
            </Box>
          </Tooltip>
        )}
        {partDots(part).map(({ step, slot, of }) => {
          if (step.due_on < from || step.due_on > to) return null
          const state = dotState(step, today, part)
          const center = x(step.due_on) + dayPx / 2 + (slot - (of - 1) / 2) * Math.min(DOT + 2, dayPx / of)
          const who = step.assignee?.name
          const tip = [step.name, dayLabel(step.due_on), STATE_WORDS[state], who, step.notes].filter(Boolean).join(' · ')
          return (
            <Box key={step.id}>
              {showI && who && (
                <Box
                  sx={{ position: 'absolute', top: INITIALS_TOP, left: center - 12, width: 24, textAlign: 'center', fontSize: 9, fontWeight: 700, lineHeight: '10px', color: 'text.secondary' }}
                  data-testid={`gantt-initials-${step.id}`}
                >
                  {initials(who)}
                </Box>
              )}
              <Tooltip title={hover(tip)}>
                <Box
                  {...activateStep(step, props.onStep, drag)}
                  {...bindDrag(
                    `dot:${step.id}`,
                    (d) => overChart(d) && snap(d.dx) && props.onMoveStep?.(step, snap(d.dx), d.shift),
                    !step.done_on,
                    props.onHoldStep && (() => props.onHoldStep!(step)),
                  )}
                  aria-label={tip}
                  aria-pressed={selected.has(step.id) || undefined}
                  data-testid={`gantt-step-${step.id}`}
                  data-state={state}
                  data-selected={selected.has(step.id) || undefined}
                  sx={{
                    position: 'absolute',
                    top: DOT_TOP,
                    left: center - DOT / 2,
                    width: DOT,
                    height: DOT,
                    borderRadius: step.behavior === 'cip' ? 0.5 : '50%',
                    border: 2,
                    zIndex: 3,
                    pointerEvents: 'auto',
                    cursor: props.onStep ? (step.done_on ? 'pointer' : 'grab') : 'default',
                    touchAction: 'pan-x pan-y',
                    ...dotSx(state),
                    ...ring(step.id),
                    ...lifted(`dot:${step.id}`),
                    '&:focus-visible': { outline: `2px solid ${theme.palette.text.primary}`, outlineOffset: 2 },
                  }}
                />
              </Tooltip>
            </Box>
          )
        })}
      </Box>
    )
  }

  const cipBlock = (row: Row, cip: SchedStep) => {
    if (cip.due_on < from || cip.due_on > to) return null
    const state = dotState(cip, today)
    const tip = ['CIP & Sanitize', dayLabel(cip.due_on), STATE_WORDS[state], cip.assignee?.name, cip.notes].filter(Boolean).join(' · ')
    return (
      <Tooltip key={`cip-${cip.id}`} title={hover(tip)}>
        <Box
          {...activate(props.onCip ? () => props.onCip!(cip) : undefined, drag)}
          {...bindDrag(`cip:${cip.id}`, (d) => overChart(d) && snap(d.dx) && props.onMoveCip?.(cip, snap(d.dx)), !cip.done_on)}
          aria-label={tip}
          data-testid={`gantt-cip-${cip.id}`}
          data-state={state}
          sx={{
            position: 'absolute',
            top: row.track.get(cip)! * TRACK_H + BAR_TOP,
            left: x(cip.due_on) + 1,
            width: Math.max(dayPx - 2, 8),
            height: BAR_H,
            borderRadius: 1.5,
            border: 1.5,
            zIndex: 2,
            cursor: props.onCip ? 'grab' : 'default',
            touchAction: 'pan-x pan-y',
            ...lifted(`cip:${cip.id}`),
            borderColor: state === 'done' ? 'primary.main' : state === 'late' ? 'error.main' : 'text.secondary',
            background: state === 'done' ? cipHatch : `repeating-linear-gradient(135deg, ${cipHatch} 0 4px, ${theme.palette.background.paper} 4px 8px)`,
            boxShadow: state === 'today' ? `0 0 0 3px ${alpha(theme.palette.primary.main, 0.3)}` : 'none',
            '&:focus-visible': { outline: `2px solid ${theme.palette.text.primary}`, outlineOffset: 2 },
          }}
        />
      </Tooltip>
    )
  }

  // An expanded tank: one line per step, a diamond on its day.
  const stepLine = (row: Row, i: number) => {
    const { part, step } = row.stepRows[i]
    const many = new Set(row.parts.map((p) => p.batch.id)).size > 1
    const state = dotState(step, today, part)
    const who = step.assignee?.name
    const visible = step.due_on >= from && step.due_on <= to
    const text = `${step.name}${state === 'late' ? ' · late' : state === 'stranded' ? ' · after the tank was emptied' : ''}${who && showInitials(dayPx) ? ` · ${initials(who)}` : ''}`
    return (
      <Box key={`${part.key}-${step.id}`} sx={{ display: 'flex', height: stepRowH }} data-testid={`gantt-step-row-${step.id}`}>
        <Box
          sx={{
            position: 'sticky',
            left: 0,
            zIndex: 7,
            width: leftW,
            flex: 'none',
            bgcolor: surface2,
            borderRight: 1,
            borderBottom: 1,
            borderColor: 'divider',
            // An outline under the tank's name (8 px in): phases a little further, steps more (D48 §3.6).
            pl: `${8 + (step.marker ? 8 : 20)}px`,
            pr: 1,
            display: 'flex',
            gap: 0.75,
            alignItems: 'center',
            fontSize: tight ? 11 : 12,
            whiteSpace: 'nowrap',
            minWidth: 0,
            borderTop: i === 0 ? `1px dashed ${theme.palette.divider}` : undefined,
          }}
        >
          <Box component="span" data-testid={`gantt-step-label-${step.id}`} sx={{ fontWeight: step.marker ? 500 : 600, fontStyle: step.marker ? 'italic' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {step.name}
          </Box>
          {!compact && (many || part.vessel > 0) && (
            <Box component="span" sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {part.batch.label}
              {part.vessel > 0 ? ' · after transfer' : ''}
            </Box>
          )}
        </Box>
        <Box sx={{ position: 'relative', flex: 'none', width, borderBottom: 1, borderColor: 'divider', borderTop: i === 0 ? `1px dashed ${theme.palette.divider}` : undefined }}>
          {visible && (
            <Tooltip title={hover([step.name, part.batch.label, dayLabel(step.due_on), STATE_WORDS[state], who, step.notes].filter(Boolean).join(' · '))}>
              <Box
                {...activateStep(step, props.onStep, drag)}
                {...bindDrag(
                  `dia:${step.id}`,
                  (d) => snap(d.dx) && props.onMoveStep?.(step, snap(d.dx), d.shift),
                  !step.done_on,
                  props.onHoldStep && (() => props.onHoldStep!(step)),
                )}
                aria-label={`${step.name}, ${part.batch.label}, ${dayLabel(step.due_on)}, ${STATE_WORDS[state]}`}
                aria-pressed={selected.has(step.id) || undefined}
                data-testid={`gantt-diamond-${step.id}`}
                data-state={state}
                data-selected={selected.has(step.id) || undefined}
                sx={{
                  position: 'absolute',
                  top: 0,
                  height: stepRowH,
                  left: x(step.due_on) + dayPx / 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  zIndex: 3,
                  whiteSpace: 'nowrap',
                  cursor: props.onStep ? (step.done_on ? 'pointer' : 'grab') : 'default',
                  touchAction: 'pan-x pan-y',
                  '&:focus-visible': { outline: `2px solid ${theme.palette.text.primary}`, outlineOffset: 1 },
                  ...lifted(`dia:${step.id}`),
                }}
              >
                <Box sx={{ width: tight ? 9 : 11, height: tight ? 9 : 11, ml: tight ? '-4.5px' : '-5.5px', transform: 'rotate(45deg)', border: 2, flex: 'none', ...dotSx(state), boxShadow: 'none', ...ring(step.id) }} />
                <Box component="span" sx={{ fontSize: tight ? 10 : 11, lineHeight: tight ? '14px' : undefined, fontWeight: 600, bgcolor: 'background.paper', px: 0.5, borderRadius: 0.5, color: state === 'late' || state === 'stranded' ? 'error.main' : 'text.primary' }}>
                  {text}
                </Box>
              </Box>
            </Tooltip>
          )}
        </Box>
      </Box>
    )
  }

  // ── Lines over the lanes: transfer arrows and an expanded tank's links ──

  const overlay = useMemo(() => {
    const paths: ReactNode[] = []
    const where = new Map<string, { row: Row; part: Part }>()
    for (const row of rows) for (const part of row.parts) where.set(part.key, { row, part })
    const midY = (row: Row, part: Part) => row.top + row.track.get(part)! * TRACK_H + BAR_TOP + BAR_H / 2
    const green = theme.palette.primary.main

    for (const { row, part } of where.values()) {
      const next = where.get(`${part.batch.id}.${part.vessel + 1}`)
      if (!next || !part.exit) continue
      const day = part.exit.due_on
      if (day < from || day > to) continue
      const x1 = x(day) + dayPx / 2
      const y1 = midY(row, part)
      const y2 = midY(next.row, next.part)
      const x2 = Math.max(0, x(maxKey(next.part.start, from))) + 4
      paths.push(
        <path
          key={`t-${part.key}`}
          d={`M ${x1} ${y1} C ${x1 + 24} ${y1}, ${x2 - 24} ${y2}, ${x2} ${y2}`}
          fill="none"
          stroke={green}
          strokeWidth={1.75}
          strokeDasharray="5 4"
          markerEnd="url(#gantt-arrow)"
          data-testid={`gantt-transfer-${part.batch.id}-${part.vessel}`}
        />,
      )
    }

    // D48: a dashed gold arrow from a split's parent (at its Split) to each part.
    const gold = theme.palette.secondary.main
    for (const { row, part } of where.values()) {
      const b = part.batch
      if (b.split_parent_id == null || part.vessel !== 0 || !part.fill) continue
      const parent = where.get(`${b.split_parent_id}.${part.fill.vessel_index}`)
      const day = part.fill.due_on
      if (!parent || day < from || day > to) continue
      const x1 = x(day) + dayPx / 2
      const y1 = midY(parent.row, parent.part)
      const y2 = midY(row, part)
      const x2 = Math.max(0, x(maxKey(part.start, from))) + 4
      paths.push(
        <path
          key={`s-${part.key}`}
          d={`M ${x1} ${y1} C ${x1 + 24} ${y1}, ${x2 - 24} ${y2}, ${x2} ${y2}`}
          fill="none"
          stroke={gold}
          strokeWidth={1.75}
          strokeDasharray="5 4"
          markerEnd="url(#gantt-arrow-split)"
          data-testid={`gantt-split-${b.split_parent_id}-${b.id}`}
        />,
      )
    }

    for (const row of rows) {
      if (!row.stepRows.length) continue
      const base = row.top + row.tracks * TRACK_H
      const index = new Map(row.stepRows.map((r, i) => [r.step.id, i]))
      const seen = new Set<number>()
      for (const { part } of row.stepRows) {
        if (seen.has(part.batch.id)) continue
        seen.add(part.batch.id)
        for (const l of part.batch.links) {
          const a = index.get(l.from_step_id)
          const b = index.get(l.to_step_id)
          if (a == null || b == null) continue
          const sa = row.stepRows[a].step
          const sb = row.stepRows[b].step
          const xa = x(sa.due_on) + dayPx / 2
          const xb = x(sb.due_on) + dayPx / 2
          const ya = base + a * stepRowH + stepRowH / 2
          const yb = base + b * stepRowH + stepRowH / 2
          const elbow = Math.min(xa, xb) - 8
          paths.push(
            <path
              key={`l-${row.top}-${l.id}`}
              d={`M ${xa - 6} ${ya} H ${elbow} V ${yb} H ${xb - 7}`}
              fill="none"
              stroke={theme.palette.text.secondary}
              strokeWidth={1.25}
              strokeDasharray={l.default_answer === 'move_only' ? '4 3' : undefined}
              opacity={0.8}
              data-testid={`gantt-link-${l.id}`}
              data-answer={l.default_answer}
            />,
          )
        }
      }
    }
    return paths
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, from, to, dayPx, theme, stepRowH])

  return (
    <Box ref={innerRef} sx={{ position: 'relative', width: leftW + width, minWidth: '100%' }} data-testid="gantt-inner">
      {header}
      {background}
      {rows.map((row) => {
        const key = rowKey(row.tank)
        const testId = row.tank ? `gantt-row-${row.tank.id}` : 'gantt-row-unassigned'
        return (
          <Box key={key} data-testid={testId} sx={{ position: 'relative' }}>
            <Box sx={{ display: 'flex', height: row.tracks * TRACK_H }}>
              <Box
                sx={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 7,
                  width: leftW,
                  flex: 'none',
                  // Opaque, like the tank headers: the warning tint over the column's surface.
                  bgcolor: surface2,
                  backgroundImage: row.tank ? 'none' : `linear-gradient(${alpha(theme.palette.warning.main, mode === 'dark' ? 0.18 : 0.14)}, ${alpha(theme.palette.warning.main, mode === 'dark' ? 0.18 : 0.14)})`,
                  borderRight: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                  px: 1,
                  py: 0.75,
                  minWidth: 0,
                }}
                data-testid={row.tank ? undefined : 'gantt-unassigned-head'}
              >
                {tankHeader(row)}
              </Box>
              <Box
                sx={{
                  position: 'relative',
                  flex: 'none',
                  width,
                  borderBottom: 1,
                  borderColor: 'divider',
                  cursor: props.onSpot ? 'cell' : 'default',
                  ...(dropRow && rowKey(dropRow.tank) === key ? { boxShadow: `inset 0 0 0 2px ${theme.palette.primary.main}`, bgcolor: alpha(theme.palette.primary.main, 0.12) } : {}),
                }}
                data-testid={`gantt-lane-${key}`}
                data-drop={(dropRow && rowKey(dropRow.tank) === key) || undefined}
                onClick={(e) => {
                  if (!props.onSpot || e.target !== e.currentTarget || drag?.consumeClick(e)) return
                  const left = e.currentTarget.getBoundingClientRect().left
                  const i = Math.floor((e.clientX - left) / dayPx)
                  if (i >= 0 && i < days) props.onSpot(row.tank, addDaysKey(from, i), { x: e.clientX, y: e.clientY })
                }}
              >
                {bands(row)}
                {marksIn(row)}
                {row.parts.map((p) => bar(row, p))}
                {row.cips.map((c) => cipBlock(row, c))}
              </Box>
            </Box>
            {row.stepRows.map((_, i) => stepLine(row, i))}
          </Box>
        )
      })}
      <Box
        component="svg"
        aria-hidden
        sx={{ position: 'absolute', top: HEAD_H + 1, left: leftW, width, height: totalH, pointerEvents: 'none', zIndex: 4, overflow: 'visible' }}
        data-testid="gantt-lines"
      >
        <defs>
          <marker id="gantt-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.palette.primary.main} />
          </marker>
          <marker id="gantt-arrow-split" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.palette.secondary.main} />
          </marker>
        </defs>
        {overlay}
      </Box>
      {hint && drag?.active && <HintBox hint={hint} at={drag.active} />}
    </Box>
  )
}
