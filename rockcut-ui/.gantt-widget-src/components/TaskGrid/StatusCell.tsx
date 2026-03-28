import React from 'react';
import type { TaskModel } from '../../models/TaskModel';
import { StatusBadge } from './StatusBadge';
import { getTaskStatus } from '../../utils/progressUtils';

export interface StatusCellProps {
  task: TaskModel;
  today?: Date;
  showLabel?: boolean;
}

export function StatusCell({
  task,
  today = new Date(),
  showLabel = true,
}: StatusCellProps) {
  const status = getTaskStatus(task, today);

  return (
    <div className="status-cell" data-testid={`status-cell-${task.id}`}>
      <StatusBadge status={status} showLabel={showLabel} />
    </div>
  );
}
