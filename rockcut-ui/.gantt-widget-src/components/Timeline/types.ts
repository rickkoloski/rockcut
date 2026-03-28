import { differenceInDays, addDays } from '../../utils/dateUtils';

export const DEPENDENCY_LINE_GAP = 12; // Gap from task edge for routing

export interface Point {
  x: number;
  y: number;
}

export interface TaskBarPosition {
  taskId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rowIndex: number;
}
export const TIME_AXIS_HEIGHT = 50;
export const TIME_AXIS_TOP_ROW_HEIGHT = 25;
export const TIME_AXIS_BOTTOM_ROW_HEIGHT = 25;
export const TASK_BAR_HEIGHT = 24;
export const MIN_BAR_WIDTH = 8;

export interface TimelineConfig {
  pixelsPerDay: number;
  rowHeight: number;
  startDate: Date;
  endDate: Date;
}

/**
 * Convert date to X coordinate
 */
export function dateToX(date: Date, config: TimelineConfig): number {
  return differenceInDays(date, config.startDate) * config.pixelsPerDay;
}

/**
 * Convert X coordinate to date
 */
export function xToDate(x: number, config: TimelineConfig): Date {
  const days = Math.round(x / config.pixelsPerDay);
  return addDays(config.startDate, days);
}
