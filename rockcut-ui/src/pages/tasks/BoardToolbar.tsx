import type { ReactNode } from 'react'
import {
  Box,
  Button,
  Divider,
  IconButton,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@mui/material'
import { ChevronLeft, ChevronRight, ViewAgenda, ViewDay } from '@mui/icons-material'
import { PageToolbar, SettingsChoices, SettingsGear, SettingsToggle, type Choice } from '../../components/SettingsMenu'
import type { FirstDay, PhoneView, Span, TaskFilter } from '../../lib/tasks'

interface Props {
  /** The span to tick; null while a custom range shows. */
  span: Span | null
  /** D42 §2.9: the day the range starts on. */
  firstDay: FirstDay
  filter: TaskFilter
  hideCompleted: boolean
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onSpan: (span: Span) => void
  onFirstDay: (first: FirstDay) => void
  onFilter: (filter: TaskFilter) => void
  onHideCompleted: (on: boolean) => void
  /** D45: Hide shifts in the day headers. Left out where there are no headers (All departments). */
  hideShifts?: boolean
  onHideShifts?: (on: boolean) => void
  /** D49 §3.12: "Show planned batches" (the Brewery board, people only); left out elsewhere. */
  showPlanned?: boolean
  onShowPlanned?: (on: boolean) => void
  /** D41 All departments view: All and Unassigned only ("My tasks" is left out). */
  noMine?: boolean
  /** History (managers and owners). */
  onHistory?: () => void
  /** Edit Daily items (managers and owners). */
  onEditDailyItems?: () => void
  /** D41 S107: the board has no Daily items yet, so the entry reads "Set up Daily checks". */
  setUpDaily?: boolean
  /** Phone width (D41): the board's title or switcher. */
  title?: ReactNode
  compact?: boolean
  /** Phone width (D39): every day stacked, or one day at a time. */
  phoneView?: PhoneView
  onPhoneView?: (view: PhoneView) => void
}

const FILTERS: Choice<TaskFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'My tasks' },
  { value: 'unassigned', label: 'Unassigned' },
]
const FIRST_DAYS: Choice<FirstDay>[] = [
  { value: 'sunday', label: 'Sunday' },
  { value: 'monday', label: 'Monday' },
  { value: 'today', label: 'Today' },
]
const SPANS: Choice<Span>[] = [
  { value: 7, label: '1 week' },
  { value: 14, label: '2 weeks' },
]

/**
 * D38 §3.8 toolbar. D52: Previous / Today / Next on the left and a settings
 * menu on the right holding the view filter, the hide switches, the first
 * day, the days shown, and (managers) Daily items and History.
 */
export default function BoardToolbar(props: Props) {
  const { compact } = props
  const filters = props.noMine ? FILTERS.filter((f) => f.value !== 'mine') : FILTERS

  return (
    <PageToolbar
      testid="board-toolbar"
      end={
        <SettingsGear label="Board settings" testid="board-settings">
          {(close) => (
            <>
              <SettingsChoices label="View" options={filters} value={props.filter} onPick={props.onFilter} testid="board-filter" />
              <Divider />
              {props.onHideShifts && (
                <SettingsToggle label="Hide shifts" checked={!!props.hideShifts} onChange={props.onHideShifts} testid="board-hide-shifts" />
              )}
              <SettingsToggle label="Hide completed" checked={props.hideCompleted} onChange={props.onHideCompleted} testid="board-hide-completed" />
              {props.showPlanned !== undefined && (
                <SettingsToggle
                  label="Hide planned batches"
                  checked={!props.showPlanned}
                  onChange={(hide) => props.onShowPlanned?.(!hide)}
                  testid="board-hide-planned"
                />
              )}
              <Divider />
              <SettingsChoices label="First day" options={FIRST_DAYS} value={props.firstDay} onPick={props.onFirstDay} testid="board-first-day" />
              <SettingsChoices label="Days shown" options={SPANS} value={props.span} onPick={props.onSpan} otherLabel="Custom" testid="board-span" />
              {(props.onEditDailyItems || props.onHistory) && <Divider />}
              {props.onEditDailyItems && (
                <MenuItem
                  onClick={() => {
                    close()
                    props.onEditDailyItems?.()
                  }}
                  data-testid="board-menu-daily-items"
                >
                  {props.setUpDaily ? 'Set up Daily checks' : 'Edit Daily items'}
                </MenuItem>
              )}
              {props.onHistory && (
                <MenuItem
                  onClick={() => {
                    close()
                    props.onHistory?.()
                  }}
                  data-testid="board-menu-history"
                >
                  History
                </MenuItem>
              )}
            </>
          )}
        </SettingsGear>
      }
    >
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
      {compact && props.onPhoneView && (
        <ToggleButtonGroup
          size="small"
          exclusive
          value={props.phoneView}
          onChange={(_, v: PhoneView | null) => v && props.onPhoneView?.(v)}
          aria-label="View"
        >
          <ToggleButton value="vertical" aria-label="All days" data-testid="board-view-vertical">
            <Tooltip title="All days">
              <ViewAgenda fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="day" aria-label="One day" data-testid="board-view-day">
            <Tooltip title="One day">
              <ViewDay fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      )}
      {compact && props.title}
    </PageToolbar>
  )
}
