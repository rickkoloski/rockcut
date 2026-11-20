import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { useQuantityDisplay } from '../hooks/useQuantityDisplay'

/**
 * D60 §3.9, D62 §3.5: packs + the loose part in the unit, or the total in
 * the unit, saved on the account. `packsLabel` names the first for the page
 * ("Sacks + lb" on grain, "Boxes + lb" on hops); `totalLabel` the second:
 * the page's unit where it has one ("lb"), "Total" only where units mix
 * (lead, Stop 1 note 1).
 */
export default function QuantityToggle({ packsLabel = 'Packs + unit', totalLabel = 'Total' }: { packsLabel?: string; totalLabel?: string }) {
  const { mode, setMode, notSaved } = useQuantityDisplay()
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={mode}
        onChange={(_, v: 'packs' | 'lb' | null) => v && setMode(v)}
        aria-label="Show quantities as"
        data-testid="quantity-toggle"
      >
        <ToggleButton value="packs" data-testid="quantity-toggle-packs">{packsLabel}</ToggleButton>
        {/* The stored value stays "lb": the total in the product's unit. */}
        <ToggleButton value="lb" data-testid="quantity-toggle-lb">{totalLabel}</ToggleButton>
      </ToggleButtonGroup>
      {notSaved && (
        <Typography variant="caption" color="warning.main" role="status">
          Not saved to your account
        </Typography>
      )}
    </Box>
  )
}
