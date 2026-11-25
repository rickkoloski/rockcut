import { Box, FormControlLabel, Switch, Typography } from '@mui/material'
import { useHideUsedUpLots } from '../hooks/useHideUsedUpLots'

/** D63 §4.4: Hide used-up lots, beside the packs/total toggle on the Hops list and a hop's page; about the use lists only. */
export default function HideUsedUpSwitch() {
  const { hide, setHide, notSaved } = useHideUsedUpLots()
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1 }}>
      <FormControlLabel
        sx={{ mr: 0 }}
        control={<Switch size="small" checked={hide} onChange={(e) => setHide(e.target.checked)} data-testid="hide-used-up" />}
        label={<Typography variant="body2">Hide used-up lots</Typography>}
      />
      {notSaved && (
        <Typography variant="caption" color="warning.main" role="status" data-testid="hide-used-up-not-saved">
          Not saved to your account
        </Typography>
      )}
    </Box>
  )
}
