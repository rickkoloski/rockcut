import { useState } from 'react'
import { Button, Checkbox, FormControl, FormControlLabel, FormGroup, FormLabel, Switch, TextField } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useApiCreate, useApiDelete, useApiUpdate } from '../../hooks/useApiMutation'
import parseApiError from '../../lib/parseApiError'
import { GRAIN_KEYS, ROLES, ROLE_LABELS } from '../../lib/inventory'
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
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const keys = [...GRAIN_KEYS, ['parties']]
  const create = useApiCreate<Party>('/api/parties', { invalidateKeys: keys })
  const update = useApiUpdate<Party>((id) => `/api/parties/${id}`, { invalidateKeys: keys })
  const remove = useApiDelete((id) => `/api/parties/${id}`, { invalidateKeys: keys })
  const loading = create.isPending || update.isPending || remove.isPending

  const submit = async () => {
    if (roles.length === 0) return setError('Pick at least one role')
    const payload = { name: name.trim(), roles, notes: notes.trim() || null, active }
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
      secondaryAction={
        party && (
          <Button color="error" disabled={loading} data-testid="party-delete" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
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
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={2} fullWidth />
      {party && <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} data-testid="party-active" />} label="Active" />}
      {party && (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
          title="Delete company"
          message={`Delete ${party.name}? A company in use can't be deleted; make it inactive instead.`}
          loading={remove.isPending}
          testId="party-delete-confirm"
        />
      )}
    </FormDialog>
  )
}
