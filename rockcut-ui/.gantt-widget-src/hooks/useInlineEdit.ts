import { useState, useCallback } from 'react';

export interface InlineEditState {
  taskId: string;
  field: string;
  originalValue: unknown;
  currentValue: unknown;
}

export function useInlineEdit() {
  const [editState, setEditState] = useState<InlineEditState | null>(null);

  const startEdit = useCallback((taskId: string, field: string, initialValue?: unknown) => {
    setEditState({
      taskId,
      field,
      originalValue: initialValue,
      currentValue: initialValue,
    });
  }, []);

  const isEditing = useCallback((taskId: string, field: string): boolean => {
    return editState?.taskId === taskId && editState?.field === field;
  }, [editState]);

  const updateValue = useCallback((value: unknown) => {
    setEditState(prev => prev ? { ...prev, currentValue: value } : null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditState(null);
  }, []);

  const commitEdit = useCallback(() => {
    const result = editState;
    setEditState(null);
    return result;
  }, [editState]);

  return {
    editState,
    isEditing,
    startEdit,
    updateValue,
    cancelEdit,
    commitEdit,
  };
}
