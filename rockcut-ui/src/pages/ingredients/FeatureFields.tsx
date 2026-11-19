import { Box, Typography } from '@mui/material'
import DecimalInput from '../../components/DecimalInput'
import ConvertButton from '../../components/ConvertButton'
import { enteredAs, formatFeature, parseDecimal } from '../../lib/brewingUnits'
import { differs, draftRangeError, type FeatureDrafts } from '../../lib/ingredientFeatures'
import type { FeatureType, FeatureValues } from '../../lib/types'

interface FeatureFieldsProps {
  types: FeatureType[]
  drafts: FeatureDrafts
  onChange: (drafts: FeatureDrafts) => void
  /** A lot's form: the product's standard, so a changed value is marked. */
  standard?: FeatureValues | null
  disabled?: boolean
}

/**
 * D60 §3.4–3.5: one number box per feature, with the convert button beside
 * Extract, Color and Diastatic power. Typing in a box forgets a conversion;
 * **Use** in the popup fills the box and remembers what was typed.
 */
export default function FeatureFields({ types, drafts, onChange, standard, disabled }: FeatureFieldsProps) {
  const moisture = drafts.moisture_pct?.text
  const set = (key: string, d: FeatureDrafts[string]) => onChange({ ...drafts, [key]: d })
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }} data-testid="feature-fields">
      {types.map((t) => {
        const d = drafts[t.key] ?? { text: '', entered_value: null, entered_unit: null }
        const entered = enteredAs(d)
        const std = standard?.[t.key]
        const parsed = parseDecimal(d.text, t.decimals)
        const typed = parsed.ok && parsed.value != null ? { value: parsed.value } : undefined
        // A box that isn't a number yet isn't compared (DecimalInput shows why).
        const changed = standard !== undefined && parsed.ok && differs(typed, std, t.decimals)
        const outOfRange = draftRangeError(t, d)
        const helper = [entered, changed ? `changed from standard (${std ? formatFeature(std.value, t.decimals) : 'none'})` : null].filter(Boolean).join(' · ')
        return (
          <Box key={t.key} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
            <DecimalInput
              decimals={t.decimals}
              label={`${t.label} (${t.unit_label})`}
              value={d.text}
              onChange={(text) => set(t.key, { text, entered_value: null, entered_unit: null })}
              helperText={outOfRange ?? (helper || undefined)}
              error={!!outOfRange}
              disabled={disabled}
              fullWidth
              slotProps={{ htmlInput: { 'data-testid': `feature-${t.key}` } }}
            />
            {t.entered_units.length > 0 && (
              <Box sx={{ pt: 1 }}>
                <ConvertButton
                  featureKey={t.key}
                  label={t.label}
                  unitLabel={t.unit_label}
                  decimals={t.decimals}
                  range={t}
                  moisture={moisture}
                  disabled={disabled}
                  onUse={(e) => set(t.key, { text: e.value, entered_value: e.entered_value, entered_unit: e.entered_unit })}
                  testId={`convert-${t.key}`}
                />
              </Box>
            )}
          </Box>
        )
      })}
      {types.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No specs for this category.
        </Typography>
      )}
    </Box>
  )
}
