import { useState, useEffect } from 'react';
import { TextField, MenuItem } from '@mui/material';
import FormDialog from '../../components/FormDialog';
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation';
import parseApiError from '../../lib/parseApiError';
import type { ProcessStep } from '../../lib/types';

interface ProcessStepDialogProps {
  open: boolean;
  onClose: () => void;
  recipeId: number;
  step?: ProcessStep;
}

const DURATION_UNITS = ['minutes', 'hours', 'days'];

export default function ProcessStepDialog({ open, onClose, recipeId, step }: ProcessStepDialogProps) {
  const [stepNumber, setStepNumber] = useState<string>('');
  const [name, setName] = useState('');
  const [day, setDay] = useState<string>('');
  const [temperature, setTemperature] = useState<string>('');
  const [duration, setDuration] = useState<string>('');
  const [durationUnit, setDurationUnit] = useState('minutes');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useApiCreate<ProcessStep>('/api/recipe_process_steps', {
    invalidateKeys: [['recipe', recipeId]],
  });

  const updateMutation = useApiUpdate<ProcessStep>(
    (id) => `/api/recipe_process_steps/${id}`,
    { invalidateKeys: [['recipe', recipeId]] },
  );

  useEffect(() => {
    if (open) {
      setError(null);
      setStepNumber(step?.step_number != null ? String(step.step_number) : '');
      setName(step?.name ?? '');
      setDay(step?.day != null ? String(step.day) : '');
      setTemperature(step?.temperature != null ? String(step.temperature) : '');
      setDuration(step?.duration != null ? String(step.duration) : '');
      setDurationUnit(step?.duration_unit ?? 'minutes');
      setNotes(step?.notes ?? '');
    }
  }, [open, step]);

  const handleSubmit = async () => {
    try {
      const payload: Record<string, unknown> = {
        recipe_id: recipeId,
        step_number: stepNumber ? Number(stepNumber) : null,
        name: name || null,
        day: day ? Number(day) : null,
        temperature: temperature ? Number(temperature) : null,
        duration: duration ? Number(duration) : null,
        duration_unit: durationUnit,
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
      title={step ? 'Edit Process Step' : 'Add Process Step'}
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
        label="Day"
        value={day}
        onChange={(e) => setDay(e.target.value)}
        type="number"
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
        label="Duration"
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
        type="number"
        fullWidth
        margin="normal"
      />
      <TextField
        label="Duration Unit"
        value={durationUnit}
        onChange={(e) => setDurationUnit(e.target.value)}
        select
        fullWidth
        margin="normal"
      >
        {DURATION_UNITS.map((u) => (
          <MenuItem key={u} value={u}>
            {u.charAt(0).toUpperCase() + u.slice(1)}
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
