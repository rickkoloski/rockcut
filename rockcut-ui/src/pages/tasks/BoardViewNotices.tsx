import { Alert, Snackbar } from '@mui/material'
import { MAX_RANGE_DAYS, type RangeNotice } from '../../lib/tasks'

interface Props {
  rangeNotice: RangeNotice | null
  /** D58 §3.1: a board setting didn't save. */
  notSaved: boolean
  onNotSavedClose: () => void
}

/** A board's notes about its view (`useBoardView`): a corrected range, and a quiet "Not saved". */
export default function BoardViewNotices({ rangeNotice, notSaved, onNotSavedClose }: Props) {
  return (
    <>
      {rangeNotice === 'clamped' && (
        <Alert severity="info" sx={{ mb: 1 }} data-testid="range-clamped">
          Showing {MAX_RANGE_DAYS} days (the most a board shows)
        </Alert>
      )}
      {rangeNotice === 'invalid' && (
        <Alert severity="info" sx={{ mb: 1 }} data-testid="range-invalid">
          That date range wasn't valid, so the board shows the default.
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
