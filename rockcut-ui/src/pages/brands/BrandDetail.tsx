import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  Grid,
  IconButton,
  Paper,
  Tooltip,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import StarIcon from '@mui/icons-material/Star';
import { DataGridExtended } from 'datagrid-extended';
import type { ExtendedGridColDef } from 'datagrid-extended';
import PageHeader from '../../components/PageHeader';
import StatusChip from '../../components/StatusChip';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useApiDelete } from '../../hooks/useApiMutation';
import { useFormulaFunctions } from '../../hooks/useFormulaFunctions';
import BrandFormDialog from './BrandFormDialog';
import DuplicateBrandDialog from './DuplicateBrandDialog';
import RecipeFormDialog from '../recipes/RecipeFormDialog';
import type { Brand, Recipe } from '../../lib/types';

const recipeColumns: ExtendedGridColDef[] = [
  {
    field: 'version',
    headerName: 'Version',
    width: 120,
    valueGetter: (_value: unknown, row: Recipe) => `${row.version_major}.${row.version_minor}`,
    renderCell: (params) => (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {params.value}
        {(params.row as Recipe).is_default && (
          <Tooltip title="Default Recipe"><StarIcon sx={{ fontSize: 16, color: 'warning.main' }} /></Tooltip>
        )}
      </Box>
    ),
  },
  { field: 'batch_size', headerName: 'Batch Size', flex: 1 },
  { field: 'boil_time', headerName: 'Boil Time', flex: 1 },
  { field: 'efficiency_target', headerName: 'Efficiency', flex: 1 },
  { field: 'est_ibu', headerName: 'Est. IBU', width: 110, formula: '=EST_IBU(id)' },
  { field: 'est_og', headerName: 'Est. OG', width: 110, formula: '=EST_OG(id)' },
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

  const { remoteFunctions } = useFormulaFunctions();

  const [editOpen, setEditOpen] = useState(false);
  const [recipeDialogOpen, setRecipeDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);

  if (brandLoading || !brand) {
    return <CircularProgress />;
  }

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(brandId);
    navigate('/brands');
  };

  const fields: { label: string; value: unknown; link?: string }[] = [
    { label: 'Name', value: brand.name },
    { label: 'Style', value: brand.style },
    { label: 'Description', value: brand.description },
    { label: 'Target ABV', value: brand.target_abv },
    { label: 'Target IBU', value: brand.target_ibu },
    { label: 'Target SRM', value: brand.target_srm },
    { label: 'Status', value: brand.status },
    { label: 'Brewhouse', value: brand.brewhouse?.name, link: brand.brewhouse_id ? `/settings/brewhouses/${brand.brewhouse_id}` : undefined },
    { label: 'Process Profile', value: brand.process_profile?.name, link: brand.process_profile_id ? `/settings/process-profiles/${brand.process_profile_id}` : undefined },
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
        toolbar={
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="Duplicate Brand"><IconButton onClick={() => setDuplicateOpen(true)}><ContentCopyIcon /></IconButton></Tooltip>
            <Tooltip title="Edit Brand"><IconButton onClick={() => setEditOpen(true)}><EditIcon /></IconButton></Tooltip>
            <Tooltip title="Delete Brand"><IconButton onClick={() => setDeleteOpen(true)} color="error"><DeleteIcon /></IconButton></Tooltip>
          </Box>
        }
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
              ) : f.link ? (
                <Typography
                  variant="body1"
                  sx={{ cursor: 'pointer', color: 'primary.main', '&:hover': { textDecoration: 'underline' } }}
                  onClick={() => navigate(f.link!)}
                >
                  {String(f.value ?? '—')}
                </Typography>
              ) : (
                <Typography variant="body1">{String(f.value ?? '—')}</Typography>
              )}
            </Grid>
          ))}
        </Grid>

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
          columnVisibilityToggle={{ storageKey: 'rockcut:brand:recipes' }}
          remoteFunctions={remoteFunctions}
          loading={recipesLoading}
          autoHeight
          disableRowSelectionOnClick
          sx={{ cursor: 'pointer' }}
          onRowClick={(params) => navigate(`/brands/${id}/recipes/${params.id}`)}
        />
      </Paper>

      <BrandFormDialog open={editOpen} onClose={() => setEditOpen(false)} brand={brand} />
      <DuplicateBrandDialog
        open={duplicateOpen}
        onClose={() => setDuplicateOpen(false)}
        brand={brand}
        onSuccess={(newBrand) => navigate(`/brands/${newBrand.id}`)}
      />
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
