import { useEffect, useState } from 'react';
import {
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormControlLabel,
  Switch,
} from '@mui/material';
import type { CategoryFieldDefinition } from '../../lib/types';
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation';
import FormDialog from '../../components/FormDialog';
import parseApiError from '../../lib/parseApiError';

interface FieldDefinitionDialogProps {
  open: boolean;
  onClose: () => void;
  categoryId: number;
  definition?: CategoryFieldDefinition;
}

export default function FieldDefinitionDialog({ open, onClose, categoryId, definition }: FieldDefinitionDialogProps) {
  const [fieldName, setFieldName] = useState('');
  const [fieldType, setFieldType] = useState('text');
  const [options, setOptions] = useState('');
  const [required, setRequired] = useState(false);
  const [sortOrder, setSortOrder] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setFieldName(definition?.field_name ?? '');
      setFieldType(definition?.field_type ?? 'text');
      setOptions(definition?.options ?? '');
      setRequired(definition?.required ?? false);
      setSortOrder(definition?.sort_order?.toString() ?? '');
    }
  }, [open, definition]);

  const createMutation = useApiCreate<CategoryFieldDefinition>('/api/category_field_definitions', {
    invalidateKeys: [['ingredient_category', categoryId]],
  });

  const updateMutation = useApiUpdate<CategoryFieldDefinition>(
    (id) => `/api/category_field_definitions/${id}`,
    { invalidateKeys: [['ingredient_category', categoryId]] },
  );

  const loading = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async () => {
    try {
      const payload: Record<string, unknown> = {
        category_id: categoryId,
        field_name: fieldName,
        field_type: fieldType,
        options: fieldType === 'dropdown' ? options : null,
        required,
        sort_order: sortOrder ? Number(sortOrder) : null,
      };

      if (definition) {
        await updateMutation.mutateAsync({ id: definition.id, ...payload });
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
      title={definition ? 'Edit Field Definition' : 'New Field Definition'}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
    >
      <TextField
        fullWidth
        margin="dense"
        label="Field Name"
        required
        value={fieldName}
        onChange={(e) => setFieldName(e.target.value)}
      />
      <FormControl fullWidth margin="dense">
        <InputLabel>Field Type</InputLabel>
        <Select value={fieldType} label="Field Type" onChange={(e) => setFieldType(e.target.value)}>
          <MenuItem value="text">Text</MenuItem>
          <MenuItem value="number">Number</MenuItem>
          <MenuItem value="dropdown">Dropdown</MenuItem>
          <MenuItem value="checkbox">Checkbox</MenuItem>
        </Select>
      </FormControl>
      {fieldType === 'dropdown' && (
        <TextField
          fullWidth
          margin="dense"
          label="Options"
          value={options}
          onChange={(e) => setOptions(e.target.value)}
          helperText="Comma-separated values"
        />
      )}
      <FormControlLabel
        control={
          <Switch checked={required} onChange={(e) => setRequired(e.target.checked)} />
        }
        label="Required"
        sx={{ mt: 1 }}
      />
      <TextField
        fullWidth
        margin="dense"
        label="Sort Order"
        type="number"
        value={sortOrder}
        onChange={(e) => setSortOrder(e.target.value)}
      />
    </FormDialog>
  );
}
