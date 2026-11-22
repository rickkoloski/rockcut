import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Box, Button, Chip, IconButton, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import FormDialog from '../../components/FormDialog'
import ConfirmDialog from '../../components/ConfirmDialog'
import DecimalInput from '../../components/DecimalInput'
import { useApiCreate, useApiDelete, useApiUpdate } from '../../hooks/useApiMutation'
import api from '../../lib/api'
import { parseDecimal } from '../../lib/brewingUnits'
import parseApiError from '../../lib/parseApiError'
import { lbText } from '../../lib/yeast'
import type { YeastBrink } from '../../lib/types'

interface Reply {
  data: YeastBrink[]
  can_manage: boolean
}

const KEYS = [['yeast_brinks']]

/**
 * D64 §6.5 (A7): Yeast settings → Brinks: name, empty weight (lb), order and
 * active; add, rename, retire (refused while it has yeast) and restore, and
 * delete when it has no history. Brewery managers and owners change them;
 * everyone else reads them.
 */
export default function BrinkSettings() {
  const { data: reply, isLoading } = useQuery<Reply>({
    queryKey: ['yeast_brinks', 'all'],
    queryFn: async () => (await api.get<Reply>('/api/yeast/brinks', { params: { all: 'true' } })).data,
  })
  const [editing, setEditing] = useState<YeastBrink | 'new' | null>(null)
  const [deleting, setDeleting] = useState<YeastBrink | null>(null)
  const [error, setError] = useState<string | null>(null)
  const update = useApiUpdate<YeastBrink>((id) => `/api/yeast/brinks/${id}`, { invalidateKeys: KEYS })
  const remove = useApiDelete((id) => `/api/yeast/brinks/${id}`, { invalidateKeys: KEYS })
  const brinks = reply?.data ?? []
  const canManage = !!reply?.can_manage

  const setActive = async (b: YeastBrink, active: boolean) => {
    setError(null)
    try {
      await update.mutateAsync({ id: b.id, active })
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const doDelete = async () => {
    if (!deleting) return
    try {
      await remove.mutateAsync(deleting.id)
      setDeleting(null)
    } catch (err) {
      setDeleting(null)
      setError(parseApiError(err))
    }
  }

  return (
    <Box sx={{ mb: 3 }} data-testid="brink-settings">
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Brinks
        </Typography>
        {canManage && (
          <Button startIcon={<AddIcon />} onClick={() => setEditing('new')} data-testid="brink-add">
            Add brink
          </Button>
        )}
      </Box>
      {!isLoading && !canManage && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} data-testid="brinks-read-only">
          Only Brewery managers and owners change these.
        </Typography>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell align="right">Empty weight</TableCell>
            {canManage && <TableCell align="right" />}
          </TableRow>
        </TableHead>
        <TableBody>
          {brinks.map((b) => (
            <TableRow key={b.id} data-testid={`brink-setting-${b.id}`} sx={{ opacity: b.active ? 1 : 0.6 }}>
              <TableCell sx={{ overflowWrap: 'anywhere' }}>
                {b.name}
                {!b.active && <Chip size="small" label="Retired" sx={{ ml: 1 }} />}
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                {b.empty_weight_lb != null ? lbText(b.empty_weight_lb) : '—'}
              </TableCell>
              {canManage && (
                <TableCell align="right" sx={{ whiteSpace: 'nowrap', pr: 0 }}>
                  <Tooltip title="Edit">
                    <IconButton size="small" aria-label={`Edit ${b.name}`} onClick={() => setEditing(b)} data-testid={`brink-setting-${b.id}-edit`}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Button size="small" disabled={update.isPending} onClick={() => setActive(b, !b.active)} data-testid={`brink-setting-${b.id}-active`}>
                    {b.active ? 'Retire' : 'Restore'}
                  </Button>
                  <Tooltip title={b.has_history ? 'It has history: retire it instead' : 'Delete'}>
                    <span>
                      <IconButton size="small" color="error" aria-label={`Delete ${b.name}`} disabled={b.has_history} onClick={() => setDeleting(b)} data-testid={`brink-setting-${b.id}-delete`}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {editing && <BrinkForm brink={editing === 'new' ? null : editing} next={brinks.length} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} title="Delete brink" message={`Delete ${deleting?.name}? It has no history.`} loading={remove.isPending} />
    </Box>
  )
}

function BrinkForm({ brink, next, onClose }: { brink: YeastBrink | null; next: number; onClose: () => void }) {
  const [name, setName] = useState(brink?.name ?? '')
  const [weight, setWeight] = useState(brink?.empty_weight_lb != null ? String(Number(brink.empty_weight_lb)) : '')
  const [position, setPosition] = useState(String(brink?.position ?? next))
  const [error, setError] = useState<string | null>(null)
  const create = useApiCreate<YeastBrink>('/api/yeast/brinks', { invalidateKeys: KEYS })
  const update = useApiUpdate<YeastBrink>((id) => `/api/yeast/brinks/${id}`, { invalidateKeys: KEYS })
  const w = parseDecimal(weight, 2)
  const weightError = w.ok && w.value != null && Number(w.value) <= 0 ? 'More than 0, or empty for none' : null
  const positionOk = /^\d{1,4}$/.test(position.trim())

  const submit = async () => {
    if (!name.trim()) return setError('Enter the name')
    const payload = { name: name.trim(), empty_weight_lb: w.ok ? w.value : null, position: Number(position.trim()) }
    try {
      if (brink) await update.mutateAsync({ id: brink.id, ...payload })
      else await create.mutateAsync(payload)
      onClose()
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  return (
    <FormDialog
      open
      onClose={onClose}
      title={brink ? `Edit ${brink.name}` : 'Add brink'}
      onSubmit={submit}
      loading={create.isPending || update.isPending}
      error={error}
      submitDisabled={!w.ok || !!weightError || !positionOk}
      testId="brink-setting-dialog"
    >
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth slotProps={{ htmlInput: { maxLength: 40, 'data-testid': 'brink-setting-name' } }} />
      <DecimalInput
        decimals={2}
        label="Empty weight (lb)"
        value={weight}
        onChange={setWeight}
        error={!!weightError}
        helperText={weightError ?? 'Shown beside the yeast weight; never subtracted'}
        fullWidth
        slotProps={{ htmlInput: { 'data-testid': 'brink-setting-weight' } }}
      />
      <TextField
        label="Order"
        value={position}
        onChange={(e) => setPosition(e.target.value)}
        error={!positionOk}
        helperText={positionOk ? 'Lower comes first' : 'A whole number, 0 or more'}
        fullWidth
        slotProps={{ htmlInput: { inputMode: 'numeric', 'data-testid': 'brink-setting-position' } }}
      />
    </FormDialog>
  )
}
