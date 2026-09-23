import { useEffect } from 'react'
import { Paper } from '@mui/material'
import type { GridColDef } from '@mui/x-data-grid'
import { DataGridExtended } from 'datagrid-extended'
import PageHeader from '../../components/PageHeader'
import { useApiQuery } from '../../hooks/useApiQuery'
import useAuth from '../../hooks/useAuth'
import api from '../../lib/api'
import type { AuditEntry } from '../../lib/types'

const ACTION_LABELS: Record<string, string> = {
  'user.created': 'User created',
  'user.updated': 'User updated',
  'user.password_reset': 'Password reset',
  'membership.added': 'Role added',
  'membership.changed': 'Role changed',
  'membership.removed': 'Role removed',
}

const columns: GridColDef<AuditEntry>[] = [
  {
    field: 'inserted_at',
    headerName: 'When',
    width: 180,
    valueGetter: (value) => (value ? new Date(value as string).toLocaleString() : ''),
  },
  {
    field: 'action',
    headerName: 'Action',
    width: 160,
    valueGetter: (value) => ACTION_LABELS[value as string] ?? value,
  },
  {
    field: 'actor',
    headerName: 'By',
    flex: 1,
    minWidth: 180,
    sortable: false,
    valueGetter: (_value, row) => row.actor?.email ?? '—',
  },
  {
    field: 'target',
    headerName: 'Affected user',
    flex: 1,
    minWidth: 180,
    sortable: false,
    valueGetter: (_value, row) => row.target?.email ?? '—',
  },
]

export default function OwnerActivity() {
  const loadMe = useAuth((s) => s.loadMe)
  const { data: entries = [], isLoading } = useApiQuery<AuditEntry[]>(
    ['owner-activity'],
    '/api/owner/activity',
  )

  // Opening the log marks it seen, then refresh capabilities so the nav badge clears.
  useEffect(() => {
    api
      .post('/api/owner/activity/seen')
      .then(() => loadMe())
      .catch(() => {})
  }, [loadMe])

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Activity' }]}
        title="Activity"
      />

      <Paper sx={{ border: '1px solid', borderColor: 'divider' }}>
        <DataGridExtended
          rows={entries}
          columns={columns}
          columnVisibilityToggle={{ storageKey: 'rockcut:activity:list' }}
          loading={isLoading}
          autoHeight
          disableRowSelectionOnClick
        />
      </Paper>
    </>
  )
}
