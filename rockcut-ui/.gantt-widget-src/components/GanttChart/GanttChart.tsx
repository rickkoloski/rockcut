import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { SplitPane } from './SplitPane';
import { useSyncScroll } from './useSyncScroll';
import { TaskGrid } from '../TaskGrid';
import { Timeline, DependencyContextMenu } from '../Timeline';
import { ZoomControls } from '../ZoomControls';
import { TaskEditor } from '../TaskEditor';
import {
  ZOOM_FACTOR,
  MIN_PIXELS_PER_DAY,
  MAX_PIXELS_PER_DAY,
  DEFAULT_PIXELS_PER_DAY,
} from '../ZoomControls/types';
import type { TaskStore } from '../../stores/TaskStore';
import type { DependencyStore } from '../../stores/DependencyStore';
import type { CalendarStore } from '../../stores/CalendarStore';
import type { ResourceStore } from '../../stores/ResourceStore';
import type { AssignmentStore } from '../../stores/AssignmentStore';
import type { BaselineStore } from '../../stores/BaselineStore';
import type { TaskModel, DependencyType } from '../../models';
import { SchedulingEngine } from '../../scheduling';
import { calculateFitToScreen, calculateZoomScrollPosition } from '../../utils';
import { updateSummaryProgress } from '../../utils/progressUtils';
import type { DraggedDates } from '../Timeline';
import { BaselineToggle, TaskCrudToolbar } from '../Toolbar';
import { ColumnVisibilityMenu } from '../Toolbar/ColumnVisibilityMenu';
import { ConfirmDialog } from '../common';
import { ROW_HEIGHTS, type RowHeightOption } from '../TaskGrid/types';
import { useColumnState, useColumnResize, useTaskCrud, useInlineEdit, DEFAULT_COLUMNS } from '../../hooks';
import type { ColumnState } from '../../hooks';

export interface GanttChartProps {
  taskStore: TaskStore;
  dependencyStore: DependencyStore;

  // Selection (controlled)
  selectedTaskId?: string | null;
  onTaskSelect?: (taskId: string | null) => void;
  selectedDependencyId?: string | null;
  onDependencySelect?: (depId: string | null) => void;

  // Zoom (controlled or uncontrolled)
  pixelsPerDay?: number;
  defaultPixelsPerDay?: number;
  onPixelsPerDayChange?: (ppd: number) => void;

  // Layout
  defaultLeftWidth?: number;
  minLeftWidth?: number;
  maxLeftWidth?: number;
  onLayoutChange?: (leftWidth: number) => void;

  // Drag
  enableDrag?: boolean;
  onTaskDateChange?: (taskId: string, changes: DraggedDates) => void;

  // Calendar
  calendarStore?: CalendarStore;
  showNonWorkingDays?: boolean;

  // Resources
  resourceStore?: ResourceStore;
  assignmentStore?: AssignmentStore;
  showResourceColumn?: boolean;

  // Baselines
  baselineStore?: BaselineStore;
  showBaseline?: boolean;
  defaultShowBaseline?: boolean;
  onShowBaselineChange?: (show: boolean) => void;

  // Progress tracking
  showProgressColumn?: boolean;
  showStatusColumn?: boolean;
  showTodayLine?: boolean;
  today?: Date;
  onProgressChange?: (taskId: string, percentDone: number) => void;

  // Column management
  initialColumns?: ColumnState[];
  onColumnsChange?: (columns: ColumnState[]) => void;
  showColumnMenu?: boolean;

  // Task CRUD
  showCrudToolbar?: boolean;
  onTaskAdded?: (taskId: string) => void;
  onTaskDeleted?: (taskId: string) => void;
  onTaskUpdated?: (taskId: string, field: string, value: unknown) => void;

  // Dependency callbacks
  onDependencyCreate?: (fromId: string, toId: string, type: DependencyType) => void;
  onDependencyDelete?: (dependencyId: string) => void;
  useNewDependencyArrows?: boolean;

  // Styling
  className?: string;
  height?: number | string;
  rowHeight?: RowHeightOption;
}

export function GanttChart({
  taskStore,
  dependencyStore,
  selectedTaskId,
  onTaskSelect,
  selectedDependencyId,
  onDependencySelect,
  pixelsPerDay: controlledPpd,
  defaultPixelsPerDay = DEFAULT_PIXELS_PER_DAY,
  onPixelsPerDayChange,
  defaultLeftWidth = 300,
  minLeftWidth = 150,
  maxLeftWidth = 800,
  onLayoutChange,
  enableDrag = true,
  onTaskDateChange,
  calendarStore,
  showNonWorkingDays = true,
  resourceStore,
  assignmentStore,
  showResourceColumn = true,
  baselineStore,
  showBaseline: controlledShowBaseline,
  defaultShowBaseline = false,
  onShowBaselineChange,
  showProgressColumn = false,
  showStatusColumn = false,
  showTodayLine = true,
  today,
  onProgressChange,
  initialColumns,
  onColumnsChange,
  showColumnMenu = true,
  showCrudToolbar = true,
  onTaskAdded,
  onTaskDeleted,
  onTaskUpdated,
  onDependencyCreate,
  onDependencyDelete,
  useNewDependencyArrows = false,
  className = '',
  height = 500,
  rowHeight = 'normal',
}: GanttChartProps) {
  // Calculate row height in pixels
  const rowHeightPx = ROW_HEIGHTS[rowHeight];

  // Create default columns based on props, filtering out columns that shouldn't show
  const getInitialColumns = useCallback((): ColumnState[] => {
    if (initialColumns) return initialColumns;

    return DEFAULT_COLUMNS.map(col => {
      // Hide resources column if stores not provided or showResourceColumn is false
      if (col.id === 'resources' && (!resourceStore || !assignmentStore || !showResourceColumn)) {
        return { ...col, visible: false };
      }
      // Hide progress column if not requested
      if (col.id === 'progress' && !showProgressColumn) {
        return { ...col, visible: false };
      }
      // Hide status column if not requested
      if (col.id === 'status' && !showStatusColumn) {
        return { ...col, visible: false };
      }
      return col;
    });
  }, [initialColumns, resourceStore, assignmentStore, showResourceColumn, showProgressColumn, showStatusColumn]);

  // Column state management
  const columnState = useColumnState({
    initialColumns: getInitialColumns(),
    onColumnsChange,
  });

  // Column resize management
  const columnResize = useColumnResize({
    onResize: columnState.resizeColumn,
  });

  // Task CRUD management
  const taskCrud = useTaskCrud({
    taskStore,
    onTaskAdded,
    onTaskDeleted,
    onTaskUpdated,
  });

  // Subscribe to taskStore changes to update button states (canIndent/canOutdent)
  // This counter forces a re-render when tasks change hierarchy
  const [, setStoreVersion] = useState(0);
  useEffect(() => {
    const unsubscribe = taskStore.on(() => {
      setStoreVersion(v => v + 1);
    });
    return unsubscribe;
  }, [taskStore]);

  // Inline editing management
  const inlineEdit = useInlineEdit();

  // Handle inline edit save
  const handleInlineEditSave = useCallback(
    (taskId: string, field: string, value: string | Date) => {
      if (field === 'name') {
        taskStore.update(taskId, { name: value as string });
      } else if (field === 'startDate' && value instanceof Date) {
        taskStore.update(taskId, { startDate: value });
      } else if (field === 'endDate' && value instanceof Date) {
        taskStore.update(taskId, { endDate: value });
      }
      inlineEdit.cancelEdit();
      onTaskUpdated?.(taskId, field, value);
    },
    [taskStore, inlineEdit, onTaskUpdated]
  );

  // Auto-fit column width on double-click
  const handleAutoFitColumn = useCallback((columnId: string) => {
    const column = columnState.columns.find(c => c.id === columnId);
    if (column) {
      // For now, set to a reasonable width based on column type
      const defaultWidths: Record<string, number> = {
        wbs: 60,
        name: 250,
        startDate: 100,
        endDate: 100,
        duration: 80,
        progress: 100,
        status: 110,
        resources: 150,
      };
      const targetWidth = defaultWidths[columnId] || column.minWidth + 50;
      columnState.resizeColumn(columnId, Math.max(targetWidth, column.minWidth));
    }
  }, [columnState]);

  // Zoom state (uncontrolled if pixelsPerDay not provided)
  const [internalPpd, setInternalPpd] = useState(defaultPixelsPerDay);
  const pixelsPerDay = controlledPpd ?? internalPpd;

  // Scheduling engine for dependency-aware date propagation
  const [schedulingEngine] = useState(
    () =>
      new SchedulingEngine({
        taskStore,
        dependencyStore,
        autoSchedule: true,
      })
  );

  // Critical path visibility
  const [showCriticalPath, setShowCriticalPath] = useState(false);

  // Baseline visibility state (uncontrolled if showBaseline not provided)
  const [internalShowBaseline, setInternalShowBaseline] = useState(defaultShowBaseline);
  const showBaseline = controlledShowBaseline ?? internalShowBaseline;

  const handleShowBaselineChange = useCallback(
    (show: boolean) => {
      if (controlledShowBaseline === undefined) {
        setInternalShowBaseline(show);
      }
      onShowBaselineChange?.(show);
    },
    [controlledShowBaseline, onShowBaselineChange]
  );

  const handleCaptureBaseline = useCallback(
    (name: string) => {
      if (!baselineStore) return;
      baselineStore.captureBaseline(name, taskStore);
      // Auto-enable baseline display after capture
      handleShowBaselineChange(true);
    },
    [baselineStore, taskStore, handleShowBaselineChange]
  );

  // Progress change handler - updates task and propagates to summary parents
  const handleProgressChange = useCallback(
    (taskId: string, percentDone: number) => {
      // Update task
      taskStore.update(taskId, { percentDone });

      // Update summary parents
      const task = taskStore.getById(taskId);
      if (task) {
        updateSummaryProgress(taskStore, task);
      }

      // Notify external handler
      onProgressChange?.(taskId, percentDone);
    },
    [taskStore, onProgressChange]
  );

  // Task editor state
  const [editingTask, setEditingTask] = useState<TaskModel | null>(null);

  // Handle task double-click to open editor
  const handleTaskDoubleClick = useCallback(
    (taskId: string) => {
      const task = taskStore.getById(taskId);
      if (task) {
        setEditingTask(task);
      }
    },
    [taskStore]
  );

  // Dependency deletion state
  const [pendingDeleteDependency, setPendingDeleteDependency] = useState<string | null>(null);

  // Context menu state for dependency right-click
  const [dependencyContextMenu, setDependencyContextMenu] = useState<{
    dependencyId: string;
    x: number;
    y: number;
  } | null>(null);

  // Handle dependency right-click for context menu
  const handleDependencyContextMenu = useCallback((dependencyId: string, x: number, y: number) => {
    setDependencyContextMenu({ dependencyId, x, y });
  }, []);

  // Close context menu
  const closeDependencyContextMenu = useCallback(() => {
    setDependencyContextMenu(null);
  }, []);

  // Request dependency deletion (from toolbar or context menu)
  const requestDeleteDependency = useCallback((dependencyId: string) => {
    setPendingDeleteDependency(dependencyId);
    closeDependencyContextMenu();
  }, [closeDependencyContextMenu]);

  // Confirm dependency deletion
  const confirmDeleteDependency = useCallback(() => {
    if (pendingDeleteDependency) {
      dependencyStore.remove(pendingDeleteDependency);
      onDependencyDelete?.(pendingDeleteDependency);
      onDependencySelect?.(null); // Clear selection after delete
      setPendingDeleteDependency(null);
    }
  }, [pendingDeleteDependency, dependencyStore, onDependencyDelete, onDependencySelect]);

  // Cancel dependency deletion
  const cancelDeleteDependency = useCallback(() => {
    setPendingDeleteDependency(null);
  }, []);

  // Handle delete from toolbar - works for both tasks and dependencies
  const handleToolbarDelete = useCallback(() => {
    if (selectedTaskId) {
      taskCrud.deleteTask(selectedTaskId);
    } else if (selectedDependencyId) {
      requestDeleteDependency(selectedDependencyId);
    }
  }, [selectedTaskId, selectedDependencyId, taskCrud, requestDeleteDependency]);

  // Calculate critical task count for the toggle button
  const criticalTaskCount = useMemo(() => {
    if (!showCriticalPath) return undefined;
    const result = schedulingEngine.analyzeCriticalPath();
    return result.criticalPath.length;
  }, [showCriticalPath, schedulingEngine]);

  // Get default calendar if store provided
  const calendar = calendarStore?.getDefault();

  const handlePpdChange = useCallback(
    (ppd: number) => {
      if (controlledPpd === undefined) {
        setInternalPpd(ppd);
      }
      onPixelsPerDayChange?.(ppd);
    },
    [controlledPpd, onPixelsPerDayChange]
  );

  // Scroll sync refs
  const { leftRef, rightRef, handleLeftScroll, handleRightScroll } = useSyncScroll();

  // Additional ref to track scroll position for zoom
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);

  // Combine rightRef with timelineScrollRef
  const combinedRightRef = useCallback((el: HTMLDivElement | null) => {
    (rightRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    timelineScrollRef.current = el;
  }, [rightRef]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    const newValue = Math.min(pixelsPerDay * ZOOM_FACTOR, MAX_PIXELS_PER_DAY);
    if (timelineScrollRef.current) {
      const container = timelineScrollRef.current;
      const newScroll = calculateZoomScrollPosition(
        container.scrollLeft,
        container.clientWidth,
        pixelsPerDay,
        newValue
      );
      requestAnimationFrame(() => {
        if (timelineScrollRef.current) {
          timelineScrollRef.current.scrollLeft = newScroll;
        }
      });
    }
    handlePpdChange(newValue);
  }, [pixelsPerDay, handlePpdChange]);

  const handleZoomOut = useCallback(() => {
    const newValue = Math.max(pixelsPerDay / ZOOM_FACTOR, MIN_PIXELS_PER_DAY);
    if (timelineScrollRef.current) {
      const container = timelineScrollRef.current;
      const newScroll = calculateZoomScrollPosition(
        container.scrollLeft,
        container.clientWidth,
        pixelsPerDay,
        newValue
      );
      requestAnimationFrame(() => {
        if (timelineScrollRef.current) {
          timelineScrollRef.current.scrollLeft = newScroll;
        }
      });
    }
    handlePpdChange(newValue);
  }, [pixelsPerDay, handlePpdChange]);

  const handleFitToScreen = useCallback(() => {
    const tasks = taskStore.getAll();
    const viewportWidth = timelineScrollRef.current?.clientWidth ?? 800;
    const newPpd = calculateFitToScreen(tasks, viewportWidth);
    handlePpdChange(newPpd);
    if (timelineScrollRef.current) {
      timelineScrollRef.current.scrollLeft = 0;
    }
  }, [taskStore, handlePpdChange]);

  const handleScrollToToday = useCallback(() => {
    if (!timelineScrollRef.current) return;
    const container = timelineScrollRef.current;
    const today = new Date();
    const tasks = taskStore.getAll();
    const dates = tasks
      .flatMap((t) => [t.startDate, t.endDate])
      .filter((d): d is Date => d !== null);
    if (dates.length === 0) return;

    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const daysFromStart = Math.floor((today.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) + 7;
    const todayX = daysFromStart * pixelsPerDay;
    container.scrollLeft = Math.max(0, todayX - container.clientWidth / 2);
  }, [taskStore, pixelsPerDay]);

  const handleScrollToSelected = useCallback(() => {
    if (!timelineScrollRef.current || !selectedTaskId) return;
    const task = taskStore.getById(selectedTaskId);
    if (!task?.startDate) return;

    const container = timelineScrollRef.current;
    const tasks = taskStore.getAll();
    const dates = tasks
      .flatMap((t) => [t.startDate, t.endDate])
      .filter((d): d is Date => d !== null);
    if (dates.length === 0) return;

    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const daysFromStart = Math.floor((task.startDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) + 7;
    const taskX = daysFromStart * pixelsPerDay;
    container.scrollLeft = Math.max(0, taskX - container.clientWidth / 2);
  }, [taskStore, selectedTaskId, pixelsPerDay]);

  // Selection handlers
  const handleTaskSelect = useCallback(
    (taskId: string | null) => {
      onTaskSelect?.(taskId);
      if (taskId && onDependencySelect) {
        onDependencySelect(null);
      }
    },
    [onTaskSelect, onDependencySelect]
  );

  const handleDependencySelect = useCallback(
    (depId: string | null) => {
      onDependencySelect?.(depId);
      if (depId && onTaskSelect) {
        onTaskSelect(null);
      }
    },
    [onTaskSelect, onDependencySelect]
  );

  const heightStyle = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`flex flex-col ${className}`}
      style={{ height: heightStyle }}
      data-testid="gantt-chart"
    >
      <div className="flex items-center gap-4 p-2 border-b border-[var(--color-border)] flex-shrink-0">
        {/* Column visibility menu - far left */}
        {showColumnMenu && (
          <ColumnVisibilityMenu
            columns={columnState.columns}
            onToggleColumn={columnState.toggleColumn}
          />
        )}

        <ZoomControls
          pixelsPerDay={pixelsPerDay}
          onPixelsPerDayChange={handlePpdChange}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitToScreen={handleFitToScreen}
          onScrollToToday={handleScrollToToday}
          onScrollToSelected={handleScrollToSelected}
          hasSelection={!!selectedTaskId}
          showCriticalPath={showCriticalPath}
          onShowCriticalPathChange={setShowCriticalPath}
          criticalTaskCount={criticalTaskCount}
        />

        {/* Baseline controls */}
        {baselineStore && (
          <BaselineToggle
            baselineStore={baselineStore}
            enabled={showBaseline}
            onToggle={handleShowBaselineChange}
            onCapture={handleCaptureBaseline}
          />
        )}

        {/* Task CRUD Toolbar */}
        {showCrudToolbar && (
          <TaskCrudToolbar
            selectedTaskId={selectedTaskId ?? null}
            onAddTask={() => taskCrud.addTask()}
            onAddSubtask={() => selectedTaskId && taskCrud.addSubtask(selectedTaskId)}
            onDeleteTask={handleToolbarDelete}
            onIndent={() => selectedTaskId && taskCrud.indentTask(selectedTaskId)}
            onOutdent={() => selectedTaskId && taskCrud.outdentTask(selectedTaskId)}
            canAddSubtask={!!selectedTaskId}
            canDelete={!!selectedTaskId || !!selectedDependencyId}
            canIndent={selectedTaskId ? taskCrud.canIndent(selectedTaskId) : false}
            canOutdent={selectedTaskId ? taskCrud.canOutdent(selectedTaskId) : false}
          />
        )}
      </div>

      <SplitPane
        defaultLeftWidth={defaultLeftWidth}
        minLeftWidth={minLeftWidth}
        maxLeftWidth={maxLeftWidth}
        onResize={onLayoutChange}
        className="flex-1"
      >
        <TaskGrid
          store={taskStore}
          selectedTaskId={selectedTaskId ?? null}
          onTaskSelect={handleTaskSelect}
          onTaskDoubleClick={handleTaskDoubleClick}
          scrollContainerRef={leftRef}
          onScroll={handleLeftScroll}
          assignmentStore={assignmentStore}
          resourceStore={resourceStore}
          onProgressChange={handleProgressChange}
          today={today}
          rowHeight={rowHeightPx}
          columns={columnState.columns}
          onColumnHide={columnState.hideColumn}
          onResizeStart={columnResize.handleResizeStart}
          onResizeMove={columnResize.handleResizeMove}
          onResizeEnd={columnResize.handleResizeEnd}
          isResizing={columnResize.isResizing}
          onAutoFitColumn={handleAutoFitColumn}
          editingTaskId={inlineEdit.editState?.taskId}
          editingField={inlineEdit.editState?.field}
          onStartEdit={inlineEdit.startEdit}
          onSaveEdit={handleInlineEditSave}
          onCancelEdit={inlineEdit.cancelEdit}
          className="h-full"
        />
        <Timeline
          store={taskStore}
          dependencyStore={dependencyStore}
          baselineStore={baselineStore}
          schedulingEngine={schedulingEngine}
          pixelsPerDay={pixelsPerDay}
          selectedTaskId={selectedTaskId ?? null}
          onTaskSelect={handleTaskSelect}
          onTaskDoubleClick={handleTaskDoubleClick}
          selectedDependencyId={selectedDependencyId ?? null}
          onDependencySelect={handleDependencySelect}
          onDependencyContextMenu={handleDependencyContextMenu}
          onDependencyCreate={onDependencyCreate}
          useNewDependencyArrows={useNewDependencyArrows}
          showTodayLine={showTodayLine}
          showCriticalPath={showCriticalPath}
          showBaseline={showBaseline}
          calendar={calendar}
          showNonWorkingDays={showNonWorkingDays}
          scrollContainerRef={{
            get current() {
              return rightRef.current;
            },
            set current(el) {
              combinedRightRef(el);
            },
          } as React.RefObject<HTMLDivElement | null>}
          onScroll={handleRightScroll}
          enableDrag={enableDrag}
          onTaskDateChange={onTaskDateChange}
          onProgressChange={handleProgressChange}
          rowHeight={rowHeightPx}
          className="h-full"
        />
      </SplitPane>

      {/* Task Editor Modal */}
      {editingTask && (
        <TaskEditor
          task={editingTask}
          taskStore={taskStore}
          dependencyStore={dependencyStore}
          resourceStore={resourceStore}
          assignmentStore={assignmentStore}
          isOpen={!!editingTask}
          onClose={() => setEditingTask(null)}
        />
      )}

      {/* Delete Task Confirmation Dialog */}
      {taskCrud.pendingDelete && (
        <ConfirmDialog
          isOpen={true}
          title="Delete Task"
          message={
            taskCrud.pendingDelete.descendantCount > 0
              ? `This task has ${taskCrud.pendingDelete.descendantCount} subtask${taskCrud.pendingDelete.descendantCount > 1 ? 's' : ''}. Delete task and all its subtasks?`
              : 'Are you sure you want to delete this task?'
          }
          confirmLabel="Delete"
          onConfirm={taskCrud.confirmDelete}
          onCancel={taskCrud.cancelDelete}
          variant="danger"
        />
      )}

      {/* Delete Dependency Confirmation Dialog */}
      {pendingDeleteDependency && (
        <ConfirmDialog
          isOpen={true}
          title="Delete Dependency"
          message="Are you sure you want to delete this dependency?"
          confirmLabel="Delete"
          onConfirm={confirmDeleteDependency}
          onCancel={cancelDeleteDependency}
          variant="danger"
        />
      )}

      {/* Dependency Context Menu */}
      {dependencyContextMenu && (
        <DependencyContextMenu
          x={dependencyContextMenu.x}
          y={dependencyContextMenu.y}
          onDelete={() => requestDeleteDependency(dependencyContextMenu.dependencyId)}
          onClose={closeDependencyContextMenu}
        />
      )}
    </div>
  );
}
