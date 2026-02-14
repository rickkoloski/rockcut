import { useState, useEffect } from 'react';
import { TextField, MenuItem } from '@mui/material';
import FormDialog from '../../components/FormDialog';
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation';
import parseApiError from '../../lib/parseApiError';
import type { MashStep } from '../../lib/types';

interface MashStepDialogProps {
  open: boolean;
  onClose: () => void;
  recipeId: number;
  step?: MashStep;
}

const TYPES = ['infusion', 'decoction', 'direct_heat'];

export default function MashStepDialog({ open, onClose, recipeId, step }: MashStepDialogProps) {
  const [stepNumber, setStepNumber] = useState<string>('');
  const [name, setName] = useState('');
  const [temperature, setTemperature] = useState<string>('');
  const [duration, setDuration] = useState<string>('');
  const [type, setType] = useState('infusion');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useApiCreate<MashStep>('/api/mash_steps', {
    invalidateKeys: [['recipe', recipeId]],
  });

  const updateMutation = useApiUpdate<MashStep>(
    (id) => `/api/mash_steps/${id}`,
    { invalidateKeys: [['recipe', recipeId]] },
  );

  useEffect(() => {
    if (open) {
      setError(null);
      setStepNumber(step?.step_number != null ? String(step.step_number) : '');
      setName(step?.name ?? '');
      setTemperature(step?.temperature != null ? String(step.temperature) : '');
      setDuration(step?.duration != null ? String(step.duration) : '');
      setType(step?.type ?? 'infusion');
      setNotes(step?.notes ?? '');
    }
  }, [open, step]);

  const handleSubmit = async () => {
    try {
      const payload: Record<string, unknown> = {
        recipe_id: recipeId,
        step_number: stepNumber ? Number(stepNumber) : null,
        name: name || null,
        temperature: temperature ? Number(temperature) : null,
        duration: duration ? Number(duration) : null,
        type,
        notes: notes || null,
      };

      if (step) {
        await updateMutation.mutateAsync({ id: step.id, ...payload });
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
      title={step ? 'Edit Mash Step' : 'Add Mash Step'}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
    >
      <TextField
        label="Step Number"
        value={stepNumber}
        onChange={(e) => setStepNumber(e.target.value)}
        type="number"
        fullWidth
        margin="normal"
      />
      <TextField
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        fullWidth
        margin="normal"
      />
      <TextField
        label="Temperature (°F)"
        value={temperature}
        onChange={(e) => setTemperature(e.target.value)}
        type="number"
        fullWidth
        margin="normal"
      />
      <TextField
        label="Duration (min)"
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
        type="number"
        fullWidth
        margin="normal"
      />
      <TextField
        label="Type"
        value={type}
        onChange={(e) => setType(e.target.value)}
        select
        fullWidth
        margin="normal"
      >
        {TYPES.map((t) => (
          <MenuItem key={t} value={t}>
            {t.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        fullWidth
        multiline
        rows={2}
        margin="normal"
      />
    </FormDialog>
  );
}
