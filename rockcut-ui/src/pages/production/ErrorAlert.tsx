import { Alert, Button, type SxProps, type Theme } from '@mui/material'
import { GONE_MESSAGE } from '../../lib/production'

/**
 * An error in the production pages. When the row was removed by someone else
 * (a 404, D46 QA minor 3) it offers Reload instead of a close button.
 */
export default function ErrorAlert({ error, onClose, testId, sx }: { error: string | null; onClose?: () => void; testId: string; sx?: SxProps<Theme> }) {
  if (!error) return null
  const gone = error === GONE_MESSAGE
  return (
    <Alert
      severity="error"
      sx={sx}
      data-testid={testId}
      onClose={gone ? undefined : onClose}
      action={
        gone ? (
          <Button color="inherit" size="small" onClick={() => window.location.reload()} data-testid="reload-after-gone">
            Reload
          </Button>
        ) : undefined
      }
    >
      {error}
    </Alert>
  )
}
