import { useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  Menu,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import NotificationsIcon from '@mui/icons-material/Notifications'
import SettingsIcon from '@mui/icons-material/Settings'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import type { AppNotification } from '../lib/types'
import NotificationPreferencesDialog from './NotificationPreferencesDialog'

export default function NotificationBell() {
  const qc = useQueryClient()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [prefsOpen, setPrefsOpen] = useState(false)

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get<{ data: AppNotification[]; unread: number }>('/api/notifications')).data,
    refetchInterval: 60_000,
  })

  const items = data?.data ?? []
  const unread = data?.unread ?? 0

  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] })

  const openMenu = (e: React.MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)
  const closeMenu = () => setAnchor(null)

  const markRead = async (n: AppNotification) => {
    if (!n.read_at) {
      await api.post(`/api/notifications/${n.id}/read`, {})
      invalidate()
    }
  }
  const markAll = async () => {
    await api.post('/api/notifications/read_all', {})
    invalidate()
  }

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton onClick={openMenu} sx={{ color: 'text.secondary' }}>
          <Badge badgeContent={unread} color="error">
            <NotificationsIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={closeMenu}
        slotProps={{ paper: { sx: { width: 360, maxWidth: '90vw' } } }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Notifications</Typography>
          <Box>
            <Button size="small" disabled={unread === 0} onClick={markAll}>Mark all read</Button>
            <Tooltip title="Preferences">
              <IconButton size="small" onClick={() => { closeMenu(); setPrefsOpen(true) }}>
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Stack>
        <Divider />
        {items.length === 0 ? (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography variant="body2" color="text.secondary">You're all caught up.</Typography>
          </Box>
        ) : (
          <Box sx={{ maxHeight: 360, overflowY: 'auto' }}>
            {items.map((n) => (
              <Box
                key={n.id}
                onClick={() => markRead(n)}
                sx={{
                  px: 2, py: 1, cursor: 'pointer',
                  bgcolor: n.read_at ? 'transparent' : 'action.hover',
                  '&:hover': { bgcolor: 'action.selected' },
                  borderBottom: '1px solid', borderColor: 'divider',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: n.read_at ? 400 : 700 }}>{n.title}</Typography>
                {n.body && <Typography variant="body2" color="text.secondary">{n.body}</Typography>}
                <Typography variant="caption" color="text.disabled">
                  {new Date(n.inserted_at).toLocaleString()}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Menu>

      <NotificationPreferencesDialog open={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </>
  )
}
