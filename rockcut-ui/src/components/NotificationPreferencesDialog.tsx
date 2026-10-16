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
import useAuth from '../hooks/useAuth'
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
  { event: 'message_posted', label: 'New message' },
  { event: 'calendar_feed_rotated', label: 'Calendar link changed' },
  // D40 (spec §3.5): Brewery members only; push and the bell, never email.
  { event: 'task_shift_end', label: 'Unfinished tasks before shift end', brewery: true },
]
// Per-event default overrides (must match the backend). New messages skip the
// in-app bell by default (unread badges cover it). A changed calendar link
// (D35 Q3) is in-app and push, not email.
const EVENT_DEFAULTS: Record<string, Record<string, boolean>> = {
  message_posted: { in_app: false },
  calendar_feed_rotated: { email: false, push: true },
  task_shift_end: { email: false, push: true },
}
// Channels an event is never sent on (shown as "—").
const NOT_SENT: Record<string, string[]> = { task_shift_end: ['email'] }
const CHANNELS = [
  { key: 'in_app', label: 'In-app', enabled: true, def: true },
  // D43: email (a no-op on prod since D28) and SMS (never built) aren't offered.
  // Their stored preferences are kept; show them again when they're real.
  { key: 'email', label: 'Email', enabled: true, def: true, hidden: true },
  { key: 'sms', label: 'SMS', enabled: false, def: false, hidden: true },
  { key: 'push', label: 'Push', enabled: true, def: false },
]
const SHOWN = CHANNELS.filter((c) => !c.hidden)

export default function NotificationPreferencesDialog({ open, onClose }: Props) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const breweryMember = !!user?.memberships?.some((m) => m.department_key === 'brewery')
  const events = EVENTS.filter((e) => !e.brewery || breweryMember)
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

  const isOn = (event: string, ch: (typeof CHANNELS)[number]) =>
    prefs[event]?.[ch.key] ?? EVENT_DEFAULTS[event]?.[ch.key] ?? ch.def

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
        for (const e of events) next[e.event] = { ...(next[e.event] ?? {}), push: true }
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
          Choose how you're notified.
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell />
              {SHOWN.map((c) => (
                <TableCell key={c.key} align="center">{c.label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {events.map((e) => (
              <TableRow key={e.event} data-testid={`notification-pref-${e.event}`}>
                <TableCell>{e.label}</TableCell>
                {SHOWN.map((c) => (
                  <TableCell key={c.key} align="center">
                    {c.enabled && !NOT_SENT[e.event]?.includes(c.key) ? (
                      <Switch
                        size="small"
                        checked={isOn(e.event, c)}
                        onChange={(ev) => toggle(e.event, c.key, ev.target.checked)}
                        slotProps={{ input: { 'aria-label': `${e.label}: ${c.label}` } }}
                      />
                    ) : (
                      <Tooltip title={c.enabled ? 'Not sent this way' : 'Coming soon'}>
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
