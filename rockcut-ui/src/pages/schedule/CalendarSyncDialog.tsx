import { useState } from 'react'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import { useQueryClient } from '@tanstack/react-query'
import { useApiQuery } from '../../hooks/useApiQuery'
import api from '../../lib/api'
import type { CalendarFeed } from '../../lib/types'

interface Props {
  open: boolean
  onClose: () => void
}

export default function CalendarSyncDialog({ open, onClose }: Props) {
  const qc = useQueryClient()
  const { data: feeds = [] } = useApiQuery<CalendarFeed[]>(['calendar_feeds'], '/api/calendar_feeds', undefined, { enabled: open })
  const [copied, setCopied] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const urlFor = (f: CalendarFeed) => `${window.location.origin}${f.path}`

  const copy = async (f: CalendarFeed) => {
    try {
      await navigator.clipboard.writeText(urlFor(f))
      setCopied(f.token)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      /* clipboard blocked — the field is selectable */
    }
  }

  const rotate = async (f: CalendarFeed) => {
    setBusy(true)
    try {
      await api.post('/api/calendar_feeds/rotate', { subject_type: f.subject_type, subject_id: f.subject_id })
      qc.invalidateQueries({ queryKey: ['calendar_feeds'] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Calendar sync</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <Alert severity="info">
          Subscribe in Google Calendar: <strong>Other calendars → + → From URL</strong>, paste a link
          below, then <strong>Add calendar</strong>. Feeds are read-only and update on Google's own
          schedule (often a few hours). Keep the links private — anyone with a link can see that feed.
        </Alert>

        {feeds.length === 0 ? (
          <Typography color="text.secondary">No feeds available.</Typography>
        ) : (
          <Stack spacing={2}>
            {feeds.map((f) => (
              <div key={f.token}>
                <Typography variant="subtitle2">{f.label}</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    size="small"
                    value={urlFor(f)}
                    fullWidth
                    slotProps={{ input: { readOnly: true } }}
                    onFocus={(e) => e.target.select()}
                  />
                  <Tooltip title={copied === f.token ? 'Copied!' : 'Copy link'}>
                    <IconButton size="small" onClick={() => copy(f)}>
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Rotate (invalidate the old link)">
                    <span>
                      <IconButton size="small" disabled={busy} onClick={() => rotate(f)}>
                        <AutorenewIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </div>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  )
}
