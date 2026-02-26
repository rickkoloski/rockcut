import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, InputAdornment, Paper, TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import type { GridColDef } from '@mui/x-data-grid';
import { DataGridExtended } from 'datagrid-extended';
import type { IngredientCategory } from '../../lib/types';
import { useApiQuery } from '../../hooks/useApiQuery';
import PageHeader from '../../components/PageHeader';
import CategoryFormDialog from './CategoryFormDialog';

const columns: GridColDef[] = [
  { field: 'name', headerName: 'Name', flex: 1 },
  { field: 'sort_order', headerName: 'Sort Order', width: 120 },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: categories = [] } = useApiQuery<IngredientCategory[]>(
    ['ingredient_categories'],
    '/api/ingredient_categories',
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

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Settings' }]}
        title="Settings"
      />

      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Button variant="outlined" onClick={() => navigate('/settings/brewhouses')}>
          Brewhouses
        </Button>
        <Button variant="outlined" onClick={() => navigate('/settings/process-profiles')}>
          Process Profiles
        </Button>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6">Ingredient Categories</Typography>
        <Button variant="contained" size="small" onClick={() => setFormOpen(true)}>
          Add Category
        </Button>
      </Box>

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
          rows={filteredCategories}
          columns={columns}
          autoHeight
          disableRowSelectionOnClick
          sx={{ cursor: 'pointer' }}
          onRowClick={(params) => navigate(`/settings/categories/${params.id}`)}
        />
      </Paper>

      <CategoryFormDialog open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}
