import { useState } from 'react';
import { Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import FormDialog from '../../components/FormDialog';
import api from '../../lib/api';
import parseApiError from '../../lib/parseApiError';
import type { Recipe, ApiResponse } from '../../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  recipe: Recipe;
  onSuccess?: (newRecipe: Recipe) => void;
}

export default function CopyRecipeDialog({ open, onClose, recipe, onSuccess }: Props) {
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ApiResponse<Recipe>>(`/api/recipes/${recipe.id}/copy`);
      return data.data;
    },
    onSuccess: (newRecipe) => {
      qc.invalidateQueries({ queryKey: ['recipes'] });
      onSuccess?.(newRecipe);
      onClose();
    },
  });

  const handleSubmit = async () => {
    try {
      await mutation.mutateAsync();
    } catch (err) {
      setError(parseApiError(err));
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Copy Recipe"
      onSubmit={handleSubmit}
      loading={mutation.isPending}
      error={error}
      submitLabel="Copy"
    >
      <Typography>
        This will create a copy of recipe v{recipe.version_major}.{recipe.version_minor} with
        an auto-incremented version number. All ingredients, mash steps, process steps, and
        water profile will be cloned.
      </Typography>
    </FormDialog>
  );
}
