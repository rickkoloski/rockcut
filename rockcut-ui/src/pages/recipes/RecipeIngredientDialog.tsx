import { useState, useEffect } from 'react';
import { TextField, MenuItem } from '@mui/material';
import FormDialog from '../../components/FormDialog';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation';
import parseApiError from '../../lib/parseApiError';
import type { RecipeIngredient, IngredientLot } from '../../lib/types';

interface RecipeIngredientDialogProps {
  open: boolean;
  onClose: () => void;
  recipeId: number;
  ingredient?: RecipeIngredient;
}

export default function RecipeIngredientDialog({
  open,
  onClose,
  recipeId,
  ingredient,
}: RecipeIngredientDialogProps) {
  const [lotId, setLotId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [unit, setUnit] = useState('');
  const [use, setUse] = useState('');
  const [timeMinutes, setTimeMinutes] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: lots = [] } = useApiQuery<IngredientLot[]>(
    ['ingredient_lots'],
    '/api/ingredient_lots',
  );

  const createMutation = useApiCreate<RecipeIngredient>('/api/recipe_ingredients', {
    invalidateKeys: [['recipe', recipeId]],
  });

  const updateMutation = useApiUpdate<RecipeIngredient>(
    (id) => `/api/recipe_ingredients/${id}`,
    { invalidateKeys: [['recipe', recipeId]] },
  );

  useEffect(() => {
    if (open) {
      setError(null);
      setLotId(ingredient?.lot_id != null ? String(ingredient.lot_id) : '');
      setAmount(ingredient?.amount != null ? String(ingredient.amount) : '');
      setUnit(ingredient?.unit ?? '');
      setUse(ingredient?.use ?? '');
      setTimeMinutes(ingredient?.time_minutes != null ? String(ingredient.time_minutes) : '');
      setSortOrder(ingredient?.sort_order != null ? String(ingredient.sort_order) : '');
      setNotes(ingredient?.notes ?? '');
    }
  }, [open, ingredient]);

  const handleSubmit = async () => {
    try {
      const payload: Record<string, unknown> = {
        recipe_id: recipeId,
        lot_id: lotId ? Number(lotId) : null,
        amount: amount ? Number(amount) : null,
        unit: unit || null,
        use: use || null,
        time_minutes: timeMinutes ? Number(timeMinutes) : null,
        sort_order: sortOrder ? Number(sortOrder) : null,
        notes: notes || null,
      };

      if (ingredient) {
        await updateMutation.mutateAsync({ id: ingredient.id, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onClose();
    } catch (err) {
      setError(parseApiError(err));
    }
  };

  const loading = createMutation.isPending || updateMutation.isPending;

  const lotLabel = (lot: IngredientLot) => {
    const name = lot.ingredient?.name ?? 'Unknown';
    const lotNum = lot.lot_number ?? '—';
    const supplier = lot.supplier ?? '';
    return `${name} - Lot# ${lotNum}${supplier ? ` (${supplier})` : ''}`;
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={ingredient ? 'Edit Ingredient' : 'Add Ingredient'}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
    >
      <TextField
        label="Lot"
        value={lotId}
        onChange={(e) => setLotId(e.target.value)}
        select
        fullWidth
        margin="normal"
        required
      >
        {lots.map((lot) => (
          <MenuItem key={lot.id} value={String(lot.id)}>
            {lotLabel(lot)}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        type="number"
        fullWidth
        margin="normal"
      />
      <TextField
        label="Unit"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        fullWidth
        margin="normal"
      />
      <TextField
        label="Use"
        value={use}
        onChange={(e) => setUse(e.target.value)}
        fullWidth
        margin="normal"
      />
      <TextField
        label="Time (minutes)"
        value={timeMinutes}
        onChange={(e) => setTimeMinutes(e.target.value)}
        type="number"
        fullWidth
        margin="normal"
      />
      <TextField
        label="Sort Order"
        value={sortOrder}
        onChange={(e) => setSortOrder(e.target.value)}
        type="number"
        fullWidth
        margin="normal"
      />
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
