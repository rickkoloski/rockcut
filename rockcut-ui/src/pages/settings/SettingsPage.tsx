import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, InputAdornment, Paper, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import type { GridColDef } from '@mui/x-data-grid';
import { DataGridExtended } from 'datagrid-extended';
import type { IngredientCategory } from '../../lib/types';
import { useApiQuery } from '../../hooks/useApiQuery';
import PageHeader from '../../components/PageHeader';
import CategoryFormDialog from './CategoryFormDialog';
import { libraryHref } from '../../lib/libraryView'

// D60 §3.1: children listed under their parent, indented; the order is the hierarchy's.
const columns: GridColDef[] = [
  {
    field: 'name',
    headerName: 'Name',
    flex: 1,
    sortable: false,
    renderCell: (params) => (
      <Box component="span" sx={{ pl: params.row.parent_id != null ? 3 : 0 }}>
        {params.row.parent_id != null ? `└ ${params.value}` : params.value}
      </Box>
    ),
  },
  { field: 'sort_order', headerName: 'Sort Order', width: 120, sortable: false },
];

const byOrder = (a: IngredientCategory, b: IngredientCategory) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);

export default function SettingsPage() {
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: categories = [] } = useApiQuery<IngredientCategory[]>(
    ['ingredient_categories'],
    '/api/ingredient_categories',
  );

  const filteredCategories = useMemo(() => {
    const ordered = categories
      .filter((c) => c.parent_id == null)
      .sort(byOrder)
      .flatMap((p) => [p, ...categories.filter((c) => c.parent_id === p.id).sort(byOrder)]);
    if (!search) return ordered;
    const term = search.toLowerCase();
    return ordered.filter((c) =>
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
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Ingredient Library', to: libraryHref() }, { label: 'Categories' }]}
        title="Ingredient categories"
        action={{ label: 'Add Category', onClick: () => setFormOpen(true), testId: 'settings-add-button' }}
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
          rows={filteredCategories}
          columns={columns}
          autoHeight
          disableRowSelectionOnClick
          sx={{ cursor: 'pointer' }}
          onRowClick={(params) => navigate(`/ingredients/categories/${params.id}`)}
        />
      </Paper>

      <CategoryFormDialog open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}
