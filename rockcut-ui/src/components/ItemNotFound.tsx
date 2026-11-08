import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Paper, Typography } from '@mui/material'

interface ItemNotFoundProps {
  /** "Category", "Brand", … */
  what: string
  backTo: string
  backLabel: string
  testId: string
}

/** D55: a detail page's "<what> not found" with a way back (see lib/notFound.ts). */
export default function ItemNotFound({ what, backTo, backLabel, testId }: ItemNotFoundProps) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
      <Paper data-testid={testId} variant="outlined" sx={{ p: 4, maxWidth: 440, textAlign: 'center' }}>
        <Typography variant="h5" gutterBottom>
          {what} not found
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          It doesn't exist, or it was deleted.
        </Typography>
        <Button variant="contained" component={RouterLink} to={backTo}>
          {backLabel}
        </Button>
      </Paper>
    </Box>
  )
}
