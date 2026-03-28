import { addDays, differenceInDays } from '../../utils/dateUtils';
import type { TaskModel } from '../../models';

export type DragType = 'move' | 'resize-start' | 'resize-end';

export interface DraggedDates {
  startDate: Date;
  endDate: Date;
  duration: number;
}

/**
 * Calculate new dates based on drag delta
 */
export function calculateDraggedDates(
  task: TaskModel,
  deltaX: number,
  dragType: DragType,
  pixelsPerDay: number
): DraggedDates | null {
  if (!task.startDate || !task.endDate) return null;

  const deltaDays = Math.round(deltaX / pixelsPerDay);

  switch (dragType) {
    case 'move': {
      return {
        startDate: addDays(task.startDate, deltaDays),
        endDate: addDays(task.endDate, deltaDays),
        duration: task.duration,
      };
    }

    case 'resize-start': {
      const newStart = addDays(task.startDate, deltaDays);
      const newDuration = differenceInDays(task.endDate, newStart);

      // Enforce minimum 1 day
      if (newDuration < 1) {
        return {
          startDate: addDays(task.endDate, -1),
          endDate: task.endDate,
          duration: 1,
        };
      }

      return {
        startDate: newStart,
        endDate: task.endDate,
        duration: newDuration,
      };
    }

    case 'resize-end': {
      const newEnd = addDays(task.endDate, deltaDays);
      const newDuration = differenceInDays(newEnd, task.startDate);

      // Enforce minimum 1 day
      if (newDuration < 1) {
        return {
          startDate: task.startDate,
          endDate: addDays(task.startDate, 1),
          duration: 1,
        };
      }

      return {
        startDate: task.startDate,
        endDate: newEnd,
        duration: newDuration,
      };
    }
  }
}

/**
 * Snap delta X to day boundary
 */
export function snapToDay(deltaX: number, pixelsPerDay: number): number {
  return Math.round(deltaX / pixelsPerDay) * pixelsPerDay;
}

/**
 * Determine drag type based on mouse position within bar
 */
export function getDragType(
  mouseX: number,
  barX: number,
  barWidth: number,
  edgeWidth: number = 8
): DragType {
  const relativeX = mouseX - barX;

  if (relativeX <= edgeWidth) {
    return 'resize-start';
  }

  if (relativeX >= barWidth - edgeWidth) {
    return 'resize-end';
  }

  return 'move';
}

/**
 * Get cursor style for drag type
 */
export function getCursorForDragType(dragType: DragType | null): string {
  switch (dragType) {
    case 'resize-start':
    case 'resize-end':
      return 'ew-resize';
    case 'move':
      return 'grab';
    default:
      return 'pointer';
  }
}
