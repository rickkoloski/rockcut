export interface ColumnDef {
  id: string;
  title: string;
  width: number;
  align?: 'left' | 'center' | 'right';
}

export const DEFAULT_COLUMNS: ColumnDef[] = [
  { id: 'wbs', title: 'WBS', width: 60, align: 'left' },
  { id: 'name', title: 'Name', width: 250, align: 'left' },
  { id: 'startDate', title: 'Start', width: 100, align: 'center' },
  { id: 'endDate', title: 'End', width: 100, align: 'center' },
  { id: 'duration', title: 'Duration', width: 80, align: 'right' },
];

export const RESOURCE_COLUMN: ColumnDef = {
  id: 'resources',
  title: 'Resources',
  width: 150,
  align: 'left',
};

export const PROGRESS_COLUMN: ColumnDef = {
  id: 'progress',
  title: 'Progress',
  width: 100,
  align: 'left',
};

export const STATUS_COLUMN: ColumnDef = {
  id: 'status',
  title: 'Status',
  width: 100,
  align: 'left',
};

export const DEFAULT_ROW_HEIGHT = 36;
export const INDENT_WIDTH = 20;
export const BUFFER_ROWS = 5;

// Enhanced column configuration with min/default widths
export interface ColumnConfig {
  field: string;
  header: string;
  minWidth: number;
  defaultWidth: number;
  align?: 'left' | 'center' | 'right';
}

export const COLUMN_CONFIGS: Record<string, ColumnConfig> = {
  wbs: { field: 'wbs', header: '#', minWidth: 50, defaultWidth: 60, align: 'center' },
  name: { field: 'name', header: 'Task Name', minWidth: 150, defaultWidth: 250, align: 'left' },
  startDate: { field: 'startDate', header: 'Start', minWidth: 75, defaultWidth: 85, align: 'left' },
  endDate: { field: 'endDate', header: 'End', minWidth: 75, defaultWidth: 85, align: 'left' },
  duration: { field: 'duration', header: 'Duration', minWidth: 70, defaultWidth: 80, align: 'right' },
  progress: { field: 'percentDone', header: 'Progress', minWidth: 90, defaultWidth: 100, align: 'center' },
  status: { field: 'status', header: 'Status', minWidth: 95, defaultWidth: 110, align: 'left' },
  resources: { field: 'resources', header: 'Resources', minWidth: 100, defaultWidth: 150, align: 'left' },
};

// Calculate total grid width from visible columns
export function calculateGridWidth(visibleColumns: string[]): number {
  return visibleColumns.reduce((total, col) => {
    const config = COLUMN_CONFIGS[col];
    return total + (config?.defaultWidth || 100);
  }, 0);
}

// Row height options
export const ROW_HEIGHTS = {
  compact: 32,
  normal: 40,
  comfortable: 48,
} as const;

export type RowHeightOption = keyof typeof ROW_HEIGHTS;
