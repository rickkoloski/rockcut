import type { TaskModel } from '../models/TaskModel';
import { TaskStatus } from '../models/types';
import type { TaskStore } from '../stores/TaskStore';

/**
 * Determine task status based on progress and dates.
 */
export function getTaskStatus(task: TaskModel, today: Date = new Date()): TaskStatus {
  const percentDone = task.percentDone;
  const todayNorm = new Date(today);
  todayNorm.setHours(0, 0, 0, 0);

  const endDate = new Date(task.endDate!);
  endDate.setHours(0, 0, 0, 0);

  const startDate = new Date(task.startDate!);
  startDate.setHours(0, 0, 0, 0);

  // 100% complete
  if (percentDone >= 100) {
    return TaskStatus.Complete;
  }

  // Has some progress
  if (percentDone > 0) {
    // Check if overdue (end date passed but not complete)
    if (endDate < todayNorm) {
      return TaskStatus.Overdue;
    }
    return TaskStatus.InProgress;
  }

  // 0% complete
  // Check if overdue (should have started by now)
  if (startDate < todayNorm) {
    return TaskStatus.Overdue;
  }

  return TaskStatus.NotStarted;
}

/**
 * Calculate summary task progress from children (weighted by duration).
 */
export function calculateSummaryProgress(
  summaryTask: TaskModel,
  taskStore: TaskStore
): number {
  const children = taskStore.getChildren(summaryTask.id);

  if (children.length === 0) {
    return summaryTask.percentDone;
  }

  let totalWeight = 0;
  let weightedProgress = 0;

  for (const child of children) {
    const weight = child.duration || 1;
    const progress = child.isLeaf
      ? child.percentDone
      : calculateSummaryProgress(child, taskStore);

    totalWeight += weight;
    weightedProgress += weight * progress;
  }

  return totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;
}

/**
 * Update summary progress for all ancestors of a task.
 */
export function updateSummaryProgress(taskStore: TaskStore, task: TaskModel): void {
  let currentId = task.parentId;

  while (currentId) {
    const parent = taskStore.getById(currentId);
    if (!parent) break;

    // Only update non-leaf tasks
    if (!parent.isLeaf) {
      const newProgress = calculateSummaryProgress(parent, taskStore);
      if (parent.percentDone !== newProgress) {
        taskStore.update(parent.id, { percentDone: newProgress });
      }
    }

    currentId = parent.parentId;
  }
}

/**
 * Get status configuration for display.
 */
export interface StatusConfig {
  label: string;
  colorClass: string;
  bgColorClass: string;
}

export const STATUS_CONFIG: Record<TaskStatus, StatusConfig> = {
  [TaskStatus.NotStarted]: {
    label: 'Not Started',
    colorClass: 'text-gray-500',
    bgColorClass: 'bg-gray-400',
  },
  [TaskStatus.InProgress]: {
    label: 'In Progress',
    colorClass: 'text-blue-600',
    bgColorClass: 'bg-blue-500',
  },
  [TaskStatus.Complete]: {
    label: 'Complete',
    colorClass: 'text-green-600',
    bgColorClass: 'bg-green-500',
  },
  [TaskStatus.Overdue]: {
    label: 'Overdue',
    colorClass: 'text-red-600',
    bgColorClass: 'bg-red-500',
  },
};

/**
 * Get status config for a task.
 */
export function getStatusConfig(task: TaskModel, today?: Date): StatusConfig {
  const status = getTaskStatus(task, today);
  return STATUS_CONFIG[status];
}
