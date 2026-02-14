import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Grid,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { useApiCreate, useApiUpdate } from '../../../hooks/useApiMutation';
import type { Recipe, WaterProfile } from '../../../lib/types';

interface WaterTabProps {
  recipe: Recipe;
}

const FIELDS: { key: keyof WaterProfile; label: string }[] = [
  { key: 'calcium', label: 'Calcium (ppm)' },
  { key: 'magnesium', label: 'Magnesium (ppm)' },
  { key: 'sodium', label: 'Sodium (ppm)' },
  { key: 'sulfate', label: 'Sulfate (ppm)' },
  { key: 'chloride', label: 'Chloride (ppm)' },
  { key: 'bicarbonate', label: 'Bicarbonate (ppm)' },
  { key: 'ph_target', label: 'pH Target' },
];

export default function WaterTab({ recipe }: WaterTabProps) {
  const profile = recipe.water_profile;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');

  const createMutation = useApiCreate<WaterProfile>('/api/water_profiles', {
    invalidateKeys: [['recipe', recipe.id]],
  });

  const updateMutation = useApiUpdate<WaterProfile>(
    (id) => `/api/water_profiles/${id}`,
    { invalidateKeys: [['recipe', recipe.id]] },
  );

  useEffect(() => {
    if (profile) {
      const init: Record<string, string> = {};
      for (const f of FIELDS) {
        const val = profile[f.key];
        init[f.key] = val != null ? String(val) : '';
      }
      setForm(init);
      setNotes(profile.notes ?? '');
    } else {
      const init: Record<string, string> = {};
      for (const f of FIELDS) init[f.key] = '';
      setForm(init);
      setNotes('');
    }
  }, [profile]);

  const handleSave = async () => {
    const payload: Record<string, unknown> = { recipe_id: recipe.id };
    for (const f of FIELDS) {
      payload[f.key] = form[f.key] ? Number(form[f.key]) : null;
    }
    payload.notes = notes || null;

    if (profile) {
      await updateMutation.mutateAsync({ id: profile.id, ...payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    setEditing(false);
  };

  const loading = createMutation.isPending || updateMutation.isPending;

  if (!profile && !editing) {
    return (
      <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          No water profile
        </Typography>
        <Button variant="contained" onClick={() => setEditing(true)}>
          Add Water Profile
        </Button>
      </Paper>
    );
  }

  if (editing) {
    return (
      <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
        <Grid container spacing={2}>
          {FIELDS.map((f) => (
            <Grid size={{ xs: 12, sm: 6 }} key={f.key}>
              <TextField
                label={f.label}
                value={form[f.key] ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                type="number"
                fullWidth
                slotProps={{ htmlInput: { step: 0.1 } }}
              />
            </Grid>
          ))}
          <Grid size={12}>
            <TextField
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              fullWidth
              multiline
              rows={3}
            />
          </Grid>
        </Grid>
        <Box sx={{ display: 'flex', gap: 1, mt: 2, justifyContent: 'flex-end' }}>
          <Button onClick={() => setEditing(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSave} disabled={loading}>
            Save
          </Button>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
      <Grid container spacing={2}>
        {FIELDS.map((f) => (
          <Grid size={{ xs: 12, sm: 6 }} key={f.key}>
            <Typography variant="caption" color="text.secondary">
              {f.label}
            </Typography>
            <Typography variant="body1">
              {profile?.[f.key] != null ? String(profile[f.key]) : '—'}
            </Typography>
          </Grid>
        ))}
        <Grid size={12}>
          <Typography variant="caption" color="text.secondary">
            Notes
          </Typography>
          <Typography variant="body1">{profile?.notes ?? '—'}</Typography>
        </Grid>
      </Grid>
      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="outlined" onClick={() => setEditing(true)}>
          Edit Water Profile
        </Button>
      </Box>
    </Paper>
  );
}
