import type { BaselineVariance, TaskBaseline } from '../models';
import type { TaskModel } from '../models';
import { differenceInDays } from './dateUtils';

/**
 * Calculate variance between current task and baseline.
 */
export function calculateVariance(
  task: TaskModel,
  baseline: TaskBaseline
): BaselineVariance {
  const startVariance = differenceInDays(task.startDate, baseline.startDate);
  const finishVariance = differenceInDays(task.endDate, baseline.endDate);
  const durationVariance = task.duration - baseline.duration;

  // Determine status based on finish variance
  let status: 'on-track' | 'ahead' | 'behind';
  if (finishVariance <= -1) {
    status = 'ahead';
  } else if (finishVariance >= 1) {
    status = 'behind';
  } else {
    status = 'on-track';
  }

  return {
    taskId: task.id,
    startVariance,
    finishVariance,
    durationVariance,
    status,
  };
}

/**
 * Format variance as a display string (e.g., "+3d", "-2d", "0d").
 */
export function formatVariance(days: number): string {
  const sign = days > 0 ? '+' : '';
  return `${sign}${days}d`;
}

/**
 * Get CSS color class based on variance.
 */
export function getVarianceColorClass(variance: number): string {
  if (variance < 0) {
    return 'text-green-600'; // ahead
  } else if (variance > 0) {
    return 'text-red-600'; // behind
  }
  return 'text-gray-500'; // on track
}

/**
 * Get icon character based on variance.
 */
export function getVarianceIcon(variance: number): string {
  if (variance < 0) {
    return '↑'; // ahead
  } else if (variance > 0) {
    return '↓'; // behind
  }
  return '—'; // on track
}
