import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import parseApiError from '../../lib/parseApiError'
import useAuth from '../../hooks/useAuth'
import type { Department, Role, User } from '../../lib/types'
import StaffCodeSection from './StaffCodeSection'
import { staffCodeError } from '../../lib/staffCode'

interface Props {
  open: boolean
  onClose: () => void
  editUser: User | null
  departments: Department[]
}

type RoleChoice = '' | Role

function readError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } } }
  return e?.response?.data?.error || parseApiError(err)
}

export default function UserFormDialog({ open, onClose, editUser, departments }: Props) {
  const qc = useQueryClient()
  const { user: actor, capabilities, staffCodes } = useAuth()
  const isOwnerActor = !!actor?.is_owner
  const isEdit = !!editUser

  // Only assignable departments bear roles ("Other" is scheduling-only).
  const assignableDepts = departments.filter((d) => d.assignable !== false)
  const managedKeys = isOwnerActor
    ? assignableDepts.map((d) => d.key)
    : capabilities?.manages_departments ?? []
  const manageableDepts = assignableDepts.filter((d) => managedKeys.includes(d.key))

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [active, setActive] = useState(true)
  const [isOwner, setIsOwner] = useState(false)
  const [schedulable, setSchedulable] = useState(true)
  const [roles, setRoles] = useState<Record<string, RoleChoice>>({})
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [codeDraft, setCodeDraft] = useState('')

  // D37: owners and Taproom managers see a Taproom member's staff code. Only
  // active Taproom members (as saved) can hold one.
  const showStaffCode =
    isEdit &&
    staffCodes &&
    !!editUser?.active &&
    !!editUser?.memberships?.some((m) => m.department_key === 'bar')

  useEffect(() => {
    if (!open) return
    setEmail(editUser?.email ?? '')
    setName(editUser?.name ?? '')
    setActive(editUser?.active ?? true)
    setIsOwner(editUser?.is_owner ?? false)
    setSchedulable(editUser?.schedulable ?? true)

    const initial: Record<string, RoleChoice> = {}
    for (const d of manageableDepts) {
      const m = editUser?.memberships?.find((mm) => mm.department_key === d.key)
      initial[d.key] = (m?.role as RoleChoice) ?? ''
    }
    setRoles(initial)
    setTempPassword(null)
    setError(null)
    setCodeDraft('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editUser])

  const memberships = () =>
    manageableDepts
      .filter((d) => roles[d.key])
      .map((d) => ({ department: d.key, role: roles[d.key] as Role }))

  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] })

  const save = async () => {
    setError(null)
    // Leaving the Taproom (or deactivating) clears the code on the server, so a
    // typed code isn't sent.
    const keepsCode = active && !!roles.bar
    if (showStaffCode && keepsCode && codeDraft !== '' && !/^\d{4}$/.test(codeDraft)) {
      setError('A staff code is 4 digits.')
      return
    }
    setLoading(true)
    try {
      if (isEdit && editUser) {
        const body: Record<string, unknown> = { name, active, schedulable }
        if (isOwnerActor) body.is_owner = isOwner
        // D35: each call resets the calendar links the person loses. Deactivating
        // goes first (the membership change then resets nothing more). For an
        // owner, memberships otherwise go first, so removing the owner flag only
        // resets what the person doesn't keep through their new roles. Either
        // way, once. A manager can't send the owner flag, so their user change
        // goes first: removing someone from the manager's department ends the
        // manager's right to edit them (D37 G1).
        const saveUser = () => api.patch(`/api/users/${editUser.id}`, body)
        const saveMemberships = () => api.put(`/api/users/${editUser.id}/memberships`, { memberships: memberships() })
        if (!isOwnerActor || (editUser.active && !active)) {
          await saveUser()
          await saveMemberships()
        } else {
          await saveMemberships()
          await saveUser()
        }
        if (showStaffCode && keepsCode && codeDraft !== '') {
          try {
            await api.put(`/api/users/${editUser.id}/staff_code`, { code: codeDraft })
          } catch (err) {
            // The rest is saved; keep the dialog open on the code's problem.
            invalidate()
            setError(staffCodeError(err))
            return
          }
        }
        invalidate()
        onClose()
      } else {
        const { data } = await api.post<{ temp_password: string }>('/api/users', {
          email,
          name,
          memberships: memberships(),
        })
        invalidate()
        setTempPassword(data.temp_password)
      }
    } catch (err) {
      setError(readError(err))
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async () => {
    if (!editUser) return
    setError(null)
    setLoading(true)
    try {
      const { data } = await api.post<{ temp_password: string }>(`/api/users/${editUser.id}/reset_password`, {})
      setTempPassword(data.temp_password)
    } catch (err) {
      setError(readError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? `Edit ${editUser?.email}` : 'Add User'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        {error && <Alert severity="error">{error}</Alert>}

        {tempPassword ? (
          <Alert severity="success">
            Temporary password for <strong>{email}</strong>:{' '}
            <Box component="code" sx={{ fontWeight: 700 }}>{tempPassword}</Box>
            <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
              Share this with the user — they will be asked to set their own password at next sign-in.
            </Typography>
          </Alert>
        ) : (
          <>
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              disabled={isEdit}
            />
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />

            {isEdit && (
              <FormControlLabel
                control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />}
                label="Active"
              />
            )}
            {isEdit && (
              <FormControlLabel
                control={<Switch checked={schedulable} onChange={(e) => setSchedulable(e.target.checked)} />}
                label="Show on schedule"
              />
            )}
            {isOwnerActor && (
              <FormControlLabel
                control={<Switch checked={isOwner} onChange={(e) => setIsOwner(e.target.checked)} />}
                label="Owner (full access to all departments)"
              />
            )}

            <Divider textAlign="left">
              <Typography variant="overline">Department roles</Typography>
            </Divider>

            {manageableDepts.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                You have no departments to assign.
              </Typography>
            )}
            <Stack spacing={2}>
              {manageableDepts.map((d) => (
                <TextField
                  key={d.key}
                  select
                  label={d.name}
                  value={roles[d.key] ?? ''}
                  onChange={(e) => setRoles((r) => ({ ...r, [d.key]: e.target.value as RoleChoice }))}
                  fullWidth
                >
                  <MenuItem value="">— None —</MenuItem>
                  <MenuItem value="manager">Manager</MenuItem>
                  <MenuItem value="employee">Employee</MenuItem>
                </TextField>
              ))}
            </Stack>

            {showStaffCode && editUser && (
              <StaffCodeSection
                user={editUser}
                draft={codeDraft}
                onDraftChange={setCodeDraft}
                onRemoved={invalidate}
                disabled={loading}
              />
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <Box>
          {isEdit && !tempPassword && (
            <Button onClick={resetPassword} disabled={loading} color="warning">
              Reset password
            </Button>
          )}
        </Box>
        <Box>
          <Button onClick={onClose} disabled={loading}>
            {tempPassword ? 'Done' : 'Cancel'}
          </Button>
          {!tempPassword && (
            <Button onClick={save} variant="contained" disabled={loading} sx={{ ml: 1 }}>
              {loading ? <CircularProgress size={20} /> : 'Save'}
            </Button>
          )}
        </Box>
      </DialogActions>
    </Dialog>
  )
}
