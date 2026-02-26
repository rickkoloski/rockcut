import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  CircularProgress,
  Grid,
  IconButton,
  Paper,
  Tooltip,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PageHeader from '../../components/PageHeader';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useApiDelete } from '../../hooks/useApiMutation';
import BrewhouseFormDialog from './BrewhouseFormDialog';
import type { Brewhouse } from '../../lib/types';

export default function BrewhouseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const brewhouseId = Number(id);

  const { data: brewhouse, isLoading } = useApiQuery<Brewhouse>(
    ['brewhouse', brewhouseId],
    `/api/brewhouses/${id}`,
  );

  const deleteMutation = useApiDelete(
    (delId) => `/api/brewhouses/${delId}`,
    { invalidateKeys: [['brewhouses']] },
  );

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading || !brewhouse) {
    return <CircularProgress />;
  }

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(brewhouseId);
    navigate('/settings/brewhouses');
  };

  const uomFields = [
    { label: 'Temperature Unit', value: brewhouse.temp_unit },
    { label: 'Liquid Volume Unit', value: brewhouse.liquid_vol_unit },
    { label: 'Density Unit', value: brewhouse.density_unit },
    { label: 'Alcohol Unit', value: brewhouse.alcohol_unit },
    { label: 'Density Calc Method', value: brewhouse.density_calc_method },
    { label: 'IBU Calc Method', value: brewhouse.ibu_calc_method },
    { label: 'Ingredient Weight Unit', value: brewhouse.ingredient_weight_unit },
    { label: 'Ingredient Volume Unit', value: brewhouse.ingredient_vol_unit },
  ];

  const equipFields = [
    { label: 'Kettle Turn Size', value: brewhouse.kettle_turn_size },
    { label: 'Evaporation Rate', value: brewhouse.kettle_evaporation_rate },
    { label: 'Kettle Loss', value: brewhouse.kettle_loss },
    { label: 'Fermenter Loss', value: brewhouse.ferm_loss },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Home', to: '/' },
          { label: 'Settings', to: '/settings' },
          { label: 'Brewhouses', to: '/settings/brewhouses' },
          { label: brewhouse.name },
        ]}
        title={brewhouse.name}
        toolbar={
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="Edit"><IconButton onClick={() => setEditOpen(true)}><EditIcon /></IconButton></Tooltip>
            <Tooltip title="Delete"><IconButton onClick={() => setDeleteOpen(true)} color="error"><DeleteIcon /></IconButton></Tooltip>
          </Box>
        }
      />

      <Paper sx={{ p: 3, mb: 3, border: '1px solid', borderColor: 'divider' }}>
        <Typography variant="subtitle2" gutterBottom>General</Typography>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">Name</Typography>
            <Typography variant="body1">{brewhouse.name}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">Default</Typography>
            <Typography variant="body1">{brewhouse.is_default ? 'Yes' : 'No'}</Typography>
          </Grid>
          {brewhouse.notes && (
            <Grid size={{ xs: 12 }}>
              <Typography variant="caption" color="text.secondary">Notes</Typography>
              <Typography variant="body1">{brewhouse.notes}</Typography>
            </Grid>
          )}
        </Grid>

        <Typography variant="subtitle2" gutterBottom>UOM Preferences</Typography>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          {uomFields.map((f) => (
            <Grid size={{ xs: 6, sm: 3 }} key={f.label}>
              <Typography variant="caption" color="text.secondary">{f.label}</Typography>
              <Typography variant="body1">{String(f.value ?? '—')}</Typography>
            </Grid>
          ))}
        </Grid>

        <Typography variant="subtitle2" gutterBottom>Equipment Values</Typography>
        <Grid container spacing={2}>
          {equipFields.map((f) => (
            <Grid size={{ xs: 6, sm: 3 }} key={f.label}>
              <Typography variant="caption" color="text.secondary">{f.label}</Typography>
              <Typography variant="body1">{String(f.value ?? '—')}</Typography>
            </Grid>
          ))}
        </Grid>
      </Paper>

      <BrewhouseFormDialog open={editOpen} onClose={() => setEditOpen(false)} brewhouse={brewhouse} />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Brewhouse"
        message={`Are you sure you want to delete "${brewhouse.name}"? This action cannot be undone.`}
        loading={deleteMutation.isPending}
      />
    </>
  );
}
