import { Box, Typography } from '@mui/material'
import DecimalInput from '../../components/DecimalInput'
import { parseDecimal } from '../../lib/brewingUnits'
import { rangeDraftError, type RangeDrafts } from '../../lib/ingredientFeatures'
import type { FeatureType } from '../../lib/types'

interface RangeFieldsProps {
  types: FeatureType[]
  drafts: RangeDrafts
  onChange: (drafts: RangeDrafts) => void
  disabled?: boolean
}

/**
 * D62 §3.4: a hop product's typical ranges (alpha, beta, total oil), one
 * low–high pair per feature, typed directly (no convert popup). Either end
 * may be blank; low above high is refused, as the API refuses it.
 */
export default function RangeFields({ types, drafts, onChange, disabled }: RangeFieldsProps) {
  const set = (key: string, patch: Partial<RangeDrafts[string]>) => onChange({ ...drafts, [key]: { ...(drafts[key] ?? { low: '', high: '' }), ...patch } })
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }} data-testid="range-fields">
      <Typography variant="subtitle2" color="text.secondary">
        Typical ranges
      </Typography>
      {types.map((t) => {
        const d = drafts[t.key] ?? { low: '', high: '' }
        // A box's own refusal (a comma, too many places) shows under it; the pair's (bounds, low above high) under the pair.
        const boxesOk = parseDecimal(d.low, t.decimals).ok && parseDecimal(d.high, t.decimals).ok
        const pairError = boxesOk ? rangeDraftError(t, d) : null
        return (
          <Box key={t.key}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <DecimalInput
                decimals={t.decimals}
                label={`${t.label} low (${t.unit_label})`}
                value={d.low}
                onChange={(low) => set(t.key, { low })}
                disabled={disabled}
                sx={{ flex: 1, minWidth: 0 }}
                slotProps={{ htmlInput: { 'data-testid': `range-${t.key}-low` } }}
              />
              <Typography sx={{ pt: 2 }} aria-hidden>
                –
              </Typography>
              <DecimalInput
                decimals={t.decimals}
                label={`High (${t.unit_label})`}
                value={d.high}
                onChange={(high) => set(t.key, { high })}
                disabled={disabled}
                sx={{ flex: 1, minWidth: 0 }}
                slotProps={{ htmlInput: { 'data-testid': `range-${t.key}-high` } }}
              />
            </Box>
            {pairError && (
              <Typography variant="caption" color="error" data-testid={`range-${t.key}-error`}>
                {pairError}
              </Typography>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
