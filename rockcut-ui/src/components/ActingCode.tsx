import { useEffect, useState, type FormEvent } from 'react'
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import useActing from '../hooks/useActing'
import { firstName } from '../lib/tasks'
import StaffCodeField from './StaffCodeField'

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const
const TICK_MS = 5_000

/**
 * D40: the staff-code dialog a shared tablet shows before its first task-board
 * write (D37's code field and error copy). A wrong code, someone outside the
 * tablet's department or the lockout shows under the field and keeps it open.
 */
export function ActingCodeDialog() {
  const asking = useActing((s) => s.asking)
  const cancel = useActing((s) => s.cancel)
  const submitting = useActing((s) => s.submitting)
  return (
    <Dialog open={!!asking} onClose={submitting ? undefined : cancel} maxWidth="xs" fullWidth data-testid="acting-code-dialog">
      {/* A fresh form (an empty field) each time it opens, and after each refusal. */}
      {asking && <CodeForm key={asking.attempt} error={asking.error} />}
    </Dialog>
  )
}

function CodeForm({ error }: { error: string | null }) {
  const submitting = useActing((s) => s.submitting)
  const submit = useActing((s) => s.submit)
  const cancel = useActing((s) => s.cancel)
  const [code, setCode] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!/^\d{4}$/.test(code)) return setFieldError('Enter your 4-digit staff code')
    setFieldError(null)
    void submit(code)
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <DialogTitle>Who's making this change?</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <StaffCodeField
          value={code}
          onChange={setCode}
          error={fieldError ?? error}
          helperText="Records who made this change. It's remembered for 5 minutes, until you tap Done."
          testId="acting-staff-code"
          autoFocus
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={cancel} disabled={submitting} data-testid="acting-cancel">
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={submitting} data-testid="acting-submit">
          {submitting ? <CircularProgress size={20} /> : 'Continue'}
        </Button>
      </DialogActions>
    </form>
  )
}

/**
 * D40: "Acting as Kate · Done" while a shared tablet remembers a code. Pointer
 * and key activity keep it; 5 minutes without any (wall clock, so a tablet
 * that slept past it doesn't revive it) or Done ends it.
 */
export function ActingBanner() {
  const session = useActing((s) => s.session)
  const done = useActing((s) => s.done)
  const activity = useActing((s) => s.activity)
  const expire = useActing((s) => s.expire)
  const active = !!session

  useEffect(() => {
    if (!active) return
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, activity, { passive: true, capture: true }))
    const timer = window.setInterval(expire, TICK_MS)
    document.addEventListener('visibilitychange', expire)
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, activity, { capture: true }))
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', expire)
    }
  }, [active, activity, expire])

  if (!session) return null
  return (
    <Box
      data-testid="acting-banner"
      sx={{ px: 3, py: 1, bgcolor: 'info.light', color: 'info.contrastText', display: 'flex', alignItems: 'center', gap: 1 }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }} data-testid="acting-name">
        Acting as {firstName(session.name) || 'you'}
      </Typography>
      <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' } }}>
        · ends after 5 minutes without activity
      </Typography>
      <Box sx={{ flexGrow: 1 }} />
      <Button size="small" variant="contained" color="inherit" onClick={done} data-testid="acting-done" sx={{ color: 'info.dark' }}>
        Done
      </Button>
    </Box>
  )
}
