import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Chip, Divider, IconButton, ListSubheader, Menu, MenuItem, TextField, Tooltip, useMediaQuery } from '@mui/material'
import { Add, ArrowDropDown, ChecklistRtl, ChevronLeft, ChevronRight, Flag as FlagIcon } from '@mui/icons-material'
import { PageToolbar, SettingsChoices, SettingsGear, type Choice } from '../../../components/SettingsMenu'
import { clampRange, flagChip, MAX_DAYS, MIN_DAYS, daysBetween, ZOOMS, type ExpandMode, type Range, type Zoom } from '../../../lib/gantt'
import type { Flag } from '../../../lib/production'

interface Props {
  range: Range
  zoom: Zoom
  flags: Flag[]
  onRange: (r: Range) => void
  onShift: (days: number) => void
  onToday: () => void
  onZoom: (z: Zoom) => void
  /** Collapse all | ● | Expand all (D48 §3.6); `hasMix` enables the middle. */
  expandMode: ExpandMode
  hasMix: boolean
  onExpandMode: (m: ExpandMode) => void
  onFlags?: () => void
  /** Add process ▾ (D48 §3.6): Plan batch… and CIP… (D49: with the variant). */
  onPlan?: () => void
  onAddCip?: () => void
  /** D49 §3.12: the Task list panel. */
  onTaskList?: () => void
}

/** "Add process ▾": Plan batch… and CIP… (D48 §3.6, P120; D49 §3.12a). */
function AddProcessMenu({ onPlan, onAddCip }: { onPlan?: () => void; onAddCip?: () => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const pick = (fn?: () => void) => () => {
    setAnchor(null)
    fn?.()
  }
  return (
    <>
      <Button
        variant="contained"
        startIcon={<Add />}
        endIcon={<ArrowDropDown />}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        data-testid="gantt-add-process"
      >
        Add process
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem onClick={pick(onPlan)} data-testid="gantt-plan">
          Plan batch…
        </MenuItem>
        <MenuItem onClick={pick(onAddCip)} data-testid="gantt-add-cip">
          CIP…
        </MenuItem>
      </Menu>
    </>
  )
}

const EXPAND: Choice<ExpandMode>[] = [
  { value: 'collapse', label: 'Collapse all' },
  { value: 'mine', label: 'Your selection' },
  { value: 'expand', label: 'Expand all' },
]

/**
 * D47 §3.6 the toolbar, with D48's changes. D52: Today and ‹ 4 wks · From – To ·
 * 4 wks › (7–730 days) on the left; the flag chip, Task list and Add process ▾
 * on the right, then a settings menu with the zoom, how tanks open, and the
 * D46 setup pages.
 */
export default function GanttToolbar({ range, zoom, flags, onRange, onShift, onToday, onZoom, expandMode, hasMix, onExpandMode, onFlags, onPlan, onAddCip, onTaskList }: Props) {
  const [error, setError] = useState<string | null>(null)
  // At phone width the Task list button is an icon after Set up, so the toolbar keeps its rows.
  const phone = useMediaQuery('(max-width:559.95px)')
  const open = flags.filter((f) => !f.signed_off && !f.muted).length

  const pick = (which: 'from' | 'to', value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return
    const next = { ...range, [which]: value }
    const days = daysBetween(next.from, next.to) + 1
    if (days < MIN_DAYS || days > MAX_DAYS) {
      setError(`Pick a range of ${MIN_DAYS} to ${MAX_DAYS} days.`)
      if (which === 'from') onRange(clampRange({ from: value, to: range.to < value ? value : range.to }))
      return
    }
    setError(null)
    onRange(next)
  }

  return (
    <PageToolbar
      testid="gantt-toolbar"
      end={
        <>
          <Chip
            icon={<FlagIcon />}
            label={flagChip(flags)}
            color={open ? 'error' : 'default'}
            variant={open ? 'filled' : 'outlined'}
            onClick={onFlags}
            data-testid="gantt-flags"
          />
          {onTaskList &&
            (phone ? (
              <Tooltip title="Task list">
                <IconButton size="small" onClick={onTaskList} aria-label="Task list" data-testid="gantt-task-list">
                  <ChecklistRtl />
                </IconButton>
              </Tooltip>
            ) : (
              <Button startIcon={<ChecklistRtl />} onClick={onTaskList} data-testid="gantt-task-list">
                Task list
              </Button>
            ))}
          <AddProcessMenu onPlan={onPlan} onAddCip={onAddCip} />
          <SettingsGear label="Production settings" testid="gantt-settings">
            {(close) => (
              <>
                {/* The zoom is how many weeks fit across the screen, whatever From and To say (QA minor 9). */}
                <SettingsChoices
                  label="Weeks on screen"
                  options={ZOOMS.map((z) => ({ value: z, label: `${z} weeks` }))}
                  value={zoom}
                  onPick={onZoom}
                  testid="gantt-zoom"
                />
                {/* How the tanks open (D48 §3.6); "Your selection" once you've opened some yourself. */}
                <SettingsChoices
                  label="Tanks"
                  options={hasMix ? EXPAND : EXPAND.filter((e) => e.value !== 'mine')}
                  value={expandMode}
                  onPick={onExpandMode}
                  testid="gantt-expand"
                />
                <Divider />
                <ListSubheader sx={{ lineHeight: '32px', bgcolor: 'transparent' }}>Set up</ListSubheader>
                <MenuItem component={RouterLink} to="/brewery/production/tanks" onClick={close} data-testid="gantt-setup-tanks">
                  Tanks
                </MenuItem>
                <MenuItem component={RouterLink} to="/brewery/production/templates" onClick={close} data-testid="gantt-setup-templates">
                  Templates
                </MenuItem>
                <MenuItem component={RouterLink} to="/brewery/production/lists" onClick={close} data-testid="gantt-setup-lists">
                  Phases & steps
                </MenuItem>
              </>
            )}
          </SettingsGear>
        </>
      }
    >
      <Button variant="outlined" size="small" onClick={onToday} data-testid="gantt-today">
        Today
      </Button>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Tooltip title="4 weeks earlier">
          <IconButton size="small" onClick={() => onShift(-28)} aria-label="4 weeks earlier" data-testid="gantt-back">
            <ChevronLeft />
          </IconButton>
        </Tooltip>
        <TextField
          size="small"
          type="date"
          label="From"
          value={range.from}
          onChange={(e) => pick('from', e.target.value)}
          sx={{ width: 150 }}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'gantt-from' } }}
        />
        <TextField
          size="small"
          type="date"
          label="To"
          value={range.to}
          onChange={(e) => pick('to', e.target.value)}
          error={!!error}
          helperText={error ?? undefined}
          sx={{ width: 150 }}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'gantt-to' }, formHelperText: { sx: { position: 'absolute', top: '100%', whiteSpace: 'nowrap' } } }}
        />
        <Tooltip title="4 weeks later">
          <IconButton size="small" onClick={() => onShift(28)} aria-label="4 weeks later" data-testid="gantt-forward">
            <ChevronRight />
          </IconButton>
        </Tooltip>
      </Box>
    </PageToolbar>
  )
}
