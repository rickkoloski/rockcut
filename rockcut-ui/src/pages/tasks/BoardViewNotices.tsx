import { Alert, Snackbar } from '@mui/material'
import { MAX_RANGE_DAYS } from '../../lib/tasks'

interface Props {
  /** D58 §3.2: the URL asked for more than 31 days. */
  clamped: boolean
  /** D58 §3.1: a board setting didn't save. */
  notSaved: boolean
  onNotSavedClose: () => void
}

/** A board's notes about its view (`useBoardView`): the 31-day clamp, and a quiet "Not saved". */
export default function BoardViewNotices({ clamped, notSaved, onNotSavedClose }: Props) {
  return (
    <>
      {clamped && (
        <Alert severity="info" sx={{ mb: 1 }} data-testid="range-clamped">
          Showing {MAX_RANGE_DAYS} days (the most a board shows)
        </Alert>
      )}
      <Snackbar
        open={notSaved}
        autoHideDuration={4000}
        onClose={onNotSavedClose}
        message="Not saved"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        data-testid="settings-not-saved"
      />
    </>
  )
}
