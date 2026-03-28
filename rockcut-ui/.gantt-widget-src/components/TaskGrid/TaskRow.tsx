import React from 'react';
import { TaskModel } from '../../models';
import { TreeCell } from './TreeCell';
import { DateCell } from './DateCell';
import { DurationCell } from './DurationCell';
import { ResourceCell } from './ResourceCell';
import { ProgressCell } from './ProgressCell';
import { StatusCell } from './StatusCell';
import { InlineNameEditor } from './InlineNameEditor';
import { InlineDateEditor } from './InlineDateEditor';
import type { ColumnState } from '../../hooks';
import type { AssignmentStore } from '../../stores/AssignmentStore';
import type { ResourceStore } from '../../stores/ResourceStore';

interface TaskRowProps {
  task: TaskModel;
  wbsValue: string;
  depth: number;
  isSelected: boolean;
  onSelect: (taskId: string) => void;
  onToggleExpand: (taskId: string) => void;
  onDoubleClick?: (taskId: string) => void;
  style: React.CSSProperties;
  columns: ColumnState[];
  assignmentStore?: AssignmentStore;
  resourceStore?: ResourceStore;
  onProgressChange?: (taskId: string, percentDone: number) => void;
  today?: Date;
  // Inline editing props
  editingTaskId?: string | null;
  editingField?: string | null;
  onStartEdit?: (taskId: string, field: string) => void;
  onSaveEdit?: (taskId: string, field: string, value: string | Date) => void;
  onCancelEdit?: () => void;
}

export const TaskRow: React.FC<TaskRowProps> = ({
  task,
  wbsValue,
  depth,
  isSelected,
  onSelect,
  onToggleExpand,
  onDoubleClick,
  style,
  columns,
  assignmentStore,
  resourceStore,
  onProgressChange,
  today,
  editingTaskId,
  editingField,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}) => {
  const isEditing = editingTaskId === task.id;

  const handleClick = () => {
    onSelect(task.id);
  };

  const handleDoubleClick = () => {
    onDoubleClick?.(task.id);
  };

  const handleNameDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStartEdit?.(task.id, 'name');
  };

  const handleDateDoubleClick = (e: React.MouseEvent, field: 'startDate' | 'endDate') => {
    e.stopPropagation();
    onStartEdit?.(task.id, field);
  };

  const baseClasses = 'task-row flex items-center border-b border-[var(--gantt-grid-line)] cursor-pointer transition-colors duration-150';
  const stateClasses = isSelected
    ? 'bg-[var(--color-primary)] text-[var(--color-text-inverted)]'
    : 'hover:bg-[var(--color-surface-hover)]';

  // Render cell content based on column id
  const renderCell = (column: ColumnState) => {
    switch (column.id) {
      case 'wbs':
        return <span className="text-sm text-gray-500">{wbsValue}</span>;
      case 'name':
        if (isEditing && editingField === 'name') {
          return (
            <InlineNameEditor
              initialValue={task.name}
              onSave={(value) => onSaveEdit?.(task.id, 'name', value)}
              onCancel={() => onCancelEdit?.()}
            />
          );
        }
        return (
          <div onDoubleClick={handleNameDoubleClick} className="flex-1 min-w-0">
            <TreeCell
              task={task}
              wbsValue={wbsValue}
              depth={depth}
              onToggleExpand={onToggleExpand}
              showWbs={!columns.find(c => c.id === 'wbs' && c.visible)}
            />
          </div>
        );
      case 'startDate':
        if (isEditing && editingField === 'startDate') {
          return (
            <InlineDateEditor
              initialValue={task.startDate}
              onSave={(value) => onSaveEdit?.(task.id, 'startDate', value)}
              onCancel={() => onCancelEdit?.()}
            />
          );
        }
        return (
          <div onDoubleClick={(e) => handleDateDoubleClick(e, 'startDate')} className="w-full">
            <DateCell date={task.startDate} />
          </div>
        );
      case 'endDate':
        if (isEditing && editingField === 'endDate') {
          return (
            <InlineDateEditor
              initialValue={task.endDate}
              onSave={(value) => onSaveEdit?.(task.id, 'endDate', value)}
              onCancel={() => onCancelEdit?.()}
            />
          );
        }
        return (
          <div onDoubleClick={(e) => handleDateDoubleClick(e, 'endDate')} className="w-full">
            <DateCell date={task.endDate} />
          </div>
        );
      case 'duration':
        return <DurationCell duration={task.duration} unit={task.durationUnit} />;
      case 'progress':
        return (
          <ProgressCell
            task={task}
            onProgressChange={onProgressChange}
            editable={task.isLeaf}
          />
        );
      case 'status':
        return <StatusCell task={task} today={today} />;
      case 'resources':
        if (assignmentStore && resourceStore) {
          return (
            <ResourceCell
              taskId={task.id}
              assignmentStore={assignmentStore}
              resourceStore={resourceStore}
            />
          );
        }
        return null;
      default:
        return null;
    }
  };

  // Get visible columns
  const visibleColumns = columns.filter(c => c.visible);

  // Check if both wbs and name are visible - if so, combine them
  const wbsColumn = visibleColumns.find(c => c.id === 'wbs');
  const nameColumn = visibleColumns.find(c => c.id === 'name');
  const combineWbsAndName = wbsColumn && nameColumn;

  // Build columns to render
  const columnsToRender = combineWbsAndName
    ? visibleColumns.filter(c => c.id !== 'wbs') // Skip standalone wbs when combined
    : visibleColumns;

  return (
    <div
      className={`${baseClasses} ${stateClasses}`}
      style={style}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      role="row"
      aria-selected={isSelected}
      tabIndex={0}
      data-testid={`task-row-${task.id}`}
    >
      {columnsToRender.map(column => {
        // If this is the name column and we're combining, add wbs width
        const width = (column.id === 'name' && combineWbsAndName && wbsColumn)
          ? column.width + wbsColumn.width
          : column.width;
        const minWidth = (column.id === 'name' && combineWbsAndName && wbsColumn)
          ? column.minWidth + wbsColumn.minWidth
          : column.minWidth;

        return (
          <div
            key={column.id}
            className={`px-2 overflow-hidden flex items-center ${
              column.align === 'center' ? 'justify-center' :
              column.align === 'right' ? 'justify-end' : 'justify-start'
            }`}
            style={{ width, minWidth }}
          >
            {column.id === 'name' && combineWbsAndName ? (
              isEditing && editingField === 'name' ? (
                <InlineNameEditor
                  initialValue={task.name}
                  onSave={(value) => onSaveEdit?.(task.id, 'name', value)}
                  onCancel={() => onCancelEdit?.()}
                />
              ) : (
                <div onDoubleClick={handleNameDoubleClick} className="flex-1 min-w-0">
                  <TreeCell
                    task={task}
                    wbsValue={wbsValue}
                    depth={depth}
                    onToggleExpand={onToggleExpand}
                    showWbs={true}
                  />
                </div>
              )
            ) : (
              renderCell(column)
            )}
          </div>
        );
      })}
    </div>
  );
};
