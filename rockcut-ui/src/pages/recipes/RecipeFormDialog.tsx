import { useState, useEffect } from 'react';
import { TextField, MenuItem } from '@mui/material';
import FormDialog from '../../components/FormDialog';
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation';
import parseApiError from '../../lib/parseApiError';
import type { Recipe } from '../../lib/types';

interface RecipeFormDialogProps {
  open: boolean;
  onClose: () => void;
  brandId: number;
  recipe?: Recipe;
}

const STATUSES = ['draft', 'active', 'archived'];
const BATCH_UNITS = ['bbls', 'gallons', 'liters'];

export default function RecipeFormDialog({ open, onClose, brandId, recipe }: RecipeFormDialogProps) {
  const [versionMajor, setVersionMajor] = useState<string>('1');
  const [versionMinor, setVersionMinor] = useState<string>('0');
  const [batchSize, setBatchSize] = useState<string>('');
  const [batchSizeUnit, setBatchSizeUnit] = useState('bbls');
  const [boilTime, setBoilTime] = useState<string>('60');
  const [efficiencyTarget, setEfficiencyTarget] = useState<string>('');
  const [status, setStatus] = useState('draft');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const invalidateKeys: unknown[][] = [['recipes', { brand_id: String(brandId) }]];
  if (recipe) invalidateKeys.push(['recipe', recipe.id]);

  const createMutation = useApiCreate<Recipe>('/api/recipes', { invalidateKeys });
  const updateMutation = useApiUpdate<Recipe>(
    (id) => `/api/recipes/${id}`,
    { invalidateKeys },
  );

  useEffect(() => {
    if (open) {
      setVersionMajor(recipe?.version_major != null ? String(recipe.version_major) : '1');
      setVersionMinor(recipe?.version_minor != null ? String(recipe.version_minor) : '0');
      setBatchSize(recipe?.batch_size != null ? String(recipe.batch_size) : '');
      setBatchSizeUnit(recipe?.batch_size_unit ?? 'bbls');
      setBoilTime(recipe?.boil_time != null ? String(recipe.boil_time) : '60');
      setEfficiencyTarget(recipe?.efficiency_target != null ? String(recipe.efficiency_target) : '');
      setStatus(recipe?.status ?? 'draft');
      setNotes(recipe?.notes ?? '');
      setError(null);
    }
  }, [open, recipe]);

  const handleSubmit = async () => {
    try {
      const payload: Record<string, unknown> = {
        brand_id: brandId,
        version_major: Number(versionMajor),
        version_minor: Number(versionMinor),
        batch_size: batchSize ? Number(batchSize) : null,
        batch_size_unit: batchSizeUnit,
        boil_time: boilTime ? Number(boilTime) : null,
        efficiency_target: efficiencyTarget ? Number(efficiencyTarget) : null,
        status,
        notes: notes || null,
      };

      if (recipe) {
        await updateMutation.mutateAsync({ id: recipe.id, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onClose();
    } catch (err) {
      setError(parseApiError(err));
    }
  };

  const loading = createMutation.isPending || updateMutation.isPending;

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={recipe ? 'Edit Recipe' : 'Add Recipe'}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
    >
      <TextField
        label="Version Major"
        value={versionMajor}
        onChange={(e) => setVersionMajor(e.target.value)}
        type="number"
        fullWidth
        margin="normal"
        required
      />
      <TextField
        label="Version Minor"
        value={versionMinor}
        onChange={(e) => setVersionMinor(e.target.value)}
        type="number"
        fullWidth
        margin="normal"
        required
      />
      <TextField
        label="Batch Size"
        value={batchSize}
        onChange={(e) => setBatchSize(e.target.value)}
        type="number"
        fullWidth
        margin="normal"
        required
      />
      <TextField
        label="Batch Size Unit"
        value={batchSizeUnit}
        onChange={(e) => setBatchSizeUnit(e.target.value)}
        select
        fullWidth
        margin="normal"
      >
        {BATCH_UNITS.map((u) => (
          <MenuItem key={u} value={u}>
            {u.charAt(0).toUpperCase() + u.slice(1)}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Boil Time (min)"
        value={boilTime}
        onChange={(e) => setBoilTime(e.target.value)}
        type="number"
        fullWidth
        margin="normal"
      />
      <TextField
        label="Efficiency Target (%)"
        value={efficiencyTarget}
        onChange={(e) => setEfficiencyTarget(e.target.value)}
        type="number"
        fullWidth
        margin="normal"
      />
      <TextField
        label="Status"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        select
        fullWidth
        margin="normal"
      >
        {STATUSES.map((s) => (
          <MenuItem key={s} value={s}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        fullWidth
        multiline
        rows={3}
        margin="normal"
      />
    </FormDialog>
  );
}
