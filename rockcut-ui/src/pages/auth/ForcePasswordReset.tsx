import { Box, Typography, Paper, Link } from '@mui/material'
import useAuth from '../../hooks/useAuth'
import ChangePasswordForm from '../../components/ChangePasswordForm'

export default function ForcePasswordReset() {
  const { loadMe, logout, user } = useAuth()

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        px: 2,
      }}
    >
      <Paper elevation={2} sx={{ p: 4, width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="h6">Set a new password</Typography>
        <Typography variant="body2" color="text.secondary">
          Your account was given a temporary password. Choose a new one to continue
          {user?.email ? ` as ${user.email}` : ''}.
        </Typography>

        <ChangePasswordForm mode="forced" onDone={() => loadMe()} />

        <Link component="button" type="button" onClick={logout} sx={{ alignSelf: 'center' }}>
          Sign out
        </Link>
      </Paper>
    </Box>
  )
}
