import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Badge,
  Box,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import TagIcon from '@mui/icons-material/Tag'
import { useQueryClient } from '@tanstack/react-query'
import { useApiQuery } from '../../hooks/useApiQuery'
import useAuth from '../../hooks/useAuth'
import api from '../../lib/api'
import PageHeader from '../../components/PageHeader'
import type { Channel, ChatMessage } from '../../lib/types'

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function Messages() {
  const { key: routeKey } = useParams()
  const navigate = useNavigate()
  const theme = useTheme()
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'))
  const qc = useQueryClient()
  const { user } = useAuth()

  const { data: channels = [] } = useApiQuery<Channel[]>(['channels'], '/api/channels', undefined, {
    refetchInterval: 15000,
  })

  const selectedKey = routeKey || (isDesktop ? channels[0]?.key : undefined)
  const selected = useMemo(() => channels.find((c) => c.key === selectedKey), [channels, selectedKey])

  const { data: messages = [] } = useApiQuery<ChatMessage[]>(
    ['messages', selectedKey],
    `/api/channels/${selectedKey}/messages`,
    undefined,
    { enabled: !!selectedKey, refetchInterval: 8000 },
  )

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to newest whenever the thread grows or the channel changes.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, selectedKey])

  // Mark the open channel read (and refresh unread badges) as messages arrive.
  useEffect(() => {
    if (!selectedKey) return
    api
      .post(`/api/channels/${selectedKey}/read`)
      .then(() => {
        qc.invalidateQueries({ queryKey: ['channels'] })
        qc.invalidateQueries({ queryKey: ['messages_unread'] })
      })
      .catch(() => {})
  }, [selectedKey, messages.length, qc])

  const openChannel = (key: string) => navigate(`/messages/${key}`)

  const send = async () => {
    const body = draft.trim()
    if (!body || !selectedKey) return
    setSending(true)
    try {
      await api.post(`/api/channels/${selectedKey}/messages`, { body })
      setDraft('')
      qc.invalidateQueries({ queryKey: ['messages', selectedKey] })
    } finally {
      setSending(false)
    }
  }

  const channelList = (
    <List disablePadding sx={{ width: { xs: '100%', md: 260 }, flexShrink: 0 }}>
      {channels.map((c) => (
        <ListItemButton
          key={c.key}
          selected={c.key === selectedKey}
          onClick={() => openChannel(c.key)}
          sx={{ borderRadius: 1, mb: 0.5 }}
        >
          <TagIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
          <ListItemText primary={c.name} />
          {c.unread > 0 && <Badge badgeContent={c.unread} color="error" sx={{ mr: 1.5 }} />}
        </ListItemButton>
      ))}
    </List>
  )

  const thread = selected ? (
    <Paper variant="outlined" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '70vh' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        {!isDesktop && (
          <IconButton size="small" onClick={() => navigate('/messages')}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        )}
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {selected.name}
        </Typography>
      </Stack>

      <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}>
        {messages.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
            No messages yet. Say hello 👋
          </Typography>
        ) : (
          messages.map((m) => {
            const mine = m.user?.id === user?.id
            return (
              <Box key={m.id} sx={{ mb: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="baseline">
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {mine ? 'You' : m.user?.name || m.user?.email || 'Unknown'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatTime(m.inserted_at)}
                  </Typography>
                </Stack>
                <Typography sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</Typography>
              </Box>
            )
          })
        )}
        <div ref={bottomRef} />
      </Box>

      <Divider />
      <Stack direction="row" spacing={1} sx={{ p: 1.5 }}>
        <TextField
          fullWidth
          size="small"
          multiline
          maxRows={4}
          placeholder={`Message ${selected.name}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <IconButton color="primary" onClick={send} disabled={sending || !draft.trim()}>
          <SendIcon />
        </IconButton>
      </Stack>
    </Paper>
  ) : (
    <Paper variant="outlined" sx={{ flexGrow: 1, display: { xs: 'none', md: 'flex' }, alignItems: 'center', justifyContent: 'center', height: '70vh' }}>
      <Typography color="text.secondary">Select a channel</Typography>
    </Paper>
  )

  return (
    <>
      <PageHeader breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Messages' }]} title="Messages" />
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        {/* On mobile show either the list or the thread. */}
        {(isDesktop || !selectedKey) && channelList}
        {(isDesktop || selectedKey) && thread}
      </Stack>
    </>
  )
}
