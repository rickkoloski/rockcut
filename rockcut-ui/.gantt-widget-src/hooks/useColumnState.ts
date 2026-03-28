import { useState, useCallback, useMemo, useEffect } from 'react';

export interface ColumnState {
  id: string;
  field: string;
  header: string;
  width: number;
  minWidth: number;
  visible: boolean;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
}

export const DEFAULT_COLUMNS: ColumnState[] = [
  { id: 'wbs', field: 'wbs', header: '#', width: 60, minWidth: 40, visible: true, align: 'center' },
  { id: 'name', field: 'name', header: 'Task Name', width: 250, minWidth: 100, visible: true, align: 'left', sortable: true },
  { id: 'startDate', field: 'startDate', header: 'Start', width: 85, minWidth: 70, visible: true, align: 'left', sortable: true },
  { id: 'endDate', field: 'endDate', header: 'End', width: 85, minWidth: 70, visible: true, align: 'left', sortable: true },
  { id: 'duration', field: 'duration', header: 'Duration', width: 80, minWidth: 60, visible: true, align: 'right', sortable: true },
  { id: 'progress', field: 'percentDone', header: 'Progress', width: 100, minWidth: 80, visible: true, align: 'center' },
  { id: 'status', field: 'status', header: 'Status', width: 110, minWidth: 80, visible: true, align: 'left' },
  { id: 'resources', field: 'resources', header: 'Resources', width: 150, minWidth: 80, visible: true, align: 'left' },
];

export interface UseColumnStateOptions {
  initialColumns?: ColumnState[];
  onColumnsChange?: (columns: ColumnState[]) => void;
}

export function useColumnState(options: UseColumnStateOptions = {}) {
  const [columns, setColumns] = useState<ColumnState[]>(
    options.initialColumns || DEFAULT_COLUMNS
  );

  const showColumn = useCallback((columnId: string) => {
    setColumns(prev => prev.map(c =>
      c.id === columnId ? { ...c, visible: true } : c
    ));
  }, []);

  const hideColumn = useCallback((columnId: string) => {
    setColumns(prev => {
      // Prevent hiding all columns - must keep at least one
      const visibleCount = prev.filter(c => c.visible).length;
      if (visibleCount <= 1) return prev;

      return prev.map(c =>
        c.id === columnId ? { ...c, visible: false } : c
      );
    });
  }, []);

  const toggleColumn = useCallback((columnId: string, visible: boolean) => {
    if (visible) {
      showColumn(columnId);
    } else {
      hideColumn(columnId);
    }
  }, [showColumn, hideColumn]);

  const resizeColumn = useCallback((columnId: string, width: number) => {
    setColumns(prev => prev.map(c => {
      if (c.id !== columnId) return c;
      const newWidth = Math.max(width, c.minWidth);
      return { ...c, width: newWidth };
    }));
  }, []);

  const resetColumns = useCallback(() => {
    setColumns(options.initialColumns || DEFAULT_COLUMNS);
  }, [options.initialColumns]);

  const visibleColumns = useMemo(
    () => columns.filter(c => c.visible),
    [columns]
  );

  const totalWidth = useMemo(
    () => visibleColumns.reduce((sum, c) => sum + c.width, 0),
    [visibleColumns]
  );

  useEffect(() => {
    options.onColumnsChange?.(columns);
  }, [columns, options.onColumnsChange]);

  return {
    columns,
    visibleColumns,
    totalWidth,
    showColumn,
    hideColumn,
    toggleColumn,
    resizeColumn,
    resetColumns,
    setColumns,
  };
}
