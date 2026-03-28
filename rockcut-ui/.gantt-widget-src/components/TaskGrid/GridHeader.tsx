import React from 'react';
import type { ColumnState } from '../../hooks';
import { ResizeHandle } from './ResizeHandle';
import { ColumnHeaderDropdown } from './ColumnHeaderDropdown';

export interface GridHeaderProps {
  columns: ColumnState[];
  onColumnHide: (columnId: string) => void;
  onResizeStart: (columnId: string, startX: number, startWidth: number) => void;
  onResizeMove: (currentX: number) => void;
  onResizeEnd: () => void;
  onSort?: (columnId: string, direction: 'asc' | 'desc') => void;
  onAutoFit?: (columnId: string) => void;
}

export function GridHeader({
  columns,
  onColumnHide,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onSort,
  onAutoFit,
}: GridHeaderProps) {
  const visibleColumns = columns.filter(c => c.visible);
  const canHide = visibleColumns.length > 1;

  return (
    <div
      className="grid-header flex border-b-2 border-[var(--gantt-grid-line)] bg-[var(--color-surface)] sticky top-0 z-10"
      role="row"
    >
      {visibleColumns.map((column, index) => (
        <div
          key={column.id}
          className="column-header group relative flex items-center justify-between px-2 h-10 text-sm font-medium select-none border-r border-[var(--gantt-grid-line)] last:border-r-0"
          style={{ width: column.width, minWidth: column.minWidth }}
          data-testid={`column-header-${column.id}`}
          role="columnheader"
        >
          <span
            className={`truncate flex-1 ${
              column.align === 'center' ? 'text-center' :
              column.align === 'right' ? 'text-right' : 'text-left'
            }`}
          >
            {column.header}
          </span>

          <ColumnHeaderDropdown
            column={column}
            onHide={onColumnHide}
            onSort={onSort}
            canHide={canHide}
          />

          {/* Resize handle (not on last column) */}
          {index < visibleColumns.length - 1 && (
            <ResizeHandle
              columnId={column.id}
              columnWidth={column.width}
              onResizeStart={onResizeStart}
              onResizeMove={onResizeMove}
              onResizeEnd={onResizeEnd}
              onDoubleClick={onAutoFit}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// Keep backwards-compatible export for existing usage
export const GridHeaderLegacy: React.FC<{
  columns?: { id: string; title: string; width: number; align?: 'left' | 'center' | 'right' }[];
  showResourceColumn?: boolean;
  showProgressColumn?: boolean;
  showStatusColumn?: boolean;
}> = () => null; // Legacy component - not used with new column management
