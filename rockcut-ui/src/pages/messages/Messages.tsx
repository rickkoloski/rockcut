import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Alert, Box, Divider, IconButton, Stack, TextField, Typography, Paper } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import { useQueryClient } from '@tanstack/react-query'
import { useApiQuery } from '../../hooks/useApiQuery'
import useAuth from '../../hooks/useAuth'
import api from '../../lib/api'
import PageHeader from '../../components/PageHeader'
import parseApiError from '../../lib/parseApiError'
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

  const { data: channels = [], isSuccess: channelsLoaded } = useApiQuery<Channel[]>(['channels'], '/api/channels', undefined, {
    refetchInterval: 15000,
  })
  const selected = useMemo(() => channels.find((c) => c.key === selectedKey), [channels, selectedKey])

  // Bare /messages → open the first channel the user can see. A channel the
  // user can't see (typed or stale URL) goes back to /messages too (3939):
  // never an empty channel with a message box.
  useEffect(() => {
    if (!channelsLoaded) return
    if (selectedKey && !selected) {
      navigate('/messages', { replace: true })
    } else if (!selectedKey && channels.length > 0) {
      navigate(`/messages/${channels[0].key}`, { replace: true })
    }
  }, [channelsLoaded, selectedKey, selected, channels, navigate])

  // Only fetch (and poll) a channel that's in the user's list, so an unknown
  // key never polls into 403s (3939).
  const { data: messages = [] } = useApiQuery<ChatMessage[]>(
    ['messages', selectedKey],
    `/api/channels/${selectedKey}/messages`,
    undefined,
    { enabled: !!selected, refetchInterval: 8000 },
  )

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<{ key: string; message: string } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, selectedKey])

  // Mark the open channel read (refreshing the nav badges) as messages arrive.
  useEffect(() => {
    if (!selected) return
    api
      .post(`/api/channels/${selectedKey}/read`)
      .then(() => qc.invalidateQueries({ queryKey: ['channels'] }))
      .catch(() => {})
  }, [selected, selectedKey, messages.length, qc])

  const send = async () => {
    const body = draft.trim()
    if (!body || !selectedKey) return
    setSending(true)
    setSendError(null)
    try {
      await api.post(`/api/channels/${selectedKey}/messages`, { body })
      setDraft('')
      qc.invalidateQueries({ queryKey: ['messages', selectedKey] })
    } catch (err) {
      // A failed send is never silent (3939); the draft is kept.
      const status = (err as { response?: { status?: number } })?.response?.status
      setSendError({
        key: selectedKey,
        message: status === 403 ? "You can't post in this channel." : parseApiError(err),
      })
      qc.invalidateQueries({ queryKey: ['channels'] })
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

      {selected ? (
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
          {sendError && sendError.key === selectedKey && (
            <Alert data-testid="send-error" severity="error" onClose={() => setSendError(null)} sx={{ m: 1.5, mb: 0 }}>
              {sendError.message}
            </Alert>
          )}
          {selected.can_post === false ? (
            // D33: shared devices read but never post.
            <Typography data-testid="read-only-notice" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
              Shared devices can read but not post.
            </Typography>
          ) : (
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
            <IconButton aria-label="Send message" color="primary" onClick={send} disabled={sending || !draft.trim()}>
              <SendIcon />
            </IconButton>
          </Stack>
          )}
        </Paper>
      ) : (
        <Typography color="text.secondary">{channelsLoaded ? 'Select a channel from the Messages menu.' : 'Loading…'}</Typography>
      )}
    </>
  )
}
