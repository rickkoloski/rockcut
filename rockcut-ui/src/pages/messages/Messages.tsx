import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Box, Divider, IconButton, Stack, TextField, Typography, Paper } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
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
  const { key: selectedKey } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()

  const { data: channels = [] } = useApiQuery<Channel[]>(['channels'], '/api/channels', undefined, {
    refetchInterval: 15000,
  })
  const selected = useMemo(() => channels.find((c) => c.key === selectedKey), [channels, selectedKey])

  // Bare /messages → open the first channel the user can see.
  useEffect(() => {
    if (!selectedKey && channels.length > 0) {
      navigate(`/messages/${channels[0].key}`, { replace: true })
    }
  }, [selectedKey, channels, navigate])

  const { data: messages = [] } = useApiQuery<ChatMessage[]>(
    ['messages', selectedKey],
    `/api/channels/${selectedKey}/messages`,
    undefined,
    { enabled: !!selectedKey, refetchInterval: 8000 },
  )

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, selectedKey])

  // Mark the open channel read (refreshing the nav badges) as messages arrive.
  useEffect(() => {
    if (!selectedKey) return
    api
      .post(`/api/channels/${selectedKey}/read`)
      .then(() => qc.invalidateQueries({ queryKey: ['channels'] }))
      .catch(() => {})
  }, [selectedKey, messages.length, qc])

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

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Messages' }]}
        title={selected?.name ?? 'Messages'}
      />

      {selectedKey ? (
        <Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', height: '72vh' }}>
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
              placeholder={`Message ${selected?.name ?? ''}`}
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
        <Typography color="text.secondary">Select a channel from the Messages menu.</Typography>
      )}
    </>
  )
}
