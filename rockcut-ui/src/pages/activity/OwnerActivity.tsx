import { useEffect } from 'react'
import { Paper } from '@mui/material'
import type { GridColDef } from '@mui/x-data-grid'
import { DataGridExtended } from 'datagrid-extended'
import PageHeader from '../../components/PageHeader'
import { useApiQuery } from '../../hooks/useApiQuery'
import useAuth from '../../hooks/useAuth'
import api from '../../lib/api'
import { actionLabel } from '../../lib/activity'
import type { AuditEntry } from '../../lib/types'


// Device accounts have a generated, undeliverable email; show their name (D33).
function who(u: AuditEntry['actor']): string {
  if (!u) return '—'
  return u.email.endsWith('@devices.rockcut.invalid') ? `${u.name ?? 'Shared device'} (shared device)` : u.email
}

// Device entries carry the device and tablet names in `detail`; a calendar
// link reset (D35) carries the feed names and why.
function detailText(row: AuditEntry): string {
  const d = (row.detail ?? {}) as Record<string, unknown>
  if (row.action === 'calendar_feeds.rotated') {
    const labels = Array.isArray(d.labels) ? d.labels.join(', ') : ''
    const why = d.reason === 'departed' ? 'left' : d.reason === 'manual' ? 'reset by hand' : 'lost access'
    return [labels, why].filter(Boolean).join(' · ')
  }
  if (!row.action.startsWith('device.')) return ''
  return [d.name, d.tablet].filter(Boolean).join(' · ')
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
    valueGetter: (value) => actionLabel(value as string),
  },
  {
    field: 'actor',
    headerName: 'By',
    flex: 1,
    minWidth: 180,
    sortable: false,
    valueGetter: (_value, row) => who(row.actor),
  },
  {
    field: 'target',
    headerName: 'Affected user',
    flex: 1,
    minWidth: 180,
    sortable: false,
    valueGetter: (_value, row) => who(row.target),
  },
  {
    field: 'detail',
    headerName: 'Detail',
    flex: 1,
    minWidth: 160,
    sortable: false,
    valueGetter: (_value, row) => detailText(row),
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
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'User change log' }]}
        title="User change log"
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
