import { useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, TextField, Typography } from '@mui/material'
import { usePhoneBackCloses } from '../../../hooks/useBackCloses'
import api from '../../../lib/api'
import { prodPath, type Flag } from '../../../lib/production'
import ErrorAlert from '../ErrorAlert'
import { useFlows } from './flowsContext'

const signedDay = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso))

/**
 * D47 §3.9 one flag: its text, and either a note box with Mark OK, or (signed
 * off) who and when with the note, muted, and Remove sign-off. A flag that
 * changed since its sign-off says so. D49 §3.12b: a pencilled batch's flag
 * is muted, with no Mark OK.
 */
export function FlagRow({ flag }: { flag: Flag }) {
  const flows = useFlows()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (call: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true)
    const r = await call()
    setBusy(false)
    setError(r.ok ? null : (r.error ?? null))
  }
  const by = flag.signoff?.user_name ?? 'someone'

  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, opacity: flag.muted ? 0.6 : flag.signed_off ? 0.75 : 1 }}
      data-testid={`flag-${flag.key}`}
      data-signed={flag.signed_off || undefined}
      data-muted={flag.muted || undefined}
    >
      <ErrorAlert error={error} testId="flag-error" />
      <Typography variant="body2" sx={{ fontWeight: flag.signed_off || flag.muted ? 400 : 600 }}>
        {flag.message}
      </Typography>
      {flag.muted ? (
        <Typography variant="caption" color="text.secondary" component="div" data-testid="flag-muted">
          Pencilled batch: this counts once it’s scheduled.
        </Typography>
      ) : flag.signed_off && flag.signoff ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }} data-testid="flag-signed-by">
            Signed off by {by} · {signedDay(flag.signoff.signed_at)}
            {flag.signoff.note ? ` · “${flag.signoff.note}”` : ''}
          </Typography>
          <Button size="small" disabled={busy} onClick={() => run(() => flows.write(() => api.delete(prodPath('flags', 'signoff', encodeURIComponent(flag.key))), 'Sign-off removed.'))} data-testid="flag-remove-signoff">
            Remove sign-off
          </Button>
        </Box>
      ) : (
        <>
          {flag.was_signed_off && (
            <Typography variant="caption" color="warning.main" component="div" data-testid="flag-was-signed">
              Was signed off by {by}, but something changed since.
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'flex-start' }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 500, 'data-testid': 'flag-note' } }}
            />
            <Button
              variant="contained"
              disabled={busy}
              onClick={() => run(() => flows.write(() => api.post(prodPath('flags', 'signoff'), { key: flag.key, signature: flag.signature, note: note.trim() || null }), 'Marked OK.'))}
              data-testid="flag-ok"
              sx={{ whiteSpace: 'nowrap' }}
            >
              Mark OK
            </Button>
          </Box>
        </>
      )}
    </Paper>
  )
}

/** D47 §3.9 the Flags list (the toolbar chip): open flags first, then the signed-off ones, then muted ones (D49). */
export default function FlagsDialog({ flags, onClose }: { flags: Flag[]; onClose: () => void }) {
  usePhoneBackCloses(true, onClose)
  const sorted = [...flags].sort((a, b) => Number(a.muted) - Number(b.muted) || Number(a.signed_off) - Number(b.signed_off))
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth data-testid="flags-dialog">
      <DialogTitle>Flags</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {!sorted.length && <Typography variant="body2">Nothing is flagged.</Typography>}
        {sorted.map((f) => (
          <FlagRow key={f.key} flag={f} />
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="flags-close">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}
