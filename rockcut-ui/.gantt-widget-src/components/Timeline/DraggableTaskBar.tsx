import React, { useCallback, useState, useMemo } from 'react';
import type { TaskModel, TaskBaseline } from '../../models';
import { type DragType, getDragType, getCursorForDragType } from './dragUtils';
import { BaselineBar } from './BaselineBar';
import type { TimelineConfig } from './types';

interface DraggableTaskBarProps {
  task: TaskModel;
  x: number;
  y: number;
  width: number;
  height: number;
  isSelected: boolean;
  isSummary: boolean;
  isCritical?: boolean;
  isDragging: boolean;
  previewPosition: { x: number; width: number } | null;
  onClick: (taskId: string) => void;
  onDoubleClick?: (taskId: string) => void;
  onDragStart: (clientX: number, taskId: string, dragType: DragType, task: TaskModel) => void;
  onDependencyDragStart?: (taskId: string, position: 'start' | 'end', x: number, y: number) => void;
  baseline?: TaskBaseline;
  config?: TimelineConfig;
  rowHeight?: number;
  onProgressChange?: (taskId: string, percentDone: number) => void;
  pixelsPerDay?: number;
}

export const DraggableTaskBar: React.FC<DraggableTaskBarProps> = ({
  task,
  x,
  y,
  width,
  height,
  isSelected,
  isSummary,
  isCritical = false,
  isDragging,
  previewPosition,
  onClick,
  onDoubleClick,
  onDragStart,
  onDependencyDragStart,
  baseline,
  config,
  rowHeight,
  onProgressChange,
  pixelsPerDay,
}) => {
  const [hoverDragType, setHoverDragType] = useState<DragType | null>(null);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [progressDragStartX, setProgressDragStartX] = useState(0);
  const [progressDragStartPercent, setProgressDragStartPercent] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  // Determine if draggable
  const isDraggable = useMemo(() => {
    // Summary tasks are not draggable (dates from children)
    if (isSummary) return false;
    // Tasks without start date can't be dragged
    if (!task.startDate) return false;
    // Regular tasks need end date, milestones don't (they only have startDate)
    if (!task.isMilestone && !task.endDate) return false;
    return true;
  }, [isSummary, task.startDate, task.endDate, task.isMilestone]);

  // Milestones can only be moved, not resized
  const isMilestone = task.isMilestone;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDraggable || isDragging) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;

      if (isMilestone) {
        setHoverDragType('move');
      } else {
        setHoverDragType(getDragType(mouseX, 0, width));
      }
    },
    [isDraggable, isDragging, width, isMilestone]
  );

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!isDragging) {
      setHoverDragType(null);
    }
    setIsHovered(false);
  }, [isDragging]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isDraggable) return;
      if (e.button !== 0) return; // Left click only

      e.preventDefault();
      e.stopPropagation();

      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;

      let dragType: DragType;
      if (isMilestone) {
        dragType = 'move';
      } else {
        dragType = getDragType(mouseX, 0, width);
      }

      onDragStart(e.clientX, task.id, dragType, task);
    },
    [isDraggable, isMilestone, width, task, onDragStart]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isDragging) {
        onClick(task.id);
      }
    },
    [isDragging, task.id, onClick]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isDragging) {
        onDoubleClick?.(task.id);
      }
    },
    [isDragging, task.id, onDoubleClick]
  );

  // Progress drag handlers
  const handleProgressDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (!task.isLeaf || !onProgressChange) return;
      e.stopPropagation();
      e.preventDefault();
      setIsDraggingProgress(true);
      setProgressDragStartX(e.clientX);
      setProgressDragStartPercent(task.percentDone);

      const handleProgressDrag = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - e.clientX;
        const barWidth = (task.duration || 1) * (pixelsPerDay || 40);
        const deltaPercent = (deltaX / barWidth) * 100;
        const newPercent = Math.max(0, Math.min(100, Math.round(task.percentDone + deltaPercent)));
        onProgressChange(task.id, newPercent);
      };

      const handleProgressDragEnd = () => {
        setIsDraggingProgress(false);
        document.removeEventListener('mousemove', handleProgressDrag);
        document.removeEventListener('mouseup', handleProgressDragEnd);
      };

      document.addEventListener('mousemove', handleProgressDrag);
      document.addEventListener('mouseup', handleProgressDragEnd);
    },
    [task.isLeaf, task.percentDone, task.duration, task.id, onProgressChange, pixelsPerDay]
  );

  const cursor = isDragging || isDraggingProgress
    ? 'grabbing'
    : getCursorForDragType(hoverDragType);

  // Render positions
  const renderX = previewPosition?.x ?? x;
  const renderWidth = previewPosition?.width ?? width;

  // Milestone (diamond)
  if (isMilestone) {
    const size = height * 0.7;
    return (
      <>
        {/* Ghost during drag */}
        {isDragging && (
          <div
            data-testid={`task-bar-ghost-${task.id}`}
            className="absolute pointer-events-none"
            style={{
              left: x - size / 2,
              top: y + (height - size) / 2,
              width: size,
              height: size,
              backgroundColor: 'var(--gantt-milestone)',
              transform: 'rotate(45deg)',
              opacity: 0.4,
            }}
          />
        )}

        {/* Actual/preview position */}
        <div
          data-testid={`task-bar-${task.id}`}
          data-bar-type="milestone"
          data-draggable={isDraggable}
          data-critical={isCritical}
          className={`absolute transition-transform ${
            isSelected
              ? 'ring-2 ring-white ring-offset-1'
              : isCritical
                ? 'ring-2 ring-[var(--color-danger)]'
                : ''
          }`}
          style={{
            left: renderX - size / 2,
            top: y + (height - size) / 2,
            width: size,
            height: size,
            backgroundColor: 'var(--gantt-milestone)',
            transform: 'rotate(45deg)',
            cursor: isDraggable ? cursor : 'pointer',
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          title={task.name}
          role="button"
          tabIndex={0}
        />
      </>
    );
  }

  // Summary bar (not draggable, but still rendered)
  if (isSummary) {
    const bracketHeight = 8;
    return (
      <div
        data-testid={`task-bar-${task.id}`}
        data-bar-type="summary"
        data-draggable="false"
        className={`absolute ${isSelected ? 'ring-2 ring-white ring-offset-1' : ''}`}
        style={{
          left: x,
          top: y + height - bracketHeight - 4,
          width: Math.max(width, 8),
          height: bracketHeight,
          cursor: 'pointer',
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        title={task.name}
        role="button"
        tabIndex={0}
      >
        <div
          className="absolute inset-0 bg-[var(--gantt-summary-bar)]"
          style={{ borderRadius: 2 }}
        />
        <div
          className="absolute left-0 top-0 w-1 bg-[var(--gantt-summary-bar)]"
          style={{ height: bracketHeight + 4 }}
        />
        <div
          className="absolute right-0 top-0 w-1 bg-[var(--gantt-summary-bar)]"
          style={{ height: bracketHeight + 4 }}
        />
      </div>
    );
  }

  // Regular task bar
  return (
    <>
      {/* Ghost during drag */}
      {isDragging && (
        <div
          data-testid={`task-bar-ghost-${task.id}`}
          className="absolute rounded pointer-events-none"
          style={{
            left: x,
            top: y,
            width: Math.max(width, 8),
            height,
            backgroundColor: 'var(--gantt-task-bar)',
            opacity: 0.4,
          }}
        />
      )}

      {/* Actual/preview position */}
      <div
        data-testid={`task-bar-${task.id}`}
        data-bar-type="regular"
        data-draggable={isDraggable}
        data-critical={isCritical}
        className={`absolute rounded transition-shadow hover:shadow-md overflow-hidden ${
          isSelected
            ? 'ring-2 ring-white ring-offset-1'
            : isCritical
              ? 'ring-2 ring-[var(--color-danger)]'
              : ''
        }`}
        style={{
          left: renderX,
          top: y,
          width: Math.max(renderWidth, 8),
          height,
          backgroundColor: 'var(--gantt-task-bar)',
          cursor: isDraggable ? cursor : 'pointer',
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        title={task.name}
        role="button"
        tabIndex={0}
      >
        {/* Progress fill */}
        <div
          className="task-bar-progress absolute inset-y-0 left-0"
          style={{
            width: `${task.percentDone}%`,
            backgroundColor: 'var(--gantt-progress-color, rgba(0, 0, 0, 0.15))',
          }}
          data-testid={`progress-fill-${task.id}`}
        />

        {/* Task name (if bar is wide enough) */}
        {renderWidth > 60 && (
          <span className="absolute inset-0 flex items-center px-2 text-xs text-white truncate pointer-events-none z-10">
            {task.name}
          </span>
        )}

        {/* Progress handle (only for leaf tasks with progress change handler) */}
        {task.isLeaf && onProgressChange && (
          <div
            className="progress-handle absolute top-0 h-full w-2 cursor-ew-resize hover:bg-white/30 z-20"
            style={{ left: `${task.percentDone}%`, transform: 'translateX(-50%)' }}
            onMouseDown={handleProgressDragStart}
            data-testid={`progress-handle-${task.id}`}
          >
            <div className="w-0.5 h-full bg-white/50 mx-auto" />
          </div>
        )}
      </div>

      {/* Baseline bar (rendered below task bar) */}
      {baseline && config && rowHeight && (
        <BaselineBar
          baseline={baseline}
          config={config}
          rowY={y}
          rowHeight={rowHeight}
        />
      )}

      {/* Dependency connectors (shown on hover or selection) */}
      {onDependencyDragStart && (isHovered || isSelected) && !isDragging && (
        <svg
          className="absolute pointer-events-none overflow-visible"
          style={{
            left: renderX,
            top: y,
            width: Math.max(renderWidth, 8),
            height,
            zIndex: 10,
          }}
        >
          {/* Start connector */}
          <circle
            cx={0}
            cy={height / 2}
            r={6}
            className="fill-white stroke-gray-400 stroke-2 cursor-crosshair hover:fill-blue-100 hover:stroke-blue-500 transition-colors"
            style={{ pointerEvents: 'auto' }}
            onMouseEnter={handleMouseEnter}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onDependencyDragStart(task.id, 'start', renderX, y + height / 2);
            }}
            data-testid={`dependency-connector-${task.id}-start`}
          />
          {/* End connector */}
          <circle
            cx={Math.max(renderWidth, 8)}
            cy={height / 2}
            r={6}
            className="fill-white stroke-gray-400 stroke-2 cursor-crosshair hover:fill-blue-100 hover:stroke-blue-500 transition-colors"
            style={{ pointerEvents: 'auto' }}
            onMouseEnter={handleMouseEnter}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onDependencyDragStart(task.id, 'end', renderX + Math.max(renderWidth, 8), y + height / 2);
            }}
            data-testid={`dependency-connector-${task.id}-end`}
          />
        </svg>
      )}
    </>
  );
};
