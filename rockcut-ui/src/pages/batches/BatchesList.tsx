import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
} from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import { DataGridExtended } from 'datagrid-extended';
import type { Batch } from '../../lib/types';
import { useApiQuery } from '../../hooks/useApiQuery';
import PageHeader from '../../components/PageHeader';
import StatusChip from '../../components/StatusChip';
import BatchFormDialog from './BatchFormDialog';

const STATUS_OPTIONS = ['planned', 'brewing', 'fermenting', 'conditioning', 'completed', 'dumped'];

const columns: GridColDef[] = [
  { field: 'batch_number', headerName: 'Batch #', flex: 1 },
  {
    field: 'brand_name',
    headerName: 'Brand',
    flex: 1,
    valueGetter: (_value: unknown, row: Batch) => row.brand?.name ?? '',
  },
  {
    field: 'status',
    headerName: 'Status',
    width: 130,
    renderCell: (params) => <StatusChip status={params.value} domain="batch" />,
  },
  { field: 'actual_og', headerName: 'OG', width: 90 },
  { field: 'actual_fg', headerName: 'FG', width: 90 },
  { field: 'actual_abv', headerName: 'ABV', width: 90 },
  { field: 'ferm_start_date', headerName: 'Ferm Start', width: 120 },
];

export default function BatchesList() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [formOpen, setFormOpen] = useState(false);

  const { data: batches = [] } = useApiQuery<Batch[]>(
    ['batches', { status: statusFilter }],
    '/api/batches',
    statusFilter ? { status: statusFilter } : undefined,
  );

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Batches' }]}
        title="Batches"
        action={{ label: 'Add Batch', onClick: () => setFormOpen(true) }}
      />

      <Box sx={{ mb: 2, maxWidth: 240 }}>
        <FormControl fullWidth size="small">
          <InputLabel>Status Filter</InputLabel>
          <Select
            value={statusFilter}
            label="Status Filter"
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            {STATUS_OPTIONS.map((s) => (
              <MenuItem key={s} value={s}>{s}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Paper sx={{ border: '1px solid', borderColor: 'divider' }}>
        <DataGridExtended
          rows={batches}
          columns={columns}
          autoHeight
          disableRowSelectionOnClick
          sx={{ cursor: 'pointer' }}
          onRowClick={(params) => navigate(`/batches/${params.id}`)}
        />
      </Paper>

      <BatchFormDialog open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}
