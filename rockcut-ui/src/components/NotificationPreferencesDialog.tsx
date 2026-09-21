import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import type { NotificationPrefs } from '../lib/types'

interface Props {
  open: boolean
  onClose: () => void
}

const EVENTS = [
  { event: 'shift_published', label: 'Shift published' },
  { event: 'shift_assigned', label: 'New assignment' },
  { event: 'open_shift', label: 'Open shift available' },
]
const CHANNELS = [
  { key: 'in_app', label: 'In-app', enabled: true, def: true },
  { key: 'email', label: 'Email', enabled: true, def: true },
  { key: 'sms', label: 'SMS', enabled: false, def: false },
  { key: 'push', label: 'Push', enabled: false, def: false },
]

export default function NotificationPreferencesDialog({ open, onClose }: Props) {
  const qc = useQueryClient()
  const { data: prefs = {} } = useQuery({
    queryKey: ['notification_preferences'],
    queryFn: async () => (await api.get<{ data: NotificationPrefs }>('/api/notification_preferences')).data.data,
    enabled: open,
  })

  const isOn = (event: string, ch: (typeof CHANNELS)[number]) => prefs[event]?.[ch.key] ?? ch.def

  const toggle = async (event: string, chKey: string, value: boolean) => {
    const next: NotificationPrefs = { ...prefs, [event]: { ...(prefs[event] ?? {}), [chKey]: value } }
    qc.setQueryData(['notification_preferences'], next) // optimistic
    await api.put('/api/notification_preferences', { prefs: next })
    qc.invalidateQueries({ queryKey: ['notification_preferences'] })
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Notification preferences</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Choose how you're notified. SMS and Push are coming soon.
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
