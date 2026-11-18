import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { useQuantityDisplay } from '../hooks/useQuantityDisplay'

/** D60 §3.9: sacks + lb or total lb, saved on the account. */
export default function QuantityToggle() {
  const { mode, setMode, notSaved } = useQuantityDisplay()
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={mode}
        onChange={(_, v: 'sacks' | 'lb' | null) => v && setMode(v)}
        aria-label="Show quantities as"
        data-testid="quantity-toggle"
      >
        <ToggleButton value="sacks" data-testid="quantity-toggle-sacks">Sacks + lb</ToggleButton>
        <ToggleButton value="lb" data-testid="quantity-toggle-lb">lb</ToggleButton>
      </ToggleButtonGroup>
      {notSaved && (
        <Typography variant="caption" color="warning.main" role="status">
          Not saved to your account
        </Typography>
      )}
    </Box>
  )
}
