import { useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import { CalendarMonth, ChevronLeft, ChevronRight, MoreVert } from '@mui/icons-material'
import { rangeError, type Span, type TaskFilter } from '../../../lib/breweryTasks'

interface Props {
  from: string
  to: string
  /** The toggle side to highlight; null while a custom range shows. */
  span: Span | null
  filter: TaskFilter
  hideCompleted: boolean
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onSpan: (span: Span) => void
  onRange: (from: string, to: string) => void
  onFilter: (filter: TaskFilter) => void
  onHideCompleted: (on: boolean) => void
  /** History (managers and owners). */
  onHistory?: () => void
  /** Edit Daily items (managers and owners). Without either there's no ⋮ menu. */
  onEditDailyItems?: () => void
  /** Phone width: 1 week / 2 weeks and the date range go behind a calendar button. */
  compact?: boolean
}

/**
 * D38 §3.8 toolbar: Previous / Today / Next, 1 week / 2 weeks, the date
 * range, the filter, Hide completed, and the ⋮ menu for managers.
 */
export default function BoardToolbar(props: Props) {
  const { from, to, span, filter, hideCompleted, compact } = props
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const spanToggle = (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={span}
      onChange={(_, v: Span | null) => {
        if (!v) return
        setCalendarOpen(false)
        props.onSpan(v)
      }}
      aria-label="Days shown"
    >
      <ToggleButton value={7} data-testid="board-span-7">1 week</ToggleButton>
      <ToggleButton value={14} data-testid="board-span-14">2 weeks</ToggleButton>
    </ToggleButtonGroup>
  )
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mb: 2 }} data-testid="board-toolbar">
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Tooltip title="Previous">
          <IconButton onClick={props.onPrev} aria-label="Previous" data-testid="board-prev">
            <ChevronLeft />
          </IconButton>
        </Tooltip>
        <Button variant="outlined" size="small" onClick={props.onToday} data-testid="board-today">
          Today
        </Button>
        <Tooltip title="Next">
          <IconButton onClick={props.onNext} aria-label="Next" data-testid="board-next">
            <ChevronRight />
          </IconButton>
        </Tooltip>
      </Box>
      {compact ? (
        <>
          <Tooltip title="Days shown">
            <IconButton aria-label="Days shown" onClick={() => setCalendarOpen(true)} data-testid="board-calendar">
              <CalendarMonth />
            </IconButton>
          </Tooltip>
          <Dialog open={calendarOpen} onClose={() => setCalendarOpen(false)} fullWidth maxWidth="xs" data-testid="board-calendar-dialog">
            <DialogTitle>Days shown</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
              {spanToggle}
              <RangeSelector
                key={`${from}:${to}`}
                from={from}
                to={to}
                stacked
                onRange={(f, t) => {
                  setCalendarOpen(false)
                  props.onRange(f, t)
                }}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCalendarOpen(false)} data-testid="board-calendar-close">
                Close
              </Button>
            </DialogActions>
          </Dialog>
        </>
      ) : (
        <>
          {spanToggle}
          <RangeSelector key={`${from}:${to}`} from={from} to={to} onRange={props.onRange} />
        </>
      )}
      <ToggleButtonGroup
        size="small"
        exclusive
        value={filter}
        onChange={(_, v: TaskFilter | null) => v && props.onFilter(v)}
        aria-label="Filter"
      >
        <ToggleButton value="all" data-testid="board-filter-all">All</ToggleButton>
        <ToggleButton value="mine" data-testid="board-filter-mine">My tasks</ToggleButton>
        <ToggleButton value="unassigned" data-testid="board-filter-unassigned">Unassigned</ToggleButton>
      </ToggleButtonGroup>
      <FormControlLabel
        control={
          <Switch
            checked={hideCompleted}
            onChange={(e) => props.onHideCompleted(e.target.checked)}
            slotProps={{ input: { 'data-testid': 'board-hide-completed' } as object }}
          />
        }
        label="Hide completed"
      />
      {(props.onHistory || props.onEditDailyItems) && (
        <>
          <IconButton aria-label="Board menu" onClick={(e) => setMenuAnchor(e.currentTarget)} data-testid="board-menu" sx={{ ml: 'auto' }}>
            <MoreVert />
          </IconButton>
          <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
            {props.onHistory && (
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null)
                  props.onHistory?.()
                }}
                data-testid="board-menu-history"
              >
                History
              </MenuItem>
            )}
            {props.onEditDailyItems && (
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null)
                  props.onEditDailyItems?.()
                }}
                data-testid="board-menu-daily-items"
              >
                Edit Daily items
              </MenuItem>
            )}
          </Menu>
        </>
      )}
    </Box>
  )
}

/** From and To (up to 31 days). Mounted per range, so it starts from what's showing. */
function RangeSelector({
  from,
  to,
  stacked,
  onRange,
}: {
  from: string
  to: string
  /** One field under the other (the phone's calendar dialog). */
  stacked?: boolean
  onRange: (from: string, to: string) => void
}) {
  const [draftFrom, setDraftFrom] = useState(from)
  const [draftTo, setDraftTo] = useState(to)
  const [error, setError] = useState<string | null>(null)
  const changed = draftFrom !== from || draftTo !== to

  const apply = () => {
    const problem = rangeError(draftFrom, draftTo)
    setError(problem)
    if (!problem) onRange(draftFrom, draftTo)
  }

  return (
    <Box
      component="form"
      onSubmit={(e) => {
        e.preventDefault()
        apply()
      }}
      sx={stacked ? { display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 2 } : { display: 'flex', alignItems: 'center', gap: 1 }}
    >
      <TextField
        type="date"
        size="small"
        label="From"
        value={draftFrom}
        onChange={(e) => {
          setDraftFrom(e.target.value)
          setError(null)
        }}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'board-range-from' } }}
      />
      <TextField
        type="date"
        size="small"
        label="To"
        value={draftTo}
        onChange={(e) => {
          setDraftTo(e.target.value)
          setError(null)
        }}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'board-range-to' } }}
      />
      <Button type="submit" size="small" variant={changed ? 'contained' : 'outlined'} disabled={!changed} data-testid="board-range-apply">
        Show
      </Button>
      {error && (
        <Typography variant="caption" color="error" role="alert" data-testid="board-range-error">
          {error}
        </Typography>
      )}
    </Box>
  )
}
