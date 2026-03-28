import type { TaskModel } from '../models';
import { differenceInDays } from './dateUtils';
import { MIN_PIXELS_PER_DAY, MAX_PIXELS_PER_DAY } from '../components/ZoomControls/types';

/**
 * Calculate pixelsPerDay to fit all tasks on screen
 */
export function calculateFitToScreen(
  tasks: TaskModel[],
  viewportWidth: number,
  padding: number = 80
): number {
  const dates = tasks
    .flatMap((t) => [t.startDate, t.endDate])
    .filter((d): d is Date => d !== null);

  if (dates.length === 0) {
    return 40; // Default
  }

  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
  const totalDays = differenceInDays(maxDate, minDate) + 1;

  if (totalDays <= 0) {
    return 40;
  }

  const availableWidth = viewportWidth - padding;
  const calculated = availableWidth / totalDays;

  return Math.max(MIN_PIXELS_PER_DAY, Math.min(MAX_PIXELS_PER_DAY, calculated));
}

/**
 * Calculate new scroll position after zoom to maintain center
 */
export function calculateZoomScrollPosition(
  currentScrollLeft: number,
  viewportWidth: number,
  oldPixelsPerDay: number,
  newPixelsPerDay: number
): number {
  // Find the center position in the old coordinate system
  const centerX = currentScrollLeft + viewportWidth / 2;

  // Convert to "days from start"
  const centerDays = centerX / oldPixelsPerDay;

  // Convert back to pixels in the new coordinate system
  const newCenterX = centerDays * newPixelsPerDay;

  // Calculate new scroll position to keep same center
  return Math.max(0, newCenterX - viewportWidth / 2);
}

/**
 * Calculate new scroll position after zoom at a specific point (e.g., mouse position)
 */
export function calculateZoomAtPoint(
  currentScrollLeft: number,
  pointX: number, // X position relative to viewport
  oldPixelsPerDay: number,
  newPixelsPerDay: number
): number {
  // Convert point to absolute X
  const absoluteX = currentScrollLeft + pointX;

  // Convert to days
  const days = absoluteX / oldPixelsPerDay;

  // Convert back to new pixels
  const newAbsoluteX = days * newPixelsPerDay;

  // Keep the same point under the cursor
  return Math.max(0, newAbsoluteX - pointX);
}
