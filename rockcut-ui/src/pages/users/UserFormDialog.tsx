import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
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
  Tooltip,
  Typography,
} from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import parseApiError from '../../lib/parseApiError'
import useAuth from '../../hooks/useAuth'
import type { Department, User } from '../../lib/types'
import {
  DEACTIVATE_HINT,
  editableDepartments,
  membershipLabel,
  membershipsPayload,
  readOnlyOwnersOnly,
  sortMemberships,
  userAccess,
  type RoleChoice,
} from '../../lib/userRoles'
import StaffCodeSection from './StaffCodeSection'
import { staffCodeAction, staffCodeError } from '../../lib/staffCode'

interface Props {
  open: boolean
  onClose: () => void
  editUser: User | null
  departments: Department[]
}

function readError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } } }
  return e?.response?.data?.error || parseApiError(err)
}

export default function UserFormDialog({ open, onClose, editUser, departments }: Props) {
  const qc = useQueryClient()
  const { user: actor, capabilities, staffCodes } = useAuth()
  const isOwnerActor = !!actor?.is_owner
  const isEdit = !!editUser
  // D58 §3.3: someone outside the actor's departments is read-only, except
  // Active (when they manage every department the person is in) and Add
  // department.
  const access = userAccess(editUser)
  const readOnly = isEdit && !access.canEdit

  // Only assignable departments bear roles ("Other" is scheduling-only). D59:
  // only an owner changes Owners, and only as employee.
  const managedKeys = isOwnerActor
    ? departments.filter((d) => d.assignable !== false).map((d) => d.key)
    : capabilities?.manages_departments ?? []
  const manageableDepts = editableDepartments(departments, isOwnerActor, managedKeys)
  const lockedDepts = readOnlyOwnersOnly(editUser?.memberships, manageableDepts)

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
  const [codeRemoving, setCodeRemoving] = useState(false)
  const [addDept, setAddDept] = useState('')

  // D37, every department since D40: owners and the managers of one of the
  // person's departments see their staff code. Only active people with a
  // department (as saved) can hold one; owners count, as in the API.
  const savedKeys = (editUser?.memberships ?? []).flatMap((m) => (m.department_key ? [m.department_key] : []))
  const showStaffCode =
    isEdit &&
    staffCodes &&
    !!editUser?.active &&
    (savedKeys.length > 0 || !!editUser?.is_owner) &&
    (isOwnerActor || savedKeys.some((k) => managedKeys.includes(k)))

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
    setCodeRemoving(false)
    setAddDept('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editUser])

  const memberships = () => membershipsPayload(manageableDepts, roles)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] })

  const save = async () => {
    setError(null)
    // Deactivating, or leaving every department, clears the code on the
    // server, so a typed code isn't sent. Departments this manager doesn't
    // manage aren't in `roles` and stay as they are.
    const keepsCode =
      active &&
      (Object.values(roles).some(Boolean) ||
        savedKeys.some((k) => !managedKeys.includes(k)) ||
        (isOwnerActor ? isOwner : !!editUser?.is_owner))
    if (showStaffCode && keepsCode && codeDraft !== '' && !/^\d{4}$/.test(codeDraft)) {
      setError('A staff code is 4 digits.')
      return
    }
    setLoading(true)
    try {
      if (readOnly && editUser) {
        // Only what this row allows: Active, then the added department (an
        // employee; the API keeps every other department as it is).
        if (active !== editUser.active) await api.patch(`/api/users/${editUser.id}`, { active })
        if (addDept) {
          await api.put(`/api/users/${editUser.id}/memberships`, { memberships: [{ department: addDept, role: 'employee' }] })
        }
        invalidate()
        onClose()
      } else if (isEdit && editUser) {
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
        const codeAction = showStaffCode ? staffCodeAction(keepsCode, codeDraft, codeRemoving) : null
        if (codeAction) {
          try {
            if (codeAction === 'put') await api.put(`/api/users/${editUser.id}/staff_code`, { code: codeDraft })
            else await api.delete(`/api/users/${editUser.id}/staff_code`)
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
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth disabled={readOnly} />

            {readOnly && (
              <Alert severity="info" data-testid="user-read-only">
                {editUser?.name || editUser?.email} isn't in a department you manage, so you can view them here but not
                change them.{access.addable.length > 0 ? ' You can add them to one of your departments.' : ''}
              </Alert>
            )}

            {isEdit && (
              <Tooltip title={access.canDeactivate ? '' : DEACTIVATE_HINT}>
                <FormControlLabel
                  control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />}
                  label="Active"
                  disabled={!access.canDeactivate}
                  data-testid="user-active"
                  sx={{ alignSelf: 'flex-start' }}
                />
              </Tooltip>
            )}
            {isEdit && (
              <FormControlLabel
                control={<Switch checked={schedulable} onChange={(e) => setSchedulable(e.target.checked)} />}
                label="Show on schedule"
                disabled={readOnly}
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

            {readOnly && editUser && (
              <Box data-testid="user-departments">
                {(editUser.memberships ?? []).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No departments.
                  </Typography>
                ) : (
                  sortMemberships(editUser.memberships ?? [], departments).map((m) => (
                    <Chip key={m.department_id} label={membershipLabel(m)} size="small" variant="outlined" sx={{ mr: 1, mb: 0.5 }} />
                  ))
                )}
              </Box>
            )}
            {readOnly && access.addable.length > 0 && (
              <TextField
                select
                label="Add department"
                value={addDept}
                onChange={(e) => setAddDept(e.target.value)}
                fullWidth
                helperText="Adds them as an employee."
                data-testid="user-add-department"
              >
                <MenuItem value="">— None —</MenuItem>
                {access.addable.map((d) => (
                  <MenuItem key={d.key} value={d.key}>
                    {d.name}
                  </MenuItem>
                ))}
              </TextField>
            )}

            {!readOnly && manageableDepts.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                You have no departments to assign.
              </Typography>
            )}
            {!readOnly && (
              <Stack spacing={2}>
                {manageableDepts.map((d) => (
                  <TextField
                    key={d.key}
                    select
                    label={d.name}
                    value={roles[d.key] ?? ''}
                    onChange={(e) => setRoles((r) => ({ ...r, [d.key]: e.target.value as RoleChoice }))}
                    fullWidth
                    helperText={d.owners_only ? `${d.name} has no managers.` : undefined}
                  >
                    <MenuItem value="">— None —</MenuItem>
                    {!d.owners_only && <MenuItem value="manager">Manager</MenuItem>}
                    <MenuItem value="employee">{d.owners_only ? 'Member' : 'Employee'}</MenuItem>
                  </TextField>
                ))}
              </Stack>
            )}
            {!readOnly && lockedDepts.length > 0 && (
              <Box>
                {lockedDepts.map((d) => (
                  <Chip key={d.key} label={`${d.name} member`} size="small" variant="outlined" sx={{ mr: 1 }} />
                ))}
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  Only owners change {lockedDepts.map((d) => d.name).join(', ')} membership.
                </Typography>
              </Box>
            )}

            {showStaffCode && editUser && (
              <StaffCodeSection
                user={editUser}
                draft={codeDraft}
                onDraftChange={setCodeDraft}
                removing={codeRemoving}
                onRemovingChange={setCodeRemoving}
                disabled={loading}
              />
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <Box>
          {isEdit && !readOnly && !tempPassword && (
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
