import React, { useState } from 'react';
import type { TaskModel } from '../../models/TaskModel';

export interface ProgressCellProps {
  task: TaskModel;
  onProgressChange?: (taskId: string, percentDone: number) => void;
  editable?: boolean;
}

export function ProgressCell({
  task,
  onProgressChange,
  editable = true,
}: ProgressCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const canEdit = editable && task.isLeaf && onProgressChange;

  const handleClick = () => {
    if (canEdit) {
      setIsEditing(true);
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    onProgressChange?.(task.id, value);
  };

  const handleBlur = () => {
    setIsEditing(false);
  };

  return (
    <div
      className="progress-cell flex items-center gap-2 cursor-pointer"
      onClick={handleClick}
      data-testid={`progress-cell-${task.id}`}
    >
      {isEditing && canEdit ? (
        <input
          type="range"
          min={0}
          max={100}
          value={task.percentDone}
          onChange={handleSliderChange}
          onBlur={handleBlur}
          className="w-full h-2 cursor-pointer"
          autoFocus
          data-testid={`progress-slider-${task.id}`}
        />
      ) : (
        <>
          {/* Progress bar mini */}
          <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-200"
              style={{ width: `${task.percentDone}%` }}
            />
          </div>
          {/* Percentage text */}
          <span className="text-xs w-8 text-right text-gray-600 dark:text-gray-400">
            {task.percentDone}%
          </span>
        </>
      )}
    </div>
  );
}
