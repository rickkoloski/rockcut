import { Box, Button, Paper, Typography } from '@mui/material'
import SearchOffIcon from '@mui/icons-material/SearchOff'
import { useNavigate } from 'react-router-dom'

// D55 §2.2 (task 5119): a URL that isn't a page in the app. A shared tablet
// shows this; people keep D31's redirect to Home.
export default function NotFound() {
  const navigate = useNavigate()
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
      <Paper data-testid="page-not-found" variant="outlined" sx={{ p: 4, maxWidth: 440, textAlign: 'center' }}>
        <SearchOffIcon color="disabled" sx={{ fontSize: 48, mb: 1 }} />
        <Typography variant="h5" gutterBottom>
          Page not found
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          There's no page at this address.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/')}>
          Go to Home
        </Button>
      </Paper>
    </Box>
  )
}
