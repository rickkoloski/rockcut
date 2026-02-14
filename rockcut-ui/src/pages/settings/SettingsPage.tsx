import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paper } from '@mui/material';
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

  const { data: categories = [] } = useApiQuery<IngredientCategory[]>(
    ['ingredient_categories'],
    '/api/ingredient_categories',
  );

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Settings' }]}
        title="Settings"
        action={{ label: 'Add Category', onClick: () => setFormOpen(true) }}
      />

      <Paper sx={{ border: '1px solid', borderColor: 'divider' }}>
        <DataGridExtended
          rows={categories}
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
