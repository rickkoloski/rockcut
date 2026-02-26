import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, InputAdornment, Paper, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import type { GridColDef } from '@mui/x-data-grid';
import { DataGridExtended } from 'datagrid-extended';
import type { Brewhouse } from '../../lib/types';
import { useApiQuery } from '../../hooks/useApiQuery';
import PageHeader from '../../components/PageHeader';
import BrewhouseFormDialog from './BrewhouseFormDialog';

const columns: GridColDef<Brewhouse>[] = [
  { field: 'name', headerName: 'Name', flex: 1 },
  { field: 'liquid_vol_unit', headerName: 'Volume Unit', width: 120 },
  { field: 'temp_unit', headerName: 'Temp Unit', width: 100 },
  { field: 'density_unit', headerName: 'Density', width: 100 },
  { field: 'ibu_calc_method', headerName: 'IBU Method', width: 120 },
  {
    field: 'is_default',
    headerName: 'Default',
    width: 100,
    renderCell: (params) => (params.value ? 'Yes' : ''),
  },
];

export default function BrewhousesList() {
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: brewhouses = [], isLoading } = useApiQuery<Brewhouse[]>(
    ['brewhouses'],
    '/api/brewhouses',
  );

  const filtered = useMemo(() => {
    if (!search) return brewhouses;
    const term = search.toLowerCase();
    return brewhouses.filter((b) =>
      [b.name, b.liquid_vol_unit, b.temp_unit]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [brewhouses, search]);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Home', to: '/' },
          { label: 'Settings', to: '/settings' },
          { label: 'Brewhouses' },
        ]}
        title="Brewhouses"
        action={{ label: 'Add Brewhouse', onClick: () => setFormOpen(true) }}
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
          rows={filtered}
          columns={columns}
          loading={isLoading}
          autoHeight
          disableRowSelectionOnClick
          sx={{ cursor: 'pointer' }}
          onRowClick={(params) => navigate(`/settings/brewhouses/${params.id}`)}
        />
      </Paper>

      <BrewhouseFormDialog open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}
