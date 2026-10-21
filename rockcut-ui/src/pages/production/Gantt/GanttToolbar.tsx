import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Chip, IconButton, Menu, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material'
import { ArrowDropDown, ChevronLeft, ChevronRight, Flag as FlagIcon, Today, UnfoldLess, UnfoldMore } from '@mui/icons-material'
import { clampRange, flagChip, MAX_DAYS, MIN_DAYS, daysBetween, ZOOMS, type Range, type Zoom } from '../../../lib/gantt'
import type { Flag } from '../../../lib/production'

interface Props {
  range: Range
  zoom: Zoom
  flags: Flag[]
  onRange: (r: Range) => void
  onShift: (days: number) => void
  onToday: () => void
  onZoom: (z: Zoom) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onFlags?: () => void
  /** Plan batch, Add CIP & Sanitize (D47 task 4). */
  actions?: React.ReactNode
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
 * D47 §3.6 the toolbar: zoom (2 / 6 / 12 weeks), Today, ‹ 4 wks · From – To
 * · 4 wks › (7–730 days), Expand all / Collapse all, the flag chip, and the
 * page's actions and Set up menu.
 */
export default function GanttToolbar({ range, zoom, flags, onRange, onShift, onToday, onZoom, onExpandAll, onCollapseAll, onFlags, actions }: Props) {
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
      <ToggleButtonGroup size="small" exclusive value={zoom} onChange={(_, z) => z && onZoom(z)} aria-label="Zoom">
        {ZOOMS.map((z) => (
          <ToggleButton key={z} value={z} data-testid={`gantt-zoom-${z}`} sx={{ px: 1.25 }}>
            {z} wks
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
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
      <Button size="small" startIcon={<UnfoldMore />} onClick={onExpandAll} data-testid="gantt-expand-all">
        Expand all
      </Button>
      <Button size="small" startIcon={<UnfoldLess />} onClick={onCollapseAll} data-testid="gantt-collapse-all">
        Collapse all
      </Button>
      <Chip
        icon={<FlagIcon />}
        label={flagChip(flags)}
        color={open ? 'error' : 'default'}
        variant={open ? 'filled' : 'outlined'}
        onClick={onFlags}
        data-testid="gantt-flags"
      />
      <Box sx={{ flex: 1 }} />
      {actions}
      <SetupMenu />
    </Box>
  )
}
