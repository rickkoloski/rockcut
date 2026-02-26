import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, InputAdornment, Paper, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import type { GridColDef } from '@mui/x-data-grid';
import { DataGridExtended } from 'datagrid-extended';
import type { ProcessProfile } from '../../lib/types';
import { useApiQuery } from '../../hooks/useApiQuery';
import PageHeader from '../../components/PageHeader';
import ProcessProfileFormDialog from './ProcessProfileFormDialog';

const columns: GridColDef<ProcessProfile>[] = [
  { field: 'name', headerName: 'Name', flex: 1 },
  { field: 'mash_type', headerName: 'Mash Type', width: 140 },
  { field: 'boil_duration', headerName: 'Boil (min)', width: 110 },
  { field: 'primary_temperature', headerName: 'Primary Temp', width: 130 },
  { field: 'crash_type', headerName: 'Crash Type', width: 120 },
  { field: 'transfer_type', headerName: 'Transfer', width: 100 },
];

export default function ProcessProfilesList() {
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: profiles = [], isLoading } = useApiQuery<ProcessProfile[]>(
    ['process_profiles'],
    '/api/process_profiles',
  );

  const filtered = useMemo(() => {
    if (!search) return profiles;
    const term = search.toLowerCase();
    return profiles.filter((p) =>
      [p.name, p.mash_type, p.crash_type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [profiles, search]);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Home', to: '/' },
          { label: 'Settings', to: '/settings' },
          { label: 'Process Profiles' },
        ]}
        title="Process Profiles"
        action={{ label: 'Add Profile', onClick: () => setFormOpen(true) }}
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
          onRowClick={(params) => navigate(`/settings/process-profiles/${params.id}`)}
        />
      </Paper>

      <ProcessProfileFormDialog open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}
