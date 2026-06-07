import { useState, useEffect } from 'react';
import { TextField, MenuItem, FormControl, InputLabel, Select } from '@mui/material';
import FormDialog from '../../components/FormDialog';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation';
import parseApiError from '../../lib/parseApiError';
import type { RecipeIngredient, IngredientLot, IngredientCategory, Ingredient } from '../../lib/types';

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
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [ingredientId, setIngredientId] = useState<number | ''>('');
  const [lotId, setLotId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [unit, setUnit] = useState('');
  const [use, setUse] = useState('');
  const [timeMinutes, setTimeMinutes] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: categories = [] } = useApiQuery<IngredientCategory[]>(
    ['ingredient_categories'],
    '/api/ingredient_categories'
  );

  const { data: ingredients = [] } = useApiQuery<Ingredient[]>(
    ['ingredients', { category_id: categoryId }],
    '/api/ingredients',
    categoryId ? { category_id: categoryId } : undefined
  );

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
      setAmount(ingredient?.amount != null ? String(ingredient.amount) : '');
      setUnit(ingredient?.unit ?? '');
      setUse(ingredient?.use ?? '');
      setTimeMinutes(ingredient?.time_minutes != null ? String(ingredient.time_minutes) : '');
      setSortOrder(ingredient?.sort_order != null ? String(ingredient.sort_order) : '');
      setNotes(ingredient?.notes ?? '');

      if (ingredient) {
        const currentLot = lots.find((l) => l.id === ingredient.lot_id);
        setCategoryId(currentLot?.ingredient?.category?.id ?? '');
        setIngredientId(currentLot?.ingredient?.id ?? '');
        setLotId(String(ingredient.lot_id ?? ''));
      } else {
        const grains = categories.find((c) => c.name === 'Grains');
        setCategoryId(grains?.id ?? '');
        setIngredientId('');
        setLotId('');
      }
    }
  }, [open, ingredient, lots, categories]);

  const filteredLots = ingredientId
    ? lots.filter((l) => l.ingredient?.id === ingredientId)
    : lots;

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
    const lotNum = lot.lot_number ?? '—';
    const supplier = lot.supplier ?? '';
    return `Lot# ${lotNum}${supplier ? ` (${supplier})` : ''}`;
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
      <FormControl fullWidth margin="normal">
        <InputLabel>Category</InputLabel>
        <Select
          value={categoryId}
          label="Category"
          onChange={(e) => {
            setCategoryId(e.target.value as number | '');
            setIngredientId('');
            setLotId('');
          }}
        >
          <MenuItem value="">All Categories</MenuItem>
          {categories.map((cat) => (
            <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl fullWidth margin="normal">
        <InputLabel>Ingredient</InputLabel>
        <Select
          value={ingredientId}
          label="Ingredient"
          onChange={(e) => {
            setIngredientId(e.target.value as number | '');
            setLotId('');
          }}
          disabled={!categoryId}
        >
          <MenuItem value="">Select ingredient...</MenuItem>
          {ingredients.map((ing) => (
            <MenuItem key={ing.id} value={ing.id}>{ing.name}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl fullWidth margin="normal">
        <InputLabel>Lot</InputLabel>
        <Select
          value={lotId}
          label="Lot"
          onChange={(e) => setLotId(e.target.value as string)}
          disabled={!ingredientId}
          required
        >
          <MenuItem value="">Select lot...</MenuItem>
          {filteredLots.map((lot) => (
            <MenuItem key={lot.id} value={String(lot.id)}>
              {lotLabel(lot)}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

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
