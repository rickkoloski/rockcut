import { Box, Button, Paper, Typography } from '@mui/material'
import TabletIcon from '@mui/icons-material/TabletMac'
import { useNavigate } from 'react-router-dom'

// D33 (lead decision 1): what a shared tablet shows for any page it can't use.
// People keep D31's redirect to Home instead.
export default function DeviceNotAvailable() {
  const navigate = useNavigate()
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
      <Paper data-testid="device-not-available" variant="outlined" sx={{ p: 4, maxWidth: 440, textAlign: 'center' }}>
        <TabletIcon color="disabled" sx={{ fontSize: 48, mb: 1 }} />
        <Typography variant="h5" gutterBottom>
          Not available on a shared device
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          This page needs your own account. Use “Sign in as me” at the top of the screen.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/')}>
          Go to Home
        </Button>
      </Paper>
    </Box>
  )
}
