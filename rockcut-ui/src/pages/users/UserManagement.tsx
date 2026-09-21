import { useState } from 'react'
import { Box, Chip, Paper } from '@mui/material'
import type { GridColDef } from '@mui/x-data-grid'
import { DataGridExtended } from 'datagrid-extended'
import PageHeader from '../../components/PageHeader'
import { useApiQuery } from '../../hooks/useApiQuery'
import UserFormDialog from './UserFormDialog'
import type { Department, User } from '../../lib/types'

function rolesSummary(user: User): string {
  if (user.is_owner) return 'Owner — all departments'
  const ms = user.memberships ?? []
  if (ms.length === 0) return '—'
  return ms.map((m) => `${m.department_name}: ${m.role}`).join(', ')
}

const columns: GridColDef<User>[] = [
  { field: 'email', headerName: 'Email', flex: 1, minWidth: 200 },
  { field: 'name', headerName: 'Name', flex: 1, minWidth: 140 },
  {
    field: 'roles',
    headerName: 'Roles',
    flex: 2,
    minWidth: 220,
    sortable: false,
    valueGetter: (_value, row) => rolesSummary(row),
  },
  {
    field: 'active',
    headerName: 'Status',
    width: 110,
    renderCell: (params) =>
      params.row.active ? (
        <Chip label="Active" size="small" color="success" variant="outlined" />
      ) : (
        <Chip label="Disabled" size="small" color="default" variant="outlined" />
      ),
  },
]

export default function UserManagement() {
  const { data: users = [], isLoading } = useApiQuery<User[]>(['users'], '/api/users')
  const { data: departments = [] } = useApiQuery<Department[]>(['departments'], '/api/departments')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)

  const openCreate = () => {
    setEditUser(null)
    setDialogOpen(true)
  }

  const openEdit = (user: User) => {
    setEditUser(user)
    setDialogOpen(true)
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Users & Roles' }]}
        title="Users & Roles"
        action={{ label: 'Add User', onClick: openCreate }}
      />

      <Paper sx={{ border: '1px solid', borderColor: 'divider' }}>
        <DataGridExtended
          rows={users}
          columns={columns}
          columnVisibilityToggle={{ storageKey: 'rockcut:users:list' }}
          loading={isLoading}
          autoHeight
          disableRowSelectionOnClick
          sx={{ cursor: 'pointer' }}
          onRowClick={(params) => openEdit(params.row as User)}
        />
      </Paper>

      <Box>
        <UserFormDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          editUser={editUser}
          departments={departments}
        />
      </Box>
    </>
  )
}
