import { Box, Typography } from '@mui/material'
import DecimalInput from '../../components/DecimalInput'
import ConvertButton from '../../components/ConvertButton'
import { convertDecimals, enteredAs, formatFeature, parseDecimal } from '../../lib/brewingUnits'
import { differs, draftRangeError, formatRange, outsideRange, type FeatureDrafts } from '../../lib/ingredientFeatures'
import type { FeatureType, FeatureValues } from '../../lib/types'

interface FeatureFieldsProps {
  types: FeatureType[]
  drafts: FeatureDrafts
  onChange: (drafts: FeatureDrafts) => void
  /** A lot's form: the product's standard, so a changed value is marked. */
  standard?: FeatureValues | null
  /** D62 §3.4: a hop lot's form: the product's typical ranges, shown beside each box; a value outside is marked but saves. */
  typical?: FeatureValues | null
  /** The keys a lot must have (hops: alpha acid). */
  required?: string[]
  disabled?: boolean
}

/**
 * D60 §3.4–3.5: one number box per feature, with the convert button beside
 * Extract, Color and Diastatic power. Typing in a box forgets a conversion;
 * **Use** in the popup fills the box and remembers what was typed.
 */
export default function FeatureFields({ types, drafts, onChange, standard, typical, required = [], disabled }: FeatureFieldsProps) {
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
        // D65: with typical ranges too (fruit, sugars), only a feature that has a standard is compared.
        const changed = standard !== undefined && (!typical || std !== undefined) && parsed.ok && differs(typed, std, t.decimals)
        const outOfRange = draftRangeError(t, d)
        const range = typical ? formatRange(typical[t.key], t.decimals) : null
        const outside = !!range && typed != null && outsideRange(typed.value, typical?.[t.key])
        const typicalText = range ? `${outside ? 'outside ' : ''}typical ${range}` : null
        const helper = [entered, changed ? `changed from standard (${std ? formatFeature(std.value, t) : 'none'})` : null, typicalText].filter(Boolean).join(' · ')
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
              slotProps={{
                htmlInput: { 'data-testid': `feature-${t.key}` },
                // Marked required, but the dialog says what's missing ("Enter the alpha acid"), not the browser.
                inputLabel: { required: required.includes(t.key) },
                // Outside the typical range: marked, never refused (D62 §3.4).
                formHelperText: outside && !outOfRange ? { sx: { color: 'warning.main' }, 'data-testid': `feature-${t.key}-outside` } as object : undefined,
              }}
              sx={outside && !outOfRange ? { '& .MuiOutlinedInput-notchedOutline': { borderColor: 'warning.main' } } : undefined}
            />
            {t.entered_units.length > 0 && (
              <Box sx={{ pt: 1 }}>
                <ConvertButton
                  featureKey={t.key}
                  label={t.label}
                  unitLabel={t.unit_label}
                  decimals={convertDecimals(t)}
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
