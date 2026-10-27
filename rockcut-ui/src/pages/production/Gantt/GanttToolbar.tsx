import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Chip, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material'
import { Add, ArrowDropDown, Check, ChevronLeft, ChevronRight, FiberManualRecord, Flag as FlagIcon, Today, UnfoldLess, UnfoldMore } from '@mui/icons-material'
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
}

/** "6 weeks ▾": the zoom menu, a check on the current one (D48 §3.6, P120). */
function ZoomMenu({ zoom, onZoom }: { zoom: Zoom; onZoom: (z: Zoom) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      {/* The zoom is how many weeks fit across the screen, whatever From and To say (QA minor 9).
          Not interactive: it stays open when the menu hands focus back, and must not catch clicks on Add process. */}
      <Tooltip title="Weeks on screen" disableInteractive>
        <Button
          size="small"
          variant="outlined"
          endIcon={<ArrowDropDown />}
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-haspopup="menu"
          aria-expanded={!!anchor}
          aria-label={`Zoom: ${zoom} weeks on screen`}
          data-testid="gantt-zoom"
        >
          {zoom} weeks
        </Button>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {ZOOMS.map((z) => (
          <MenuItem
            key={z}
            selected={z === zoom}
            role="menuitemradio"
            aria-checked={z === zoom}
            onClick={() => {
              setAnchor(null)
              onZoom(z)
            }}
            data-testid={`gantt-zoom-${z}`}
          >
            <ListItemIcon>{z === zoom && <Check fontSize="small" />}</ListItemIcon>
            <ListItemText>{z} weeks</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  )
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

/** "Set up ▾": the D46 setup pages (Tanks, Templates, Phases & steps). */
export function SetupMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const close = () => setAnchor(null)
  return (
    <>
      <Button variant="outlined" endIcon={<ArrowDropDown />} onClick={(e) => setAnchor(e.currentTarget)} aria-haspopup="menu" data-testid="gantt-setup">
        Set up
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={close}>
        <MenuItem component={RouterLink} to="/brewery/production/tanks" onClick={close} data-testid="gantt-setup-tanks">
          Tanks
        </MenuItem>
        <MenuItem component={RouterLink} to="/brewery/production/templates" onClick={close} data-testid="gantt-setup-templates">
          Templates
        </MenuItem>
        <MenuItem component={RouterLink} to="/brewery/production/lists" onClick={close} data-testid="gantt-setup-lists">
          Phases & steps
        </MenuItem>
      </Menu>
    </>
  )
}

/**
 * D47 §3.6 the toolbar, with D48's changes: the zoom menu, Today, ‹ 4 wks ·
 * From – To · 4 wks › (7–730 days), Collapse all | ● | Expand all, the flag
 * chip, Add process ▾ and Set up ▾.
 */
export default function GanttToolbar({ range, zoom, flags, onRange, onShift, onToday, onZoom, expandMode, hasMix, onExpandMode, onFlags, onPlan, onAddCip }: Props) {
  const [error, setError] = useState<string | null>(null)
  const open = flags.filter((f) => !f.signed_off).length

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
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 1.5 }} data-testid="gantt-toolbar">
      <ZoomMenu zoom={zoom} onZoom={onZoom} />
      <Button size="small" startIcon={<Today />} onClick={onToday} data-testid="gantt-today">
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
      <ToggleButtonGroup
        size="small"
        exclusive
        value={expandMode}
        // A click on the current position (null from MUI) applies it again: the mix comes back as it was saved.
        onChange={(_, m: ExpandMode | null) => onExpandMode(m ?? expandMode)}
        aria-label="Open tanks"
        data-testid="gantt-expand"
        data-mode={expandMode}
        sx={{ '& .MuiToggleButton-root': { px: 1, py: 0.25, textTransform: 'none', gap: 0.5 } }}
      >
        <ToggleButton value="collapse" data-testid="gantt-collapse-all">
          <UnfoldLess fontSize="small" />
          Collapse all
        </ToggleButton>
        <Tooltip title="Your own selection">
          {/* A span so the tooltip shows while it's disabled; the group's context still reaches the button. */}
          <span style={{ display: 'inline-flex' }}>
            <ToggleButton value="mine" disabled={!hasMix} aria-label="Your own selection" data-testid="gantt-expand-mine" sx={{ height: '100%' }}>
              <FiberManualRecord sx={{ fontSize: 10 }} />
            </ToggleButton>
          </span>
        </Tooltip>
        <ToggleButton value="expand" data-testid="gantt-expand-all">
          <UnfoldMore fontSize="small" />
          Expand all
        </ToggleButton>
      </ToggleButtonGroup>
      <Chip
        icon={<FlagIcon />}
        label={flagChip(flags)}
        color={open ? 'error' : 'default'}
        variant={open ? 'filled' : 'outlined'}
        onClick={onFlags}
        data-testid="gantt-flags"
      />
      <Box sx={{ flex: 1 }} />
      <AddProcessMenu onPlan={onPlan} onAddCip={onAddCip} />
      <SetupMenu />
    </Box>
  )
}
