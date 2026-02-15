import { useState, useEffect } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FormDialog from '../../components/FormDialog';
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation';
import parseApiError from '../../lib/parseApiError';
import api from '../../lib/api';
import type { User } from '../../lib/types';

interface UserFormDialogProps {
  open: boolean;
  onClose: () => void;
  user?: User;
}

const ROLES = ['admin', 'user'];

export default function UserFormDialog({ open, onClose, user }: UserFormDialogProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset password state
  const [resetLoading, setResetLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createMutation = useApiCreate<User>('/api/users', {
    invalidateKeys: [['users']],
  });

  const updateMutation = useApiUpdate<User>(
    (id) => `/api/users/${id}`,
    { invalidateKeys: [['users']] },
  );

  useEffect(() => {
    if (open) {
      setName(user?.name ?? '');
      setEmail(user?.email ?? '');
      setPassword('');
      setRole(user?.role ?? 'user');
      setActive(user?.active ?? true);
      setError(null);
      setTempPassword(null);
      setCopied(false);
    }
  }, [open, user]);

  const handleSubmit = async () => {
    try {
      const payload: Record<string, unknown> = {
        name,
        email,
        role,
      };

      if (user) {
        payload.active = active;
        if (password) payload.password = password;
        await updateMutation.mutateAsync({ id: user.id, ...payload });
      } else {
        payload.password = password;
        await createMutation.mutateAsync(payload);
      }
      onClose();
    } catch (err) {
      setError(parseApiError(err));
    }
  };

  const handleResetPassword = async () => {
    if (!user) return;
    setResetLoading(true);
    setError(null);
    try {
      const { data } = await api.post(`/api/users/${user.id}/reset_password`);
      setTempPassword(data.data.temp_password);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setResetLoading(false);
    }
  };

  const handleCopy = async () => {
    if (tempPassword) {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
    }
  };

  const loading = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <FormDialog
        open={open}
        onClose={onClose}
        title={user ? 'Edit User' : 'Add User'}
        onSubmit={handleSubmit}
        loading={loading}
        error={error}
      >
        <TextField
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          fullWidth
          margin="normal"
        />
        <TextField
          label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          type="email"
          fullWidth
          margin="normal"
        />
        <TextField
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required={!user}
          fullWidth
          margin="normal"
          helperText={user ? 'Leave blank to keep current password' : undefined}
        />
        <TextField
          label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          select
          fullWidth
          margin="normal"
        >
          {ROLES.map((r) => (
            <MenuItem key={r} value={r}>
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </MenuItem>
          ))}
        </TextField>
        {user && (
          <FormControlLabel
            control={<Checkbox checked={active} onChange={(e) => setActive(e.target.checked)} />}
            label="Active"
          />
        )}
        {user && (
          <Button
            variant="outlined"
            color="warning"
            onClick={handleResetPassword}
            disabled={resetLoading}
            sx={{ mt: 1, alignSelf: 'flex-start' }}
          >
            {resetLoading ? 'Resetting...' : 'Reset Password'}
          </Button>
        )}
      </FormDialog>

      <Dialog open={!!tempPassword} onClose={() => setTempPassword(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Password Reset</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Temporary password for {user?.name}:
          </Typography>
          <Alert
            severity="info"
            action={
              <IconButton size="small" onClick={handleCopy}>
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            }
          >
            <Typography variant="body1" fontFamily="monospace" fontWeight="bold">
              {tempPassword}
            </Typography>
          </Alert>
          {copied && (
            <Typography variant="caption" color="success.main" sx={{ mt: 1, display: 'block' }}>
              Copied to clipboard
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Share this with the user. They will be required to change it on next login.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTempPassword(null)} variant="contained">
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
