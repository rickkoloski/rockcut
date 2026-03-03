import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, InputAdornment, Paper, Tab, Tabs, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import type { GridColDef } from '@mui/x-data-grid';
import { DataGridExtended } from 'datagrid-extended';
import type { Brewhouse, IngredientCategory, ProcessProfile } from '../../lib/types';
import { useApiQuery } from '../../hooks/useApiQuery';
import PageHeader from '../../components/PageHeader';
import CategoryFormDialog from './CategoryFormDialog';
import BrewhouseFormDialog from './BrewhouseFormDialog';
import ProcessProfileFormDialog from './ProcessProfileFormDialog';

const categoryColumns: GridColDef[] = [
  { field: 'name', headerName: 'Name', flex: 1 },
  { field: 'sort_order', headerName: 'Sort Order', width: 120 },
];

const brewhouseColumns: GridColDef<Brewhouse>[] = [
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

const profileColumns: GridColDef<ProcessProfile>[] = [
  { field: 'name', headerName: 'Name', flex: 1 },
  { field: 'mash_type', headerName: 'Mash Type', width: 140 },
  { field: 'boil_duration', headerName: 'Boil (min)', width: 110 },
  { field: 'primary_temperature', headerName: 'Primary Temp', width: 130 },
  { field: 'crash_type', headerName: 'Crash Type', width: 120 },
  { field: 'transfer_type', headerName: 'Transfer', width: 100 },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [catFormOpen, setCatFormOpen] = useState(false);
  const [bhFormOpen, setBhFormOpen] = useState(false);
  const [ppFormOpen, setPpFormOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: categories = [] } = useApiQuery<IngredientCategory[]>(
    ['ingredient_categories'],
    '/api/ingredient_categories',
  );

  const { data: brewhouses = [], isLoading: bhLoading } = useApiQuery<Brewhouse[]>(
    ['brewhouses'],
    '/api/brewhouses',
  );

  const { data: profiles = [], isLoading: ppLoading } = useApiQuery<ProcessProfile[]>(
    ['process_profiles'],
    '/api/process_profiles',
  );

  const filteredCategories = useMemo(() => {
    if (!search) return categories;
    const term = search.toLowerCase();
    return categories.filter((c) =>
      [c.name, c.sort_order]
        .filter(Boolean)
        .map(String)
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [categories, search]);

  const filteredBrewhouses = useMemo(() => {
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

  const filteredProfiles = useMemo(() => {
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

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTab(newValue);
    setSearch('');
  };

  const addLabel = tab === 0 ? 'Add Category' : tab === 1 ? 'Add Brewhouse' : 'Add Profile';
  const onAdd = tab === 0 ? () => setCatFormOpen(true) : tab === 1 ? () => setBhFormOpen(true) : () => setPpFormOpen(true);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Settings' }]}
        title="Settings"
      />

      <Tabs value={tab} onChange={handleTabChange} sx={{ mb: 2 }}>
        <Tab label="Ingredient Categories" />
        <Tab label="Brewhouses" />
        <Tab label="Process Profiles" />
      </Tabs>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <TextField
          size="small"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          sx={{ minWidth: 260 }}
        />
        <Button variant="contained" size="small" onClick={onAdd}>
          {addLabel}
        </Button>
      </Box>

      {tab === 0 && (
        <Paper sx={{ border: '1px solid', borderColor: 'divider' }}>
          <DataGridExtended
            rows={filteredCategories}
            columns={categoryColumns}
            autoHeight
            disableRowSelectionOnClick
            sx={{ cursor: 'pointer' }}
            onRowClick={(params) => navigate(`/settings/categories/${params.id}`)}
          />
        </Paper>
      )}

      {tab === 1 && (
        <Paper sx={{ border: '1px solid', borderColor: 'divider' }}>
          <DataGridExtended
            rows={filteredBrewhouses}
            columns={brewhouseColumns}
            loading={bhLoading}
            autoHeight
            disableRowSelectionOnClick
            sx={{ cursor: 'pointer' }}
            onRowClick={(params) => navigate(`/settings/brewhouses/${params.id}`)}
          />
        </Paper>
      )}

      {tab === 2 && (
        <Paper sx={{ border: '1px solid', borderColor: 'divider' }}>
          <DataGridExtended
            rows={filteredProfiles}
            columns={profileColumns}
            loading={ppLoading}
            autoHeight
            disableRowSelectionOnClick
            sx={{ cursor: 'pointer' }}
            onRowClick={(params) => navigate(`/settings/process-profiles/${params.id}`)}
          />
        </Paper>
      )}

      <CategoryFormDialog open={catFormOpen} onClose={() => setCatFormOpen(false)} />
      <BrewhouseFormDialog open={bhFormOpen} onClose={() => setBhFormOpen(false)} />
      <ProcessProfileFormDialog open={ppFormOpen} onClose={() => setPpFormOpen(false)} />
    </>
  );
}
