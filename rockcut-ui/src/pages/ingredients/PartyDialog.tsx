import { useState } from 'react'
import { Box, Button, Checkbox, FormControl, FormControlLabel, FormGroup, FormLabel, Switch, TextField, Typography } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useApiCreate, useApiDelete, useApiUpdate } from '../../hooks/useApiMutation'
import parseApiError from '../../lib/parseApiError'
import { GRAIN_KEYS, ROLES, ROLE_LABELS } from '../../lib/inventory'
import { parseSacks } from '../../lib/purchasing'
import type { Party, PartyRole } from '../../lib/types'

/** D60 §3.2: a company: name, roles (maltster, supplier, partner brewery), notes, active. */
export default function PartyDialog({ open, onClose, party }: { open: boolean; onClose: () => void; party?: Party }) {
  return open ? <PartyForm onClose={onClose} party={party} /> : null
}

function PartyForm({ onClose, party }: { onClose: () => void; party?: Party }) {
  const [name, setName] = useState(party?.name ?? '')
  const [roles, setRoles] = useState<PartyRole[]>(party?.roles ?? [])
  const [notes, setNotes] = useState(party?.notes ?? '')
  const [active, setActive] = useState(party?.active ?? true)
  // D61 decision 48: a supplier's order size in sacks (BSG: 40); empty is none.
  const [target, setTarget] = useState(party?.order_target_sacks != null ? String(party.order_target_sacks) : '')
  const targetSacks = parseSacks(target, 1)
  const targetOk = target.trim() === '' || targetSacks != null
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const keys = [...GRAIN_KEYS, ['parties']]
  const create = useApiCreate<Party>('/api/parties', { invalidateKeys: keys })
  const update = useApiUpdate<Party>((id) => `/api/parties/${id}`, { invalidateKeys: keys })
  const remove = useApiDelete((id) => `/api/parties/${id}`, { invalidateKeys: keys })
  const loading = create.isPending || update.isPending || remove.isPending
  // D61 carry-over 2: a company in use can't be deleted; Delete is disabled with the API's reason.
  const deleteBlocked = party?.delete_blocked ?? null

  const submit = async () => {
    if (roles.length === 0) return setError('Pick at least one role')
    const payload = {
      name: name.trim(),
      roles,
      notes: notes.trim() || null,
      active,
      order_target_sacks: roles.includes('supplier') && target.trim() !== '' ? targetSacks : null,
    }
    try {
      if (party) await update.mutateAsync({ id: party.id, ...payload })
      else await create.mutateAsync(payload)
      onClose()
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  // Gap 2: Delete asks first (as products and lots do); a refusal shows in this dialog.
  const handleDelete = async () => {
    if (!party) return
    try {
      await remove.mutateAsync(party.id)
      onClose()
    } catch (err) {
      setConfirmDelete(false)
      setError(parseApiError(err))
    }
  }

  const toggle = (role: PartyRole, on: boolean) => setRoles((rs) => (on ? ROLES.filter((r) => r === role || rs.includes(r)) : rs.filter((r) => r !== role)))

  return (
    <FormDialog
      open
      phone
      onClose={onClose}
      title={party ? 'Edit company' : 'Add company'}
      onSubmit={submit}
      loading={loading}
      error={error}
      testId="party-dialog"
      submitDisabled={roles.includes('supplier') && !targetOk}
      secondaryAction={
        party && (
          <Box sx={{ maxWidth: { xs: 160, sm: 260 } }}>
            <Button color="error" disabled={loading || !!deleteBlocked} data-testid="party-delete" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
            {deleteBlocked && (
              <Typography variant="caption" color="text.secondary" component="p" data-testid="party-delete-reason">
                {deleteBlocked}
              </Typography>
            )}
          </Box>
        )
      }
    >
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth autoFocus={!party} slotProps={{ htmlInput: { 'data-testid': 'party-name' } }} />
      <FormControl component="fieldset">
        <FormLabel component="legend">Roles</FormLabel>
        <FormGroup row>
          {ROLES.map((r) => (
            <FormControlLabel
              key={r}
              control={<Checkbox checked={roles.includes(r)} onChange={(e) => toggle(r, e.target.checked)} slotProps={{ input: { 'data-testid': `party-role-${r}` } as object }} />}
              label={ROLE_LABELS[r]}
            />
          ))}
        </FormGroup>
      </FormControl>
      {roles.includes('supplier') && (
        <TextField
          label="Order target (sacks)"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          error={!targetOk}
          helperText={targetOk ? 'Orders show progress to the next multiple (e.g. 40: "36 of 40 sacks"); empty for none' : 'Whole sacks, 1 or more'}
          fullWidth
          slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off', 'data-testid': 'party-order-target' } }}
        />
      )}
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={2} fullWidth />
      {party && <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} data-testid="party-active" />} label="Active" />}
      {party && (
        <ConfirmDialog
          open={confirmDelete && !deleteBlocked}
          onClose={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
          title="Delete company"
          message={`Delete ${party.name}?`}
          loading={remove.isPending}
          testId="party-delete-confirm"
        />
      )}
    </FormDialog>
  )
}
