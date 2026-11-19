import { useState } from 'react';
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

// Task 4084: the form mounts when the dialog opens and starts from the
// definition, instead of an effect resetting it on open (as D60's dialogs).
export default function FieldDefinitionDialog({ open, ...props }: FieldDefinitionDialogProps) {
  return open ? <FieldDefinitionForm {...props} /> : null;
}

function FieldDefinitionForm({ onClose, categoryId, definition }: Omit<FieldDefinitionDialogProps, 'open'>) {
  const [fieldName, setFieldName] = useState(definition?.field_name ?? '');
  const [fieldType, setFieldType] = useState(definition?.field_type ?? 'text');
  const [options, setOptions] = useState(definition?.options ?? '');
  const [required, setRequired] = useState(definition?.required ?? false);
  const [sortOrder, setSortOrder] = useState(definition?.sort_order?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);

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
      open
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
        <InputLabel id="field-definition-type-label">Field Type</InputLabel>
        <Select
          labelId="field-definition-type-label"
          value={fieldType}
          label="Field Type"
          onChange={(e) => setFieldType(e.target.value)}
        >
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
