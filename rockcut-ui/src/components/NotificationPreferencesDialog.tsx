import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import type { NotificationPrefs } from '../lib/types'
import { currentPushState, subscribePush, unsubscribePush, type PushState } from '../lib/push'

interface Props {
  open: boolean
  onClose: () => void
}

const EVENTS = [
  { event: 'shift_scheduled', label: "You've been scheduled" },
  { event: 'shift_changed', label: 'Your schedule has changed' },
  { event: 'shift_reminder', label: 'Shift reminder' },
  { event: 'open_shift', label: 'Open shift available' },
]
const CHANNELS = [
  { key: 'in_app', label: 'In-app', enabled: true, def: true },
  { key: 'email', label: 'Email', enabled: true, def: true },
  { key: 'sms', label: 'SMS', enabled: false, def: false },
  { key: 'push', label: 'Push', enabled: true, def: false },
]

export default function NotificationPreferencesDialog({ open, onClose }: Props) {
  const qc = useQueryClient()
  const { data: prefs = {} } = useQuery({
    queryKey: ['notification_preferences'],
    queryFn: async () => (await api.get<{ data: NotificationPrefs }>('/api/notification_preferences')).data.data,
    enabled: open,
  })

  const [pushState, setPushState] = useState<PushState>('unsubscribed')
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => {
    if (open) currentPushState().then(setPushState)
  }, [open])

  const isOn = (event: string, ch: (typeof CHANNELS)[number]) => prefs[event]?.[ch.key] ?? ch.def

  const writePrefs = async (next: NotificationPrefs) => {
    qc.setQueryData(['notification_preferences'], next) // optimistic
    await api.put('/api/notification_preferences', { prefs: next })
    qc.invalidateQueries({ queryKey: ['notification_preferences'] })
  }

  const toggle = (event: string, chKey: string, value: boolean) =>
    writePrefs({ ...prefs, [event]: { ...(prefs[event] ?? {}), [chKey]: value } })

  const enablePush = async () => {
    setPushBusy(true)
    try {
      const state = await subscribePush()
      setPushState(state)
      if (state === 'subscribed') {
        // Turn the Push column on for every event so it works right away.
        const next: NotificationPrefs = { ...prefs }
        for (const e of EVENTS) next[e.event] = { ...(next[e.event] ?? {}), push: true }
        await writePrefs(next)
      }
    } finally {
      setPushBusy(false)
    }
  }

  const disablePush = async () => {
    setPushBusy(true)
    try {
      setPushState(await unsubscribePush())
    } finally {
      setPushBusy(false)
    }
  }

  const pushNotice = () => {
    switch (pushState) {
      case 'unsupported':
        return (
          <Alert severity="info" sx={{ mb: 2 }}>
            Push isn't available here. Open the installed app (on iPhone, add it to your Home Screen
            first), then enable push from there.
          </Alert>
        )
      case 'denied':
        return (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Notifications are blocked for this site. Allow them in your browser settings, then reopen
            this dialog.
          </Alert>
        )
      case 'subscribed':
        return (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <NotificationsActiveIcon color="success" fontSize="small" />
            <Typography variant="body2" sx={{ flexGrow: 1 }}>
              Push is enabled on this device.
            </Typography>
            <Button size="small" onClick={disablePush} disabled={pushBusy}>
              Disable
            </Button>
          </Stack>
        )
      default:
        return (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ flexGrow: 1 }}>
              Get push notifications on this device.
            </Typography>
            <Button size="small" variant="contained" onClick={enablePush} disabled={pushBusy}>
              Enable push
            </Button>
          </Stack>
        )
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Notification preferences</DialogTitle>
      <DialogContent>
        {pushNotice()}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Choose how you're notified. SMS is coming soon.
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell />
              {CHANNELS.map((c) => (
                <TableCell key={c.key} align="center">{c.label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {EVENTS.map((e) => (
              <TableRow key={e.event}>
                <TableCell>{e.label}</TableCell>
                {CHANNELS.map((c) => (
                  <TableCell key={c.key} align="center">
                    {c.enabled ? (
                      <Switch
                        size="small"
                        checked={isOn(e.event, c)}
                        onChange={(ev) => toggle(e.event, c.key, ev.target.checked)}
                      />
                    ) : (
                      <Tooltip title="Coming soon">
                        <Box component="span" sx={{ color: 'text.disabled' }}>—</Box>
                      </Tooltip>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  )
}
