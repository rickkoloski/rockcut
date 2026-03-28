import React from 'react';
import type { TaskModel } from '../../models';

interface TaskBarProps {
  task: TaskModel;
  x: number;
  y: number;
  width: number;
  height: number;
  isSelected: boolean;
  isSummary: boolean;
  onClick: (taskId: string) => void;
  onDoubleClick?: (taskId: string) => void;
}

export const TaskBar: React.FC<TaskBarProps> = ({
  task,
  x,
  y,
  width,
  height,
  isSelected,
  isSummary,
  onClick,
  onDoubleClick,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(task.id);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDoubleClick?.(task.id);
  };

  // Milestone (diamond)
  if (task.isMilestone) {
    const size = height * 0.7;
    return (
      <div
        data-testid={`task-bar-${task.id}`}
        data-bar-type="milestone"
        className={`task-bar task-bar--milestone absolute cursor-pointer transition-all duration-150 ease-out hover:scale-110 ${
          isSelected ? 'ring-2 ring-white ring-offset-1' : ''
        }`}
        style={{
          left: x - size / 2,
          top: y + (height - size) / 2,
          width: size,
          height: size,
          backgroundColor: 'var(--gantt-milestone)',
          transform: 'rotate(45deg)',
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        title={task.name}
        role="button"
        tabIndex={0}
      />
    );
  }

  // Summary bar (bracket style)
  if (isSummary) {
    const bracketHeight = 8;
    return (
      <div
        data-testid={`task-bar-${task.id}`}
        data-bar-type="summary"
        className={`task-bar task-bar--summary absolute cursor-pointer transition-all duration-150 ease-out ${
          isSelected ? 'ring-2 ring-white ring-offset-1' : ''
        }`}
        style={{
          left: x,
          top: y + height - bracketHeight - 4,
          width: Math.max(width, 8),
          height: bracketHeight,
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        title={task.name}
        role="button"
        tabIndex={0}
      >
        {/* Main bar */}
        <div
          className="absolute inset-0 bg-[var(--gantt-summary-bar)]"
          style={{ borderRadius: 2 }}
        />
        {/* Left bracket */}
        <div
          className="absolute left-0 top-0 w-1 bg-[var(--gantt-summary-bar)] rounded-l"
          style={{ height: bracketHeight + 4 }}
        />
        {/* Right bracket */}
        <div
          className="absolute right-0 top-0 w-1 bg-[var(--gantt-summary-bar)] rounded-r"
          style={{ height: bracketHeight + 4 }}
        />
      </div>
    );
  }

  // Regular task bar
  const progressWidth = `${task.percentDone}%`;

  return (
    <div
      data-testid={`task-bar-${task.id}`}
      data-bar-type="regular"
      className={`task-bar absolute cursor-pointer rounded overflow-hidden
        transition-all duration-150 ease-out
        hover:shadow-md hover:-translate-y-px
        ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
      style={{
        left: x,
        top: y,
        width: Math.max(width, 8),
        height,
        backgroundColor: 'var(--gantt-task-bar)',
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title={`${task.name} (${task.percentDone}% complete)`}
      role="button"
      tabIndex={0}
    >
      {/* Progress fill with improved contrast */}
      <div
        className="task-bar-progress absolute inset-y-0 left-0 transition-all duration-200"
        style={{
          width: progressWidth,
          backgroundColor: 'var(--gantt-task-bar-progress)',
        }}
        data-testid={`progress-fill-${task.id}`}
      />

      {/* Task name (if bar is wide enough) */}
      {width > 60 && (
        <span
          className="relative z-10 flex items-center h-full px-2 text-xs text-white truncate"
        >
          {task.name}
        </span>
      )}
    </div>
  );
};
