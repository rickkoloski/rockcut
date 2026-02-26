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
import ProcessProfileFormDialog from './ProcessProfileFormDialog';
import type { ProcessProfile } from '../../lib/types';

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <Grid size={{ xs: 6, sm: 3 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body1">{String(value ?? '—')}</Typography>
    </Grid>
  );
}

export default function ProcessProfileDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const profileId = Number(id);

  const { data: profile, isLoading } = useApiQuery<ProcessProfile>(
    ['process_profile', profileId],
    `/api/process_profiles/${id}`,
  );

  const deleteMutation = useApiDelete(
    (delId) => `/api/process_profiles/${delId}`,
    { invalidateKeys: [['process_profiles']] },
  );

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading || !profile) {
    return <CircularProgress />;
  }

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(profileId);
    navigate('/settings/process-profiles');
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Home', to: '/' },
          { label: 'Settings', to: '/settings' },
          { label: 'Process Profiles', to: '/settings/process-profiles' },
          { label: profile.name },
        ]}
        title={profile.name}
        toolbar={
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="Edit"><IconButton onClick={() => setEditOpen(true)}><EditIcon /></IconButton></Tooltip>
            <Tooltip title="Delete"><IconButton onClick={() => setDeleteOpen(true)} color="error"><DeleteIcon /></IconButton></Tooltip>
          </Box>
        }
      />

      <Paper sx={{ p: 3, mb: 3, border: '1px solid', borderColor: 'divider' }}>
        <Typography variant="subtitle2" gutterBottom>General</Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Field label="Name" value={profile.name} />
          <Field label="Description" value={profile.description} />
        </Grid>

        <Typography variant="subtitle2" gutterBottom>Mash</Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Field label="Mash Type" value={profile.mash_type} />
          <Field label="Foundation Water" value={profile.mash_foundation_water} />
          <Field label="Strike Water Ratio" value={profile.strike_water_ratio} />
          <Field label="Mash pH" value={profile.mash_ph} />
        </Grid>

        <Typography variant="subtitle2" gutterBottom>Lauter</Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Field label="Vorlauf (min)" value={profile.vorlauf_duration} />
          <Field label="Lauter Type" value={profile.lauter_type} />
          <Field label="Temperature" value={profile.lauter_temperature} />
          <Field label="Lauter Water" value={profile.lauter_water} />
          <Field label="Final pH" value={profile.final_lauter_ph} />
          <Field label="Duration (min)" value={profile.lauter_duration} />
        </Grid>

        <Typography variant="subtitle2" gutterBottom>Boil & Post-Boil</Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Field label="Boil Duration (min)" value={profile.boil_duration} />
          <Field label="Coolpool" value={profile.coolpool ? 'Yes' : 'No'} />
          <Field label="Coolpool Temp" value={profile.coolpool_temperature} />
          <Field label="Coolpool Duration (min)" value={profile.coolpool_duration} />
          <Field label="Whirlpool (min)" value={profile.whirlpool_duration} />
          <Field label="Whirlpool Rest (min)" value={profile.whirlpool_rest_duration} />
          <Field label="Knockout (min)" value={profile.knockout_duration} />
          <Field label="Knockout Temp" value={profile.knockout_temperature} />
        </Grid>

        <Typography variant="subtitle2" gutterBottom>Fermentation</Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Field label="Lag Temp" value={profile.lag_temperature} />
          <Field label="Lag Duration (hrs)" value={profile.lag_duration} />
          <Field label="Primary Temp" value={profile.primary_temperature} />
          <Field label="Primary Duration (hrs)" value={profile.primary_duration} />
          <Field label="Secondary Temp" value={profile.secondary_temperature} />
          <Field label="Secondary Duration (hrs)" value={profile.secondary_duration} />
          <Field label="D-Rest Temp" value={profile.d_rest_temperature} />
          <Field label="D-Rest Duration (hrs)" value={profile.d_rest_duration} />
        </Grid>

        <Typography variant="subtitle2" gutterBottom>Cold Crash</Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Field label="Crash Type" value={profile.crash_type} />
          <Field label="Temperature" value={profile.crash_temperature} />
          <Field label="Duration (hrs)" value={profile.crash_duration} />
        </Grid>

        <Typography variant="subtitle2" gutterBottom>Packaging</Typography>
        <Grid container spacing={2}>
          <Field label="Transfer Type" value={profile.transfer_type} />
          <Field label="Bright Temp" value={profile.bright_temperature} />
          <Field label="Bright Duration (hrs)" value={profile.bright_duration} />
          <Field label="CO2 Volume" value={profile.co2_volume} />
        </Grid>
      </Paper>

      <ProcessProfileFormDialog open={editOpen} onClose={() => setEditOpen(false)} profile={profile} />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Process Profile"
        message={`Are you sure you want to delete "${profile.name}"? This action cannot be undone.`}
        loading={deleteMutation.isPending}
      />
    </>
  );
}
