import { Alert } from '@mui/material'

/** D50 §2.3: on the brewhouse device the production setup is read-only (Matt, 2026-10-20). */
export default function SetupReadOnlyNote() {
  return (
    <Alert severity="info" sx={{ mb: 2 }} data-testid="setup-read-only">
      Read only on a shared device. Set up on a personal account.
    </Alert>
  )
}
