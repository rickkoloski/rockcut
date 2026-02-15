import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
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
  const [search, setSearch] = useState('');

  const { data: batches = [] } = useApiQuery<Batch[]>(
    ['batches', { status: statusFilter }],
    '/api/batches',
    statusFilter ? { status: statusFilter } : undefined,
  );

  const filteredBatches = useMemo(() => {
    if (!search) return batches;
    const term = search.toLowerCase();
    return batches.filter((b) =>
      [b.batch_number, b.brand?.name, b.status, b.actual_og, b.actual_fg, b.actual_abv, b.ferm_start_date]
        .filter(Boolean)
        .map(String)
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [batches, search]);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Batches' }]}
        title="Batches"
        action={{ label: 'Add Batch', onClick: () => setFormOpen(true) }}
      />

      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          sx={{ minWidth: 260 }}
        />
        <FormControl sx={{ minWidth: 240 }} size="small">
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
          rows={filteredBatches}
          columns={columns}
          columnVisibilityToggle={{ storageKey: 'rockcut:batches:list' }}
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
