import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  Grid,
  Paper,
  Typography,
} from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import { DataGridExtended } from 'datagrid-extended';
import PageHeader from '../../components/PageHeader';
import StatusChip from '../../components/StatusChip';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useApiDelete } from '../../hooks/useApiMutation';
import BrandFormDialog from './BrandFormDialog';
import RecipeFormDialog from '../recipes/RecipeFormDialog';
import type { Brand, Recipe } from '../../lib/types';

const recipeColumns: GridColDef<Recipe>[] = [
  { field: 'version', headerName: 'Version', width: 100, valueGetter: (_value, row) => `${row.version_major}.${row.version_minor}` },
  { field: 'batch_size', headerName: 'Batch Size', flex: 1 },
  { field: 'boil_time', headerName: 'Boil Time', flex: 1 },
  { field: 'efficiency_target', headerName: 'Efficiency', flex: 1 },
  {
    field: 'status',
    headerName: 'Status',
    width: 120,
    renderCell: (params) => <StatusChip status={params.value} domain="recipe" />,
  },
];

export default function BrandDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const brandId = Number(id);

  const { data: brand, isLoading: brandLoading } = useApiQuery<Brand>(
    ['brand', brandId],
    `/api/brands/${id}`,
  );

  const { data: recipes = [], isLoading: recipesLoading } = useApiQuery<Recipe[]>(
    ['recipes', { brand_id: id }],
    '/api/recipes',
    { brand_id: id! },
  );

  const deleteMutation = useApiDelete(
    (delId) => `/api/brands/${delId}`,
    { invalidateKeys: [['brands']] },
  );

  const [editOpen, setEditOpen] = useState(false);
  const [recipeDialogOpen, setRecipeDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (brandLoading || !brand) {
    return <CircularProgress />;
  }

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(brandId);
    navigate('/brands');
  };

  const fields: { label: string; value: unknown }[] = [
    { label: 'Name', value: brand.name },
    { label: 'Style', value: brand.style },
    { label: 'Description', value: brand.description },
    { label: 'Target ABV', value: brand.target_abv },
    { label: 'Target IBU', value: brand.target_ibu },
    { label: 'Target SRM', value: brand.target_srm },
    { label: 'Status', value: brand.status },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Home', to: '/' },
          { label: 'Brands', to: '/brands' },
          { label: brand.name },
        ]}
        title={brand.name}
        action={{ label: 'Edit Brand', onClick: () => setEditOpen(true) }}
      />

      <Paper sx={{ p: 3, mb: 3, border: '1px solid', borderColor: 'divider' }}>
        <Grid container spacing={2}>
          {fields.map((f) => (
            <Grid size={{ xs: 12, sm: 6 }} key={f.label}>
              <Typography variant="caption" color="text.secondary">
                {f.label}
              </Typography>
              {f.label === 'Status' ? (
                <StatusChip status={String(f.value ?? '')} domain="brand" />
              ) : (
                <Typography variant="body1">{String(f.value ?? '—')}</Typography>
              )}
            </Grid>
          ))}
        </Grid>

        <Box sx={{ mt: 2 }}>
          <Button color="error" variant="outlined" onClick={() => setDeleteOpen(true)}>
            Delete Brand
          </Button>
        </Box>
      </Paper>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6">Recipes</Typography>
        <Button variant="contained" onClick={() => setRecipeDialogOpen(true)}>
          Add Recipe
        </Button>
      </Box>

      <Paper sx={{ border: '1px solid', borderColor: 'divider' }}>
        <DataGridExtended
          rows={recipes}
          columns={recipeColumns}
          loading={recipesLoading}
          autoHeight
          disableRowSelectionOnClick
          sx={{ cursor: 'pointer' }}
          onRowClick={(params) => navigate(`/brands/${id}/recipes/${params.id}`)}
        />
      </Paper>

      <BrandFormDialog open={editOpen} onClose={() => setEditOpen(false)} brand={brand} />
      <RecipeFormDialog
        open={recipeDialogOpen}
        onClose={() => setRecipeDialogOpen(false)}
        brandId={brandId}
      />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Brand"
        message={`Are you sure you want to delete "${brand.name}"? This action cannot be undone.`}
        loading={deleteMutation.isPending}
      />
    </>
  );
}
