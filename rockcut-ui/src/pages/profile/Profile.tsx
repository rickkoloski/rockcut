import { useState } from 'react'
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import ChangePasswordForm from '../../components/ChangePasswordForm'
import useAuth from '../../hooks/useAuth'
import api from '../../lib/api'
import type { Role } from '../../lib/types'

const ROLE_LABEL: Record<Role, string> = { manager: 'Manager', employee: 'Employee' }

function sessionsLabel(n: number): string {
  return n === 1 ? '1 other session' : `${n} other sessions`
}

/**
 * Your own account (D34 §3.5): details (read-only), Change password, and
 * Sign out of all other devices. Not routed for a shared device or a personal
 * sign-in on a tablet.
 */
export default function Profile() {
  const { user } = useAuth()
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutNotice, setSignOutNotice] = useState<string | null>(null)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  if (!user) return null
  const memberships = user.memberships ?? []

  const signOutOthers = async () => {
    setSigningOut(true)
    setSignOutError(null)
    try {
      const { data } = await api.delete<{ revoked: number }>('/api/sessions/others')
      setSignOutNotice(`Signed out of ${sessionsLabel(data.revoked)}.`)
      setConfirmSignOut(false)
    } catch {
      setSignOutError('Could not sign out your other devices. Try again.')
      setConfirmSignOut(false)
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <Box data-testid="profile-page">
      <PageHeader breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Profile' }]} title="Profile" />

      <Stack spacing={3} sx={{ maxWidth: 560 }}>
        <Paper variant="outlined" sx={{ p: 3 }} data-testid="profile-details">
          <Typography variant="h6" gutterBottom>
            Your details
          </Typography>
          <Typography data-testid="profile-name">{user.name || '—'}</Typography>
          <Typography color="text.secondary" data-testid="profile-email">
            {user.email}
          </Typography>
          <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }} data-testid="profile-memberships">
            {user.is_owner && <Chip size="small" color="primary" label="Owner" />}
            {memberships.map((m) => (
              <Chip
                key={m.department_id}
                size="small"
                variant="outlined"
                label={`${m.department_name ?? m.department_key ?? 'Department'} · ${ROLE_LABEL[m.role] ?? m.role}`}
              />
            ))}
            {memberships.length === 0 && !user.is_owner && (
              <Typography variant="body2" color="text.secondary">
                No departments yet.
              </Typography>
            )}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }} data-testid="profile-details-hint">
            {user.is_owner
              ? 'Change these in Users & Roles.'
              : 'To change your name, email or departments, ask a manager or the owner.'}
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }} data-testid="profile-password">
          <Typography variant="h6" gutterBottom>
            Change password
          </Typography>
          {passwordNotice && (
            <Alert severity="success" sx={{ mb: 2 }} data-testid="change-password-success" onClose={() => setPasswordNotice(null)}>
              {passwordNotice}
            </Alert>
          )}
          <ChangePasswordForm
            mode="profile"
            onDone={(revoked) =>
              setPasswordNotice(
                revoked > 0 ? 'Password changed. Your other devices were signed out.' : 'Password changed.'
              )
            }
          />
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }} data-testid="profile-sessions">
          <Typography variant="h6" gutterBottom>
            Signed-in devices
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Lost a phone, or signed in somewhere you shouldn't stay signed in? This signs you out everywhere
            except this browser.
          </Typography>
          {signOutNotice && (
            <Alert severity="success" sx={{ mb: 2 }} data-testid="sign-out-others-success" onClose={() => setSignOutNotice(null)}>
              {signOutNotice}
            </Alert>
          )}
          {signOutError && (
            <Alert severity="error" sx={{ mb: 2 }} data-testid="sign-out-others-error">
              {signOutError}
            </Alert>
          )}
          <Button
            data-testid="sign-out-others"
            variant="outlined"
            color="warning"
            onClick={() => {
              setSignOutNotice(null)
              setConfirmSignOut(true)
            }}
          >
            Sign out of all other devices
          </Button>
        </Paper>
      </Stack>

      <ConfirmDialog
        open={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        onConfirm={signOutOthers}
        title="Sign out of all other devices?"
        message="This signs you out everywhere except this browser. You'll need your password to sign in on them again."
        loading={signingOut}
        confirmLabel="Sign out others"
        confirmColor="primary"
      />
    </Box>
  )
}
