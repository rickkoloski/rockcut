import { MenuItem, TextField } from '@mui/material'
import { shortPeriod, type Tank } from '../../../lib/production'
import { outagesIn } from './scheduleText'

/**
 * A tank picker (§3.5): Unassigned, then the active tanks with their
 * capacity and any out-of-service period in the days given ("FV3 · 20 bbl ·
 * out Oct 27–Nov 2"). Picking one that's out is allowed (it's flagged).
 */
export default function TankSelect({
  label,
  tanks,
  value,
  onChange,
  from,
  to,
  testId,
  disabled,
  helper,
}: {
  label: string
  tanks: Tank[]
  value: number | null
  onChange: (id: number | null) => void
  from?: string
  to?: string
  testId: string
  disabled?: boolean
  helper?: string
}) {
  return (
    <TextField
      select
      fullWidth
      label={label}
      value={value ?? ''}
      disabled={disabled}
      helperText={helper}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true, SelectDisplayProps: { 'data-testid': testId } as object } }}
    >
      <MenuItem value="" data-testid={`${testId}-none`}>
        Unassigned
      </MenuItem>
      {tanks
        .filter((t) => !t.retired_at)
        .map((t) => {
          const out = outagesIn(t, from, to)
          return (
            <MenuItem key={t.id} value={t.id} data-testid={`${testId}-${t.id}`}>
              {t.name} · {t.capacity_bbl} bbl
              {out.length ? ` · out ${out.map(shortPeriod).join(', ')}` : ''}
            </MenuItem>
          )
        })}
    </TextField>
  )
}
