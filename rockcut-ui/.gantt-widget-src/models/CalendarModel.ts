import { isSameDay, addDays } from '../utils/dateUtils';

export interface CalendarException {
  date: Date;
  name: string;
  isWorking: boolean;  // false = holiday, true = working override
}

export interface CalendarData {
  id: string;
  name: string;
  workingDays: number[];  // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  hoursPerDay: number;
  exceptions: CalendarException[];
  parentId: string | null;
}

export class CalendarModel implements CalendarData {
  id: string;
  name: string;
  workingDays: number[];
  hoursPerDay: number;
  exceptions: CalendarException[];
  parentId: string | null;

  constructor(data: CalendarData) {
    this.id = data.id;
    this.name = data.name;
    this.workingDays = data.workingDays;
    this.hoursPerDay = data.hoursPerDay;
    this.exceptions = data.exceptions;
    this.parentId = data.parentId;
  }

  /**
   * Check if a specific date is a working day.
   */
  isWorkingDay(date: Date): boolean {
    // Check exceptions first (they override normal rules)
    const exception = this.exceptions.find(e => isSameDay(e.date, date));
    if (exception) {
      return exception.isWorking;
    }

    // Check day of week
    const dayOfWeek = date.getDay(); // 0 = Sunday
    return this.workingDays.includes(dayOfWeek);
  }

  /**
   * Get the next working day on or after the given date.
   */
  getNextWorkingDay(date: Date): Date {
    let current = new Date(date);

    while (!this.isWorkingDay(current)) {
      current = addDays(current, 1);
    }

    return current;
  }

  /**
   * Get the previous working day on or before the given date.
   */
  getPreviousWorkingDay(date: Date): Date {
    let current = new Date(date);

    while (!this.isWorkingDay(current)) {
      current = addDays(current, -1);
    }

    return current;
  }

  /**
   * Add working days to a date.
   * @param date Start date
   * @param days Number of working days to add (can be negative)
   * @returns End date after adding working days
   */
  addWorkingDays(date: Date, days: number): Date {
    if (days === 0) return new Date(date);

    let current = new Date(date);
    let remaining = Math.abs(days);
    const direction = days > 0 ? 1 : -1;

    while (remaining > 0) {
      current = addDays(current, direction);

      if (this.isWorkingDay(current)) {
        remaining--;
      }
    }

    return current;
  }

  /**
   * Calculate working days between two dates.
   * Inclusive of start, exclusive of end.
   */
  getWorkingDaysBetween(startDate: Date, endDate: Date): number {
    let count = 0;
    let current = new Date(startDate);

    // Normalize to start of day
    current.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    while (current < end) {
      if (this.isWorkingDay(current)) {
        count++;
      }
      current = addDays(current, 1);
    }

    return count;
  }

  /**
   * Get all non-working days in a date range.
   */
  getNonWorkingDays(startDate: Date, endDate: Date): Date[] {
    const result: Date[] = [];
    let current = new Date(startDate);
    current.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    while (current <= end) {
      if (!this.isWorkingDay(current)) {
        result.push(new Date(current));
      }
      current = addDays(current, 1);
    }

    return result;
  }

  /**
   * Add a holiday/exception.
   */
  addException(date: Date, name: string, isWorking: boolean = false): void {
    // Remove existing exception for this date if any
    this.removeException(date);

    this.exceptions.push({
      date: new Date(date),
      name,
      isWorking,
    });
  }

  /**
   * Remove an exception by date.
   */
  removeException(date: Date): void {
    this.exceptions = this.exceptions.filter(e => !isSameDay(e.date, date));
  }

  /**
   * Get exception for a specific date.
   */
  getException(date: Date): CalendarException | undefined {
    return this.exceptions.find(e => isSameDay(e.date, date));
  }

  static create(data: Partial<CalendarData>): CalendarModel {
    const fullData: CalendarData = {
      id: data.id ?? crypto.randomUUID(),
      name: data.name ?? 'Calendar',
      workingDays: data.workingDays ?? [1, 2, 3, 4, 5], // Mon-Fri
      hoursPerDay: data.hoursPerDay ?? 8,
      exceptions: data.exceptions ?? [],
      parentId: data.parentId ?? null,
    };

    return new CalendarModel(fullData);
  }

  /**
   * Create default calendar (Mon-Fri, 8 hours/day).
   */
  static createDefault(): CalendarModel {
    return CalendarModel.create({
      id: 'default',
      name: 'Standard',
      workingDays: [1, 2, 3, 4, 5],
      hoursPerDay: 8,
      exceptions: [],
    });
  }
}
