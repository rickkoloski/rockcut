import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type { TaskStore, DependencyStore, BaselineStore } from '../../stores';
import type { TaskModel, DependencyModel, CalendarModel, DependencyType } from '../../models';
import type { SchedulingEngine } from '../../scheduling';
import { TimeAxis } from './TimeAxis';
import { GridLines } from './GridLines';
import { TodayLine } from './TodayLine';
import { DraggableTaskBar } from './DraggableTaskBar';
import { DependencyLayer } from './DependencyLayer';
import { NonWorkingDayOverlay } from './NonWorkingDayOverlay';
import { useDragManager } from './useDragManager';
import { useDependencyCreation } from '../../hooks';
import type { DragType, DraggedDates } from './dragUtils';
import {
  type TimelineConfig,
  type TaskBarPosition,
  dateToX,
  TASK_BAR_HEIGHT,
} from './types';
import { DEFAULT_PIXELS_PER_DAY } from '../ZoomControls/types';
import { differenceInDays, addDays, startOfDay } from '../../utils/dateUtils';

interface TimelineProps {
  store: TaskStore;
  dependencyStore?: DependencyStore;
  baselineStore?: BaselineStore;
  schedulingEngine?: SchedulingEngine;
  startDate?: Date;
  endDate?: Date;
  pixelsPerDay?: number;
  rowHeight?: number;
  selectedTaskId?: string | null;
  onTaskSelect?: (taskId: string | null) => void;
  onTaskDoubleClick?: (taskId: string) => void;
  selectedDependencyId?: string | null;
  onDependencySelect?: (depId: string | null) => void;
  onDependencyContextMenu?: (dependencyId: string, x: number, y: number) => void;
  onDependencyCreate?: (fromId: string, toId: string, type: DependencyType) => void;
  useNewDependencyArrows?: boolean;
  showTodayLine?: boolean;
  showCriticalPath?: boolean;
  showBaseline?: boolean;
  calendar?: CalendarModel;
  showNonWorkingDays?: boolean;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
  enableDrag?: boolean;
  onTaskDateChange?: (taskId: string, changes: DraggedDates) => void;
  onProgressChange?: (taskId: string, percentDone: number) => void;
  className?: string;
}

interface FlatTask {
  task: TaskModel;
  rowIndex: number;
}

export const Timeline: React.FC<TimelineProps> = ({
  store,
  dependencyStore,
  baselineStore,
  schedulingEngine,
  startDate: propStartDate,
  endDate: propEndDate,
  pixelsPerDay = DEFAULT_PIXELS_PER_DAY,
  rowHeight = 36,
  selectedTaskId = null,
  onTaskSelect,
  onTaskDoubleClick,
  selectedDependencyId = null,
  onDependencySelect,
  onDependencyContextMenu,
  onDependencyCreate,
  useNewDependencyArrows = false,
  showTodayLine = true,
  showCriticalPath = false,
  showBaseline = false,
  calendar,
  showNonWorkingDays = true,
  scrollContainerRef,
  onScroll,
  enableDrag = true,
  onTaskDateChange,
  onProgressChange,
  className = '',
}) => {
  const [flatTasks, setFlatTasks] = useState<FlatTask[]>([]);
  const [dependencies, setDependencies] = useState<DependencyModel[]>([]);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(selectedTaskId);

  const currentSelectedId = onTaskSelect ? selectedTaskId : internalSelectedId;

  // Build flat list with row indices
  const buildFlatList = useCallback(() => {
    const result: FlatTask[] = [];
    let rowIndex = 0;

    const addTaskAndChildren = (task: TaskModel) => {
      result.push({ task, rowIndex });
      rowIndex++;
      if (task.expanded && task.children.length > 0) {
        task.children.forEach((child) => addTaskAndChildren(child));
      }
    };

    store.getRoots().forEach((root) => addTaskAndChildren(root));
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

  // Subscribe to dependency store changes
  useEffect(() => {
    if (!dependencyStore) {
      setDependencies([]);
      return;
    }

    const updateDeps = () => {
      setDependencies(dependencyStore.getAll());
    };

    updateDeps();
    const unsubscribe = dependencyStore.on(() => updateDeps());
    return unsubscribe;
  }, [dependencyStore]);

  // Calculate critical task IDs
  const criticalTaskIds = useMemo(() => {
    if (!showCriticalPath || !schedulingEngine) {
      return new Set<string>();
    }
    const result = schedulingEngine.analyzeCriticalPath();
    return new Set(result.criticalPath);
  }, [showCriticalPath, schedulingEngine, flatTasks]); // flatTasks triggers recalc on task changes

  // Calculate date bounds
  const { timelineStart, timelineEnd } = useMemo(() => {
    if (propStartDate && propEndDate) {
      return { timelineStart: propStartDate, timelineEnd: propEndDate };
    }

    // Auto-calculate from tasks
    const tasks = store.getAll();
    const dates = tasks
      .flatMap((t) => [t.startDate, t.endDate])
      .filter((d): d is Date => d !== null);

    if (dates.length === 0) {
      // Default to current month
      const now = new Date();
      return {
        timelineStart: new Date(now.getFullYear(), now.getMonth(), 1),
        timelineEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      };
    }

    const min = Math.min(...dates.map((d) => d.getTime()));
    const max = Math.max(...dates.map((d) => d.getTime()));

    return {
      timelineStart: addDays(new Date(min), -7),
      timelineEnd: addDays(new Date(max), 7),
    };
  }, [propStartDate, propEndDate, store]);

  const config: TimelineConfig = useMemo(
    () => ({
      pixelsPerDay,
      rowHeight,
      startDate: timelineStart,
      endDate: timelineEnd,
    }),
    [pixelsPerDay, rowHeight, timelineStart, timelineEnd]
  );

  // Calculate dimensions
  const totalDays = differenceInDays(timelineEnd, timelineStart) + 1;
  const timelineWidth = totalDays * pixelsPerDay;
  const contentHeight = flatTasks.length * rowHeight;

  // Today line position
  const today = startOfDay(new Date());
  const todayX = dateToX(today, config);
  const showToday = showTodayLine && todayX >= 0 && todayX <= timelineWidth;

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

  // Drag manager for task interactions
  const dragManager = useDragManager({
    pixelsPerDay,
    snapEnabled: true,
    onDragEnd: (taskId, newDates) => {
      // Update store
      store.update(taskId, {
        startDate: newDates.startDate,
        endDate: newDates.endDate,
        duration: newDates.duration,
      });
      // Propagate to successors via scheduling engine
      if (schedulingEngine) {
        schedulingEngine.propagateFrom(taskId);
      }
      // Recalculate parent/summary task dates
      store.recalculateSummaryDates(taskId);
      // Notify parent
      onTaskDateChange?.(taskId, newDates);
    },
  });

  // Handle drag start from task bar
  const handleDragStart = useCallback(
    (clientX: number, taskId: string, dragType: DragType, task: TaskModel) => {
      if (!enableDrag) return;
      dragManager.startDrag(clientX, taskId, dragType, task);

      // Attach document listeners immediately (not in useEffect)
      // to catch mouse events that fire before React state updates
      const handleMouseMove = (e: MouseEvent) => {
        dragManager.updateDrag(e.clientX);
      };

      const handleMouseUp = () => {
        dragManager.endDrag();
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [enableDrag, dragManager]
  );

  // Build task positions map for dependency lines
  const taskPositions = useMemo(() => {
    const positions = new Map<string, TaskBarPosition>();

    flatTasks.forEach(({ task, rowIndex }) => {
      if (!task.startDate) return;

      const barHeight = TASK_BAR_HEIGHT;
      const verticalPadding = (rowHeight - barHeight) / 2;

      const startX = dateToX(task.startDate, config);
      const endX = task.endDate
        ? dateToX(task.endDate, config)
        : startX + config.pixelsPerDay;

      positions.set(task.id, {
        taskId: task.id,
        x: startX,
        y: rowIndex * rowHeight + verticalPadding,
        width: endX - startX,
        height: barHeight,
        rowIndex,
      });
    });

    return positions;
  }, [flatTasks, config, rowHeight]);

  // Ref for dependency creation mouse tracking
  const timelineContentRef = useRef<HTMLDivElement>(null);

  // Dependency creation hook
  const {
    creating: creatingDependency,
    startCreating: startDependencyCreation,
    isCreating: isCreatingDependency,
  } = useDependencyCreation({
    dependencyStore: dependencyStore!,
    taskPositions,
    containerRef: timelineContentRef,
    scrollLeft: scrollContainerRef?.current?.scrollLeft ?? 0,
    scrollTop: scrollContainerRef?.current?.scrollTop ?? 0,
    onDependencyCreated: onDependencyCreate,
  });

  // Calculate task bar position
  const getBarPosition = (task: TaskModel, rowIndex: number) => {
    if (!task.startDate) return null;

    const barHeight = TASK_BAR_HEIGHT;
    const verticalPadding = (rowHeight - barHeight) / 2;

    const startX = dateToX(task.startDate, config);
    const endX = task.endDate
      ? dateToX(task.endDate, config)
      : startX + config.pixelsPerDay; // Default 1 day width

    return {
      x: startX,
      y: rowIndex * rowHeight + verticalPadding,
      width: endX - startX,
      height: barHeight,
    };
  };

  return (
    <div
      data-testid="timeline"
      className={`flex flex-col border border-[var(--gantt-grid-line)] bg-[var(--color-background)] overflow-hidden ${className}`}
    >
      <div ref={scrollContainerRef} className="flex-1 overflow-auto" onScroll={onScroll}>
        <div style={{ width: timelineWidth, minWidth: '100%' }}>
          <TimeAxis config={config} />

          <div
            ref={timelineContentRef}
            className="relative"
            style={{ height: contentHeight }}
            onClick={() => {
              // Clicking empty space deselects tasks and dependencies
              onTaskSelect?.(null);
              onDependencySelect?.(null);
            }}
          >
            <GridLines
              config={config}
              height={contentHeight}
              showWeekends={true}
            />

            {/* Non-working day overlay (behind task bars) */}
            {showNonWorkingDays && calendar && (
              <NonWorkingDayOverlay
                timelineStartDate={timelineStart}
                timelineEndDate={timelineEnd}
                pixelsPerDay={pixelsPerDay}
                height={contentHeight}
                calendar={calendar}
              />
            )}

            {showToday && (
              <TodayLine x={todayX} height={contentHeight} />
            )}

            {/* Dependency lines (behind task bars) */}
            {dependencyStore && (
              <DependencyLayer
                dependencies={dependencies}
                taskPositions={taskPositions}
                selectedDependencyId={selectedDependencyId}
                onDependencySelect={onDependencySelect}
                onDependencyContextMenu={onDependencyContextMenu}
                creatingDependency={creatingDependency}
                useNewArrows={useNewDependencyArrows}
                width={timelineWidth}
                height={contentHeight}
              />
            )}

            {/* Task bars (on top) */}
            {flatTasks.map(({ task, rowIndex }) => {
              const position = getBarPosition(task, rowIndex);
              if (!position) return null;

              const previewPosition = enableDrag
                ? dragManager.getPreviewPosition(task.id, position.x, position.width)
                : null;

              const taskBaseline = showBaseline && baselineStore
                ? baselineStore.getTaskBaseline(task.id)
                : undefined;

              return (
                <DraggableTaskBar
                  key={task.id}
                  task={task}
                  x={position.x}
                  y={position.y}
                  width={position.width}
                  height={position.height}
                  isSelected={task.id === currentSelectedId}
                  isSummary={task.isParent}
                  isCritical={criticalTaskIds.has(task.id)}
                  isDragging={
                    dragManager.dragState.isDragging &&
                    dragManager.dragState.taskId === task.id
                  }
                  previewPosition={previewPosition}
                  onClick={handleSelect}
                  onDoubleClick={onTaskDoubleClick}
                  onDragStart={handleDragStart}
                  onDependencyDragStart={dependencyStore ? startDependencyCreation : undefined}
                  baseline={taskBaseline}
                  config={config}
                  rowHeight={rowHeight}
                  onProgressChange={onProgressChange}
                  pixelsPerDay={pixelsPerDay}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
