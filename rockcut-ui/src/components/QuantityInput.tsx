import { useState } from 'react'
import { Box, Typography } from '@mui/material'
import DecimalInput from './DecimalInput'
import { lbToSacks, readQuantity, type QuantityDisplay } from '../lib/brewingUnits'

/** The quantity typed so far: lb as a decimal string, or null when empty or refused. */
export interface QuantityValue {
  lb: string | null
  /** False while a box holds something that isn't a number. */
  valid: boolean
}

interface QuantityInputProps {
  /** `sacks`: a Sacks box and a loose lb box; `lb`: one lb box. Sacks need a sack size. */
  mode: QuantityDisplay
  sackSize: number | null
  label: string
  onChange: (value: QuantityValue) => void
  /** Starting quantity in lb. Remount (a `key`) to start again. */
  initialLb?: number | null
  helperText?: string
  required?: boolean
  disabled?: boolean
  testId?: string
}

const text = (n: number | null | undefined) => (n == null ? '' : String(n))

/**
 * D60 §3.7, §3.9: a quantity as sacks + lb or total lb (the account's
 * display), always handed back as lb. Under 0.01 lb is refused under the box
 * (gap 16).
 */
export default function QuantityInput({ mode, sackSize, label, onChange, initialLb, helperText, required, disabled, testId }: QuantityInputProps) {
  const sacks = mode === 'sacks' && sackSize != null && sackSize > 0
  const start = initialLb != null && sacks ? lbToSacks(initialLb, sackSize) : null
  const [sackText, setSackText] = useState(start ? text(start.sacks || null) : '')
  const [lbText, setLbText] = useState(start ? text(start.lb || null) : text(initialLb))

  const read = (s: string, l: string) => readQuantity(s, l, sacks ? sackSize : null)
  const report = (s: string, l: string) => {
    const { lb, valid } = read(s, l)
    onChange({ lb, valid })
  }
  const tooSmall = read(sackText, lbText).error

  if (!sacks) {
    return (
      <DecimalInput
        label={`${label} (lb)`}
        value={lbText}
        onChange={(t) => {
          setLbText(t)
          report('', t)
        }}
        required={required}
        disabled={disabled}
        error={!!tooSmall}
        helperText={tooSmall ?? helperText}
        fullWidth
        slotProps={{ htmlInput: { 'data-testid': testId && `${testId}-lb` } }}
      />
    )
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {label} · {sackSize} lb sacks
      </Typography>
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <DecimalInput
          label="Sacks"
          value={sackText}
          onChange={(t) => {
            setSackText(t)
            report(t, lbText)
          }}
          disabled={disabled}
          sx={{ flex: 1 }}
          slotProps={{ htmlInput: { 'data-testid': testId && `${testId}-sacks` } }}
        />
        <DecimalInput
          label="lb"
          value={lbText}
          onChange={(t) => {
            setLbText(t)
            report(sackText, t)
          }}
          disabled={disabled}
          error={!!tooSmall}
          sx={{ flex: 1 }}
          slotProps={{ htmlInput: { 'data-testid': testId && `${testId}-lb` } }}
        />
      </Box>
      {(tooSmall ?? helperText) && (
        <Typography variant="caption" color={tooSmall ? 'error' : 'text.secondary'} sx={{ display: 'block', mt: 0.5, mx: 1.75 }}>
          {tooSmall ?? helperText}
        </Typography>
      )}
    </Box>
  )
}
