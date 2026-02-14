import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  Paper,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import PageHeader from '../../components/PageHeader';
import StatusChip from '../../components/StatusChip';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useApiDelete } from '../../hooks/useApiMutation';
import RecipeFormDialog from './RecipeFormDialog';
import GrainBillTab from './tabs/GrainBillTab';
import MashTab from './tabs/MashTab';
import ProcessTab from './tabs/ProcessTab';
import WaterTab from './tabs/WaterTab';
import type { Recipe } from '../../lib/types';

export default function RecipeDetail() {
  const { brandId, id } = useParams<{ brandId: string; id: string }>();
  const navigate = useNavigate();
  const recipeId = Number(id);
  const numericBrandId = Number(brandId);

  const { data: recipe, isLoading } = useApiQuery<Recipe>(
    ['recipe', recipeId],
    `/api/recipes/${id}`,
  );

  const deleteMutation = useApiDelete(
    (delId) => `/api/recipes/${delId}`,
    { invalidateKeys: [['recipes', { brand_id: brandId }]] },
  );

  const [tabIndex, setTabIndex] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading || !recipe) {
    return <CircularProgress />;
  }

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(recipeId);
    navigate(`/brands/${brandId}`);
  };

  const versionLabel = `v${recipe.version_major}.${recipe.version_minor}`;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Home', to: '/' },
          { label: 'Brands', to: '/brands' },
          { label: recipe.brand?.name ?? 'Brand', to: `/brands/${brandId}` },
          { label: `Recipe ${versionLabel}` },
        ]}
        title={`Recipe ${versionLabel}`}
        action={{ label: 'Edit Recipe', onClick: () => setEditOpen(true) }}
      />

      <Paper sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="body2">
            <strong>Version:</strong> {versionLabel}
          </Typography>
          <Typography variant="body2">
            <strong>Batch Size:</strong> {recipe.batch_size ?? '—'} {recipe.batch_size_unit ?? ''}
          </Typography>
          <Typography variant="body2">
            <strong>Boil Time:</strong> {recipe.boil_time ?? '—'} min
          </Typography>
          <Typography variant="body2">
            <strong>Efficiency:</strong> {recipe.efficiency_target ?? '—'}%
          </Typography>
          <StatusChip status={recipe.status} domain="recipe" />
        </Box>
        <Box sx={{ mt: 2 }}>
          <Button color="error" variant="outlined" onClick={() => setDeleteOpen(true)}>
            Delete Recipe
          </Button>
        </Box>
      </Paper>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tabIndex} onChange={(_e, v) => setTabIndex(v)}>
          <Tab label="Grain Bill" />
          <Tab label="Mash" />
          <Tab label="Process" />
          <Tab label="Water" />
        </Tabs>
      </Box>

      {tabIndex === 0 && <GrainBillTab recipe={recipe} />}
      {tabIndex === 1 && <MashTab recipe={recipe} />}
      {tabIndex === 2 && <ProcessTab recipe={recipe} />}
      {tabIndex === 3 && <WaterTab recipe={recipe} />}

      <RecipeFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        brandId={numericBrandId}
        recipe={recipe}
      />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Recipe"
        message="Are you sure you want to delete this recipe? This action cannot be undone."
        loading={deleteMutation.isPending}
      />
    </>
  );
}
