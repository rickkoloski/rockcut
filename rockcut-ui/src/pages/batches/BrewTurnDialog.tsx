import { useEffect, useState } from 'react';
import {
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import type { BrewTurn, Recipe } from '../../lib/types';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation';
import FormDialog from '../../components/FormDialog';
import parseApiError from '../../lib/parseApiError';

interface BrewTurnDialogProps {
  open: boolean;
  onClose: () => void;
  batchId: number;
  brandId: number;
  turn?: BrewTurn;
}

export default function BrewTurnDialog({ open, onClose, batchId, brandId, turn }: BrewTurnDialogProps) {
  const { data: recipes = [] } = useApiQuery<Recipe[]>(
    ['recipes', { brand_id: brandId }],
    '/api/recipes',
    { brand_id: brandId },
  );

  const [recipeId, setRecipeId] = useState<number | ''>('');
  const [turnNumber, setTurnNumber] = useState('');
  const [brewDate, setBrewDate] = useState('');
  const [actualOg, setActualOg] = useState('');
  const [actualVolume, setActualVolume] = useState('');
  const [actualEfficiency, setActualEfficiency] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setRecipeId(turn?.recipe_id ?? '');
      setTurnNumber(turn?.turn_number?.toString() ?? '');
      setBrewDate(turn?.brew_date ?? '');
      setActualOg(turn?.actual_og?.toString() ?? '');
      setActualVolume(turn?.actual_volume?.toString() ?? '');
      setActualEfficiency(turn?.actual_efficiency?.toString() ?? '');
      setNotes(turn?.notes ?? '');
    }
  }, [open, turn]);

  const createMutation = useApiCreate<BrewTurn>('/api/brew_turns', {
    invalidateKeys: [['batch', batchId]],
  });

  const updateMutation = useApiUpdate<BrewTurn>(
    (id) => `/api/brew_turns/${id}`,
    { invalidateKeys: [['batch', batchId]] },
  );

  const loading = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async () => {
    try {
      const payload: Record<string, unknown> = {
        batch_id: batchId,
        recipe_id: recipeId || null,
        turn_number: turnNumber ? Number(turnNumber) : null,
        brew_date: brewDate || null,
        actual_og: actualOg ? Number(actualOg) : null,
        actual_volume: actualVolume ? Number(actualVolume) : null,
        actual_efficiency: actualEfficiency ? Number(actualEfficiency) : null,
        notes: notes || null,
      };

      if (turn) {
        await updateMutation.mutateAsync({ id: turn.id, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onClose();
    } catch (err) {
      setError(parseApiError(err));
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={turn ? 'Edit Brew Turn' : 'New Brew Turn'}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
    >
      <FormControl fullWidth margin="dense">
        <InputLabel>Recipe</InputLabel>
        <Select
          value={recipeId}
          label="Recipe"
          onChange={(e) => setRecipeId(e.target.value as number)}
        >
          {recipes.map((r) => (
            <MenuItem key={r.id} value={r.id}>v{r.version}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        fullWidth
        margin="dense"
        label="Turn Number"
        type="number"
        value={turnNumber}
        onChange={(e) => setTurnNumber(e.target.value)}
      />
      <TextField
        fullWidth
        margin="dense"
        label="Brew Date"
        type="date"
        value={brewDate}
        onChange={(e) => setBrewDate(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        fullWidth
        margin="dense"
        label="Actual OG"
        type="number"
        value={actualOg}
        onChange={(e) => setActualOg(e.target.value)}
      />
      <TextField
        fullWidth
        margin="dense"
        label="Actual Volume"
        type="number"
        value={actualVolume}
        onChange={(e) => setActualVolume(e.target.value)}
      />
      <TextField
        fullWidth
        margin="dense"
        label="Actual Efficiency"
        type="number"
        value={actualEfficiency}
        onChange={(e) => setActualEfficiency(e.target.value)}
      />
      <TextField
        fullWidth
        margin="dense"
        label="Notes"
        multiline
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
    </FormDialog>
  );
}
