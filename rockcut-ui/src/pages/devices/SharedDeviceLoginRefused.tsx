import { Box, Button, Paper, Typography } from '@mui/material'
import TabletIcon from '@mui/icons-material/TabletMac'
import { useNavigate } from 'react-router-dom'
import { SHARED_DEVICE_LOGIN_REFUSED } from '../../lib/device'

// D54: a paired tablet that reaches /login. People use their own phone or computer.
export default function SharedDeviceLoginRefused() {
  const navigate = useNavigate()
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
      <Paper variant="outlined" sx={{ p: 4, maxWidth: 440, textAlign: 'center' }}>
        <TabletIcon color="disabled" sx={{ fontSize: 48, mb: 1 }} />
        <Typography data-testid="shared-device-login-refused" sx={{ mb: 3 }}>
          {SHARED_DEVICE_LOGIN_REFUSED}
        </Typography>
        <Button variant="contained" onClick={() => navigate('/')}>
          Go to Home
        </Button>
      </Paper>
    </Box>
  )
}
