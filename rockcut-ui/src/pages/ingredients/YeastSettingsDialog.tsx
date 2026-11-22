import { useState } from 'react'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import FormDialog from '../../components/FormDialog'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useApiCreate, useApiDelete, useApiUpdate } from '../../hooks/useApiMutation'
import { usePhoneBackCloses } from '../../hooks/useBackCloses'
import { STRAIN_TYPES_KEY, useStrainTypes } from '../../hooks/useStrainTypes'
import parseApiError from '../../lib/parseApiError'
import type { YeastStrainType } from '../../lib/types'

const KEYS = [STRAIN_TYPES_KEY, ['ingredients'], ['ingredient_products']]

/**
 * D64 §6.5 (A7, A13): the yeast settings from the gear on Yeast Strains.
 * Stop 1 has the Strain types section (Stop 2 adds Brinks): name and order;
 * add, rename, retire (and restore), and delete when no strain has it.
 * Brewery managers and owners change it; everyone else sees it read-only.
 */
export default function YeastSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const { data: reply, isLoading } = useStrainTypes()
  const [editing, setEditing] = useState<YeastStrainType | 'new' | null>(null)
  const [deleting, setDeleting] = useState<YeastStrainType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const update = useApiUpdate<YeastStrainType>((id) => `/api/yeast/strain_types/${id}`, { invalidateKeys: KEYS })
  const remove = useApiDelete((id) => `/api/yeast/strain_types/${id}`, { invalidateKeys: KEYS })
  usePhoneBackCloses(open && !editing && !deleting, onClose)

  const types = reply?.data ?? []
  const canManage = !!reply?.can_manage

  const setActive = async (t: YeastStrainType, active: boolean) => {
    setError(null)
    try {
      await update.mutateAsync({ id: t.id, active })
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
    <Dialog open={open} onClose={onClose} fullScreen={phone} fullWidth maxWidth="sm" data-testid="yeast-settings">
      <DialogTitle>Yeast settings</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Strain types
          </Typography>
          {canManage && (
            <Button startIcon={<AddIcon />} onClick={() => setEditing('new')} data-testid="strain-type-add">
              Add strain type
            </Button>
          )}
        </Box>
        {!isLoading && !canManage && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} data-testid="strain-types-read-only">
            Only Brewery managers and owners change these.
          </Typography>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        <Table size="small" data-testid="strain-types">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell align="right">Strains</TableCell>
              {canManage && <TableCell align="right" />}
            </TableRow>
          </TableHead>
          <TableBody>
            {types.map((t) => (
              <TableRow key={t.id} data-testid={`strain-type-${t.id}`} sx={{ opacity: t.active ? 1 : 0.6 }}>
                <TableCell sx={{ overflowWrap: 'anywhere' }}>
                  {t.name}
                  {!t.active && <Chip size="small" label="Retired" sx={{ ml: 1 }} />}
                </TableCell>
                <TableCell align="right">{t.in_use}</TableCell>
                {canManage && (
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', pr: 0 }}>
                    <Tooltip title="Rename">
                      <IconButton size="small" aria-label={`Rename ${t.name}`} onClick={() => setEditing(t)} data-testid={`strain-type-${t.id}-edit`}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Button size="small" disabled={update.isPending} onClick={() => setActive(t, !t.active)} data-testid={`strain-type-${t.id}-active`}>
                      {t.active ? 'Retire' : 'Restore'}
                    </Button>
                    <Tooltip title={t.in_use > 0 ? 'Strains use this type: retire it instead' : 'Delete'}>
                      <span>
                        <IconButton size="small" color="error" aria-label={`Delete ${t.name}`} disabled={t.in_use > 0} onClick={() => setDeleting(t)} data-testid={`strain-type-${t.id}-delete`}>
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="yeast-settings-close">
          Close
        </Button>
      </DialogActions>
      {editing && <StrainTypeForm type={editing === 'new' ? null : editing} next={types.length} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={doDelete}
        title="Delete strain type"
        message={`Delete "${deleting?.name}"? No strain has it.`}
        loading={remove.isPending}
      />
    </Dialog>
  )
}

function StrainTypeForm({ type, next, onClose }: { type: YeastStrainType | null; next: number; onClose: () => void }) {
  const [name, setName] = useState(type?.name ?? '')
  const [position, setPosition] = useState(String(type?.position ?? next))
  const [error, setError] = useState<string | null>(null)
  const create = useApiCreate<YeastStrainType>('/api/yeast/strain_types', { invalidateKeys: KEYS })
  const update = useApiUpdate<YeastStrainType>((id) => `/api/yeast/strain_types/${id}`, { invalidateKeys: KEYS })
  const positionOk = /^\d{1,4}$/.test(position.trim())

  const submit = async () => {
    if (!name.trim()) return setError('Enter the name')
    const payload = { name: name.trim(), position: Number(position.trim()) }
    try {
      if (type) await update.mutateAsync({ id: type.id, ...payload })
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
      title={type ? 'Rename strain type' : 'Add strain type'}
      onSubmit={submit}
      loading={create.isPending || update.isPending}
      error={error}
      submitDisabled={!positionOk}
      testId="strain-type-dialog"
    >
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth slotProps={{ htmlInput: { maxLength: 40, 'data-testid': 'strain-type-name' } }} />
      <TextField
        label="Order"
        value={position}
        onChange={(e) => setPosition(e.target.value)}
        error={!positionOk}
        helperText={positionOk ? 'Lower comes first' : 'A whole number, 0 or more'}
        fullWidth
        slotProps={{ htmlInput: { inputMode: 'numeric', 'data-testid': 'strain-type-position' } }}
      />
    </FormDialog>
  )
}
