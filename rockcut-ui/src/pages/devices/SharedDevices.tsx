import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../components/PageHeader'
import FormDialog from '../../components/FormDialog'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useApiQuery } from '../../hooks/useApiQuery'
import useAuth from '../../hooks/useAuth'
import api from '../../lib/api'
import parseApiError from '../../lib/parseApiError'
import type { Department, DeviceTablet, SharedDevice } from '../../lib/types'

const DENVER = 'America/Denver'

function formatStamp(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    timeZone: DENVER,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function secondsLeft(iso: string): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000))
}

// The pairing code is shown once; it's single use and expires in 10 minutes.
function PairingCodeDialog({ pairing, onClose }: { pairing: { device: string; code: string; expiresAt: string } | null; onClose: () => void }) {
  // Re-render once a second while the dialog is open; the countdown is derived.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!pairing) return
    const t = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [pairing])
  const left = pairing ? Math.min(secondsLeft(pairing.expiresAt), 600) : 0

  return (
    <Dialog open={!!pairing} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Pair a tablet to {pairing?.device}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          On the tablet, open Rockcut, choose <strong>Set up as a shared device</strong>, and enter this code with a name for
          the tablet. The code works once.
        </Typography>
        <Typography
          data-testid="pairing-code"
          aria-label="Pairing code"
          sx={{ fontFamily: 'monospace', fontSize: 36, letterSpacing: 4, textAlign: 'center', my: 2 }}
        >
          {pairing?.code}
        </Typography>
        <Typography variant="body2" color={left > 0 ? 'text.secondary' : 'error'} sx={{ textAlign: 'center' }}>
          {left > 0 ? `Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Expired — generate a new code'}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  )
}

export default function SharedDevices() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const isOwner = !!user?.is_owner
  const { data: devices = [], isLoading } = useApiQuery<SharedDevice[]>(['devices'], '/api/devices')
  const { data: departments = [] } = useApiQuery<Department[]>(['departments'], '/api/departments', undefined, { enabled: isOwner })
  const assignable = departments.filter((d) => d.assignable !== false)

  const [editing, setEditing] = useState<SharedDevice | 'new' | null>(null)
  const [name, setName] = useState('')
  const [homeId, setHomeId] = useState<number | ''>('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [pairing, setPairing] = useState<{ device: string; code: string; expiresAt: string } | null>(null)
  const [revoking, setRevoking] = useState<{ device: SharedDevice; tablet: DeviceTablet } | null>(null)
  const [deleting, setDeleting] = useState<SharedDevice | null>(null)
  const [deactivating, setDeactivating] = useState<SharedDevice | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['devices'] })
  }

  const openCreate = () => {
    setEditing('new')
    setName('')
    setHomeId(assignable.find((d) => d.key === 'bar')?.id ?? assignable[0]?.id ?? '')
    setFormError(null)
  }

  const openEdit = (d: SharedDevice) => {
    setEditing(d)
    setName(d.name)
    setHomeId(d.home_department_id)
    setFormError(null)
  }

  const save = async () => {
    setSaving(true)
    setFormError(null)
    try {
      const body = { name: name.trim(), home_department_id: homeId }
      if (editing === 'new') await api.post('/api/devices', body)
      else if (editing) await api.patch(`/api/devices/${editing.id}`, body)
      setEditing(null)
      refresh()
    } catch (err) {
      setFormError(parseApiError(err))
    } finally {
      setSaving(false)
    }
  }

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setPageError(null)
    try {
      await fn()
      refresh()
    } catch (err) {
      setPageError(parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const pair = (d: SharedDevice) =>
    run(async () => {
      const { data } = await api.post<{ code: string; expires_at: string }>(`/api/devices/${d.id}/pairing_code`)
      setPairing({ device: d.name, code: data.code, expiresAt: data.expires_at })
    })

  const setActive = (d: SharedDevice, active: boolean) => run(() => api.patch(`/api/devices/${d.id}`, { active }))

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shared devices' }]}
        title="Shared devices"
        action={isOwner ? { label: 'Add shared device', onClick: openCreate, testId: 'add-device' } : undefined}
      />

      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Shared devices are tablets that stay signed in behind the bar. They can read the schedule and their channels but can’t post,
        claim shifts or see anything personal. Revoke a lost tablet here; it’s signed out on its next request.
      </Typography>

      {pageError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setPageError(null)}>
          {pageError}
        </Alert>
      )}

      {!isLoading && devices.length === 0 && (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {isOwner ? 'No shared devices yet. Add one to pair tablets to it.' : 'No shared devices in your departments.'}
          </Typography>
        </Paper>
      )}

      <Stack spacing={2}>
        {devices.map((d) => {
          const tablets = d.tokens ?? []
          return (
            <Paper key={d.id} data-testid={`device-row-${d.id}`} variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="h6" sx={{ mr: 1 }}>
                  {d.name}
                </Typography>
                <Chip size="small" label={`Home: ${d.home_department?.name ?? '—'}`} />
                {!d.active && <Chip size="small" color="default" variant="outlined" label="Deactivated" />}
                <Box sx={{ flexGrow: 1 }} />
                {/* DEV G9: a deactivated device can't get codes (the API says 422 too). */}
                {d.active && (
                  <Button
                    data-testid={`pair-tablet-${d.id}`}
                    variant="contained"
                    size="small"
                    disabled={busy}
                    onClick={() => pair(d)}
                  >
                    Pair a tablet
                  </Button>
                )}
                {isOwner && (
                  <>
                    <Button
                      data-testid={`toggle-device-${d.id}`}
                      size="small"
                      disabled={busy}
                      onClick={() => (d.active ? setDeactivating(d) : setActive(d, true))}
                    >
                      {d.active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                    <Tooltip title="Rename">
                      <IconButton aria-label={`Rename ${d.name}`} size="small" onClick={() => openEdit(d)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton aria-label={`Delete ${d.name}`} size="small" onClick={() => setDeleting(d)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
              </Box>

              {tablets.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  No tablets paired yet.
                </Typography>
              ) : (
                <Table size="small" sx={{ mt: 1 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Tablet</TableCell>
                      <TableCell>Paired by</TableCell>
                      <TableCell>Paired</TableCell>
                      <TableCell>Last seen</TableCell>
                      <TableCell align="right">Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tablets.map((t) => (
                      <TableRow key={t.id} data-testid={`tablet-row-${t.id}`} sx={{ opacity: t.revoked_at ? 0.55 : 1 }}>
                        <TableCell>{t.name}</TableCell>
                        <TableCell>{t.paired_by?.name ?? t.paired_by?.email ?? '—'}</TableCell>
                        <TableCell>{formatStamp(t.paired_at)}</TableCell>
                        <TableCell data-testid={`tablet-last-seen-${t.id}`}>{formatStamp(t.last_seen_at)}</TableCell>
                        <TableCell align="right">
                          {t.revoked_at ? (
                            <Chip size="small" variant="outlined" label={`Revoked ${formatStamp(t.revoked_at)}`} />
                          ) : (
                            <Button
                              data-testid={`revoke-token-${t.id}`}
                              size="small"
                              color="error"
                              onClick={() => setRevoking({ device: d, tablet: t })}
                            >
                              Revoke
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Paper>
          )
        })}
      </Stack>

      <FormDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add shared device' : 'Edit shared device'}
        onSubmit={save}
        loading={saving}
        error={formError}
      >
        <TextField
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          fullWidth
          placeholder="Taproom tablets"
          slotProps={{ htmlInput: { 'data-testid': 'device-account-name', 'aria-label': 'Device name', maxLength: 100 } }}
        />
        <TextField
          select
          label="Home department"
          value={homeId}
          onChange={(e) => setHomeId(Number(e.target.value))}
          required
          fullWidth
          helperText="Decides which department channel and nav section the tablets see."
          slotProps={{ htmlInput: { 'data-testid': 'device-home' } }}
        >
          {assignable.map((dep) => (
            <MenuItem key={dep.id} value={dep.id}>
              {dep.name}
            </MenuItem>
          ))}
        </TextField>
      </FormDialog>

      <PairingCodeDialog pairing={pairing} onClose={() => setPairing(null)} />

      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={() =>
          revoking && run(() => api.delete(`/api/device_tokens/${revoking.tablet.id}`)).then(() => setRevoking(null))
        }
        title="Revoke tablet"
        message={`Sign out “${revoking?.tablet.name}” now? It will need a new pairing code to use Rockcut again.`}
        confirmLabel="Revoke"
        loading={busy}
      />

      {/* DEV G5: deactivating signs out every tablet, so it asks first. */}
      <ConfirmDialog
        open={!!deactivating}
        onClose={() => setDeactivating(null)}
        onConfirm={() => deactivating && setActive(deactivating, false).then(() => setDeactivating(null))}
        title="Deactivate shared device"
        message={`Deactivate “${deactivating?.name}”? Every tablet paired to it is signed out now, and each one needs a new pairing code after you reactivate it.`}
        confirmLabel="Deactivate"
        loading={busy}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && run(() => api.delete(`/api/devices/${deleting.id}`)).then(() => setDeleting(null))}
        title="Delete shared device"
        message={`Delete “${deleting?.name}” and sign out all its tablets? To pause it instead, use Deactivate.`}
        loading={busy}
      />
    </>
  )
}
