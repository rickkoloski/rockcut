import React, { useEffect, useState, useRef, useCallback } from 'react';
import { TaskStore } from '../../stores';
import { TaskModel } from '../../models';
import { GridHeader } from './GridHeader';
import { TaskRow } from './TaskRow';
import { DEFAULT_ROW_HEIGHT, BUFFER_ROWS } from './types';
import type { ColumnState } from '../../hooks';
import type { AssignmentStore } from '../../stores/AssignmentStore';
import type { ResourceStore } from '../../stores/ResourceStore';

interface TaskGridProps {
  store: TaskStore;
  selectedTaskId?: string | null;
  onTaskSelect?: (taskId: string | null) => void;
  onTaskDoubleClick?: (taskId: string) => void;
  rowHeight?: number;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
  className?: string;
  assignmentStore?: AssignmentStore;
  resourceStore?: ResourceStore;
  onProgressChange?: (taskId: string, percentDone: number) => void;
  today?: Date;
  // Column management props
  columns: ColumnState[];
  onColumnHide: (columnId: string) => void;
  onResizeStart: (columnId: string, startX: number, startWidth: number) => void;
  onResizeMove: (currentX: number) => void;
  onResizeEnd: () => void;
  isResizing?: boolean;
  onSort?: (columnId: string, direction: 'asc' | 'desc') => void;
  onAutoFitColumn?: (columnId: string) => void;
  // Inline editing props
  editingTaskId?: string | null;
  editingField?: string | null;
  onStartEdit?: (taskId: string, field: string) => void;
  onSaveEdit?: (taskId: string, field: string, value: string | Date) => void;
  onCancelEdit?: () => void;
}

interface FlatTask {
  task: TaskModel;
  wbsValue: string;
  depth: number;
}

export const TaskGrid: React.FC<TaskGridProps> = ({
  store,
  selectedTaskId = null,
  onTaskSelect,
  onTaskDoubleClick,
  rowHeight = DEFAULT_ROW_HEIGHT,
  scrollContainerRef,
  onScroll,
  className = '',
  assignmentStore,
  resourceStore,
  onProgressChange,
  today,
  columns,
  onColumnHide,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  isResizing = false,
  onSort,
  onAutoFitColumn,
  editingTaskId,
  editingField,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}) => {
  const [flatTasks, setFlatTasks] = useState<FlatTask[]>([]);
  const [scrollTop, setScrollTop] = useState(0);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(selectedTaskId);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use controlled or uncontrolled selection
  const currentSelectedId = onTaskSelect ? selectedTaskId : internalSelectedId;

  // Calculate total width from visible columns
  const visibleColumns = columns.filter(c => c.visible);

  // Check if wbs and name columns should be combined
  const wbsColumn = visibleColumns.find(c => c.id === 'wbs');
  const nameColumn = visibleColumns.find(c => c.id === 'name');
  const combineWbsAndName = wbsColumn && nameColumn;

  // Calculate total width (combining wbs+name if both visible)
  const totalWidth = visibleColumns.reduce((sum, col) => {
    // Don't count wbs separately if it will be combined with name
    if (col.id === 'wbs' && combineWbsAndName) return sum;
    return sum + col.width;
  }, 0) + (combineWbsAndName && wbsColumn ? wbsColumn.width : 0);

  // Build flat list with depth info
  const buildFlatList = useCallback(() => {
    const result: FlatTask[] = [];

    const addTaskAndChildren = (task: TaskModel, depth: number) => {
      const wbsValue = store.getWbsValue(task.id);
      result.push({ task, wbsValue, depth });
      if (task.expanded && task.children.length > 0) {
        task.children.forEach((child) => addTaskAndChildren(child, depth + 1));
      }
    };

    store.getRoots().forEach((root) => addTaskAndChildren(root, 0));
    return result;
  }, [store]);

  // Update flat list when store changes
  useEffect(() => {
    const updateList = () => {
      setFlatTasks(buildFlatList());
    };

    updateList();
    const unsubscribe = store.on(() => updateList());
    return unsubscribe;
  }, [store, buildFlatList]);

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
    onScroll?.();
  }, [onScroll]);

  // Handle selection
  const handleSelect = useCallback(
    (taskId: string) => {
      if (onTaskSelect) {
        onTaskSelect(taskId);
      } else {
        setInternalSelectedId(taskId);
      }
    },
    [onTaskSelect]
  );

  // Handle expand/collapse
  const handleToggleExpand = useCallback(
    (taskId: string) => {
      const task = store.getById(taskId);
      if (task) {
        if (task.expanded) {
          store.collapse(taskId);
        } else {
          store.expand(taskId);
        }
      }
    },
    [store]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!currentSelectedId && flatTasks.length > 0) {
        // If nothing selected, select first
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          handleSelect(flatTasks[0].task.id);
          e.preventDefault();
          return;
        }
      }

      const currentIndex = flatTasks.findIndex(
        (ft) => ft.task.id === currentSelectedId
      );
      if (currentIndex === -1) return;

      const currentTask = flatTasks[currentIndex].task;

      switch (e.key) {
        case 'ArrowDown':
          if (currentIndex < flatTasks.length - 1) {
            handleSelect(flatTasks[currentIndex + 1].task.id);
          }
          e.preventDefault();
          break;
        case 'ArrowUp':
          if (currentIndex > 0) {
            handleSelect(flatTasks[currentIndex - 1].task.id);
          }
          e.preventDefault();
          break;
        case 'ArrowRight':
          if (currentTask.isParent && !currentTask.expanded) {
            store.expand(currentTask.id);
          }
          e.preventDefault();
          break;
        case 'ArrowLeft':
          if (currentTask.isParent && currentTask.expanded) {
            store.collapse(currentTask.id);
          }
          e.preventDefault();
          break;
        case 'Enter':
          if (currentTask.isParent) {
            handleToggleExpand(currentTask.id);
          }
          e.preventDefault();
          break;
        case 'Home':
          if (flatTasks.length > 0) {
            handleSelect(flatTasks[0].task.id);
          }
          e.preventDefault();
          break;
        case 'End':
          if (flatTasks.length > 0) {
            handleSelect(flatTasks[flatTasks.length - 1].task.id);
          }
          e.preventDefault();
          break;
      }
    },
    [currentSelectedId, flatTasks, handleSelect, handleToggleExpand, store]
  );

  // Virtual scrolling calculations
  const viewportHeight = containerRef.current?.clientHeight ?? 400;
  const totalHeight = flatTasks.length * rowHeight;

  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - BUFFER_ROWS);
  const endIndex = Math.min(
    flatTasks.length - 1,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + BUFFER_ROWS
  );

  const visibleTasks = flatTasks.slice(startIndex, endIndex + 1);

  return (
    <div
      className={`flex flex-col border border-[var(--gantt-grid-line)] bg-[var(--color-background)] ${className} ${isResizing ? 'select-none' : ''}`}
      style={{ width: totalWidth }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="treegrid"
      aria-label="Task Grid"
      data-testid="task-grid"
    >
      <GridHeader
        columns={columns}
        onColumnHide={onColumnHide}
        onResizeStart={onResizeStart}
        onResizeMove={onResizeMove}
        onResizeEnd={onResizeEnd}
        onSort={onSort}
        onAutoFit={onAutoFitColumn}
      />
      <div
        ref={(el) => {
          // Support both internal and external refs
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          if (scrollContainerRef) {
            (scrollContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          }
        }}
        className="flex-1 overflow-auto relative"
        onScroll={handleScroll}
        style={{ height: 'calc(100% - 40px)' }}
        data-testid="task-grid-body"
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          {visibleTasks.map((ft, i) => (
            <TaskRow
              key={ft.task.id}
              task={ft.task}
              wbsValue={ft.wbsValue}
              depth={ft.depth}
              isSelected={ft.task.id === currentSelectedId}
              onSelect={handleSelect}
              onToggleExpand={handleToggleExpand}
              onDoubleClick={onTaskDoubleClick}
              columns={columns}
              assignmentStore={assignmentStore}
              resourceStore={resourceStore}
              onProgressChange={onProgressChange}
              today={today}
              editingTaskId={editingTaskId}
              editingField={editingField}
              onStartEdit={onStartEdit}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              style={{
                position: 'absolute',
                top: (startIndex + i) * rowHeight,
                height: rowHeight,
                width: '100%',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
