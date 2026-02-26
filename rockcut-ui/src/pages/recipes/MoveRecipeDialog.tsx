import { useState, useEffect } from 'react';
import { TextField, MenuItem } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import FormDialog from '../../components/FormDialog';
import { useApiQuery } from '../../hooks/useApiQuery';
import api from '../../lib/api';
import parseApiError from '../../lib/parseApiError';
import type { Recipe, Brand, ApiResponse } from '../../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  recipe: Recipe;
  onSuccess?: (movedRecipe: Recipe) => void;
}

export default function MoveRecipeDialog({ open, onClose, recipe, onSuccess }: Props) {
  const [targetBrandId, setTargetBrandId] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: brands = [] } = useApiQuery<Brand[]>(['brands', { include_archived: 'true' }], '/api/brands', { include_archived: 'true' });

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ApiResponse<Recipe>>(`/api/recipes/${recipe.id}/move`, {
        target_brand_id: targetBrandId,
      });
      return data.data;
    },
    onSuccess: (movedRecipe) => {
      qc.invalidateQueries({ queryKey: ['recipes'] });
      qc.invalidateQueries({ queryKey: ['brand'] });
      onSuccess?.(movedRecipe);
      onClose();
    },
  });

  useEffect(() => {
    if (open) {
      setTargetBrandId('');
      setError(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!targetBrandId) {
      setError('Please select a target brand');
      return;
    }
    try {
      await mutation.mutateAsync();
    } catch (err) {
      setError(parseApiError(err));
    }
  };

  // Filter out the current brand
  const otherBrands = brands.filter((b) => b.id !== recipe.brand_id);

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Move Recipe to Brand"
      onSubmit={handleSubmit}
      loading={mutation.isPending}
      error={error}
      submitLabel="Move"
    >
      <TextField
        label="Target Brand"
        value={targetBrandId}
        onChange={(e) => setTargetBrandId(Number(e.target.value))}
        select
        required
        fullWidth
        margin="normal"
      >
        {otherBrands.map((b) => (
          <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
        ))}
      </TextField>
    </FormDialog>
  );
}
