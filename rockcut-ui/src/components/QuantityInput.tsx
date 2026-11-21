import { useState } from 'react'
import { Box, Typography } from '@mui/material'
import DecimalInput from './DecimalInput'
import { LB_DECIMALS, isCountUnit, minQuantity, packLabel, packSizeText, quantityToPacks, readQuantity, unitDecimals, type QuantityDisplay } from '../lib/brewingUnits'

/** The quantity typed so far, in the product's unit as a decimal string, or null when empty or refused. */
export interface QuantityValue {
  quantity: string | null
  /** False while a box holds something that isn't a number. */
  valid: boolean
}

interface QuantityInputProps {
  /** `packs`: a packs box ("Sacks") and a loose box in the unit; `lb`: one box for the total. Packs need a pack size. */
  mode: QuantityDisplay
  packSize: number | null
  /** The pack ("sack"); D62 §3.5. */
  packName?: string | null
  /** The product's unit (lb for grain). */
  unit?: string
  /** D65 lead decisions 1 (gap 5): the product as a refusal names it ("Whirlfloc T is counted in whole tablets"). */
  productName?: string | null
  /** D65 lead decisions 2 (gap 16): 0 isn't allowed, so a count says "Enter at least 1 tablet" for 0 or a minus as it's typed. */
  positive?: boolean
  label: string
  onChange: (value: QuantityValue) => void
  /** Starting quantity in the unit. Remount (a `key`) to start again. */
  initial?: number | null
  helperText?: string
  required?: boolean
  disabled?: boolean
  testId?: string
}

const text = (n: number | null | undefined) => (n == null ? '' : String(n))

/**
 * D60 §3.7, §3.9, D62 §3.5: a quantity as packs + the loose part, or the
 * total (the account's display), always handed back in the product's unit
 * ("Sacks" and "lb" for grain). Under 0.01 is refused under the box (gap 16).
 * A count (`each`, "tablets") that isn't whole is refused under the box, never rounded (D65 lead decisions 1, gap 5).
 */
export default function QuantityInput({ mode, packSize, packName = 'sack', unit = 'lb', productName, positive, label, onChange, initial, helperText, required, disabled, testId }: QuantityInputProps) {
  const packs = mode === 'packs' && packSize != null && packSize > 0
  const start = initial != null && packs ? quantityToPacks(initial, packSize, unit) : null
  const [packText, setPackText] = useState(start ? text(start.packs || null) : '')
  const [lbText, setLbText] = useState(start ? text(start.loose || null) : text(initial))

  const read = (s: string, l: string) => readQuantity(s, l, packs ? packSize : null, unit, productName, positive)
  const report = (s: string, l: string) => {
    const { quantity, valid } = read(s, l)
    onChange({ quantity, valid })
  }
  const tooSmall = read(packText, lbText).error
  // A count's loose box leaves fractions to `readQuantity`, whose message names the product.
  const looseDecimals = isCountUnit(unit) ? LB_DECIMALS : unitDecimals(unit)
  const negativeText = positive && isCountUnit(unit) ? minQuantity(unit) : undefined

  if (!packs) {
    return (
      <DecimalInput
        decimals={looseDecimals}
        negativeText={negativeText}
        label={`${label} (${unit})`}
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
        {/* Gap 8: "Quantity · 55 lb sacks"; a count reads "Quantity · tubs of 500 tablets". */}
        {`${label} · ${packSizeText(packName, packSize, unit)}`}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <DecimalInput
          decimals={LB_DECIMALS}
          negativeText={negativeText}
          label={packLabel(packName)}
          value={packText}
          onChange={(t) => {
            setPackText(t)
            report(t, lbText)
          }}
          disabled={disabled}
          sx={{ flex: 1 }}
          slotProps={{ htmlInput: { 'data-testid': testId && `${testId}-packs` } }}
        />
        <DecimalInput
          decimals={looseDecimals}
          negativeText={negativeText}
          label={unit}
          value={lbText}
          onChange={(t) => {
            setLbText(t)
            report(packText, t)
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
