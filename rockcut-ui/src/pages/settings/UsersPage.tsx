import { useState, useMemo } from 'react';
import { Box, Chip, InputAdornment, Paper, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import type { GridColDef } from '@mui/x-data-grid';
import { DataGridExtended } from 'datagrid-extended';
import PageHeader from '../../components/PageHeader';
import { useApiQuery } from '../../hooks/useApiQuery';
import UserFormDialog from './UserFormDialog';
import type { User } from '../../lib/types';

const columns: GridColDef<User>[] = [
  { field: 'name', headerName: 'Name', flex: 1 },
  { field: 'email', headerName: 'Email', flex: 1 },
  {
    field: 'role',
    headerName: 'Role',
    width: 120,
    renderCell: (params) => (
      <Chip
        label={params.value === 'admin' ? 'Admin' : 'User'}
        color={params.value === 'admin' ? 'primary' : 'default'}
        size="small"
      />
    ),
  },
  {
    field: 'active',
    headerName: 'Active',
    width: 120,
    renderCell: (params) => (
      <Chip
        label={params.value ? 'Active' : 'Inactive'}
        color={params.value ? 'success' : 'default'}
        size="small"
      />
    ),
  },
  {
    field: 'inserted_at',
    headerName: 'Created',
    width: 160,
    valueFormatter: (value: string) => value ? new Date(value).toLocaleDateString() : '',
  },
];

export default function UsersPage() {
  const { data: users = [], isLoading } = useApiQuery<User[]>(['users'], '/api/users');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | undefined>(undefined);
  const [search, setSearch] = useState('');

  const filteredUsers = useMemo(() => {
    if (!search) return users;
    const term = search.toLowerCase();
    return users.filter((u) =>
      [u.name, u.email, u.role]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [users, search]);

  const handleAdd = () => {
    setEditUser(undefined);
    setDialogOpen(true);
  };

  const handleRowClick = (params: { row: User }) => {
    setEditUser(params.row);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditUser(undefined);
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Settings', to: '/settings' }, { label: 'Users' }]}
        title="Users"
        action={{ label: 'Add User', onClick: handleAdd }}
      />

      <Box sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          sx={{ minWidth: 260 }}
        />
      </Box>

      <Paper sx={{ border: '1px solid', borderColor: 'divider' }}>
        <DataGridExtended
          rows={filteredUsers}
          columns={columns}
          columnVisibilityToggle={{ storageKey: 'rockcut:users:list' }}
          loading={isLoading}
          autoHeight
          disableRowSelectionOnClick
          sx={{ cursor: 'pointer' }}
          onRowClick={handleRowClick}
        />
      </Paper>

      <UserFormDialog open={dialogOpen} onClose={handleClose} user={editUser} />
    </>
  );
}
