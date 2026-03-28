import { CalendarModel } from '../models/CalendarModel';
import { Store } from './Store';

export class CalendarStore extends Store<CalendarModel> {
  private defaultCalendarId: string;

  constructor() {
    super();

    // Create and add default calendar
    const defaultCalendar = CalendarModel.createDefault();
    this.add(defaultCalendar);
    this.defaultCalendarId = defaultCalendar.id;
  }

  /**
   * Get the default/project calendar.
   */
  getDefault(): CalendarModel {
    const calendar = this.getById(this.defaultCalendarId);
    if (!calendar) {
      // Shouldn't happen, but create a new default if missing
      const newDefault = CalendarModel.createDefault();
      this.add(newDefault);
      this.defaultCalendarId = newDefault.id;
      return newDefault;
    }
    return calendar;
  }

  /**
   * Set the default calendar by ID.
   */
  setDefault(calendarId: string): void {
    if (this.getById(calendarId)) {
      this.defaultCalendarId = calendarId;
    }
  }

  /**
   * Check if date is working day using default calendar.
   */
  isWorkingDay(date: Date): boolean {
    return this.getDefault().isWorkingDay(date);
  }

  /**
   * Add working days using default calendar.
   */
  addWorkingDays(date: Date, days: number): Date {
    return this.getDefault().addWorkingDays(date, days);
  }

  /**
   * Get working days between dates using default calendar.
   */
  getWorkingDaysBetween(startDate: Date, endDate: Date): number {
    return this.getDefault().getWorkingDaysBetween(startDate, endDate);
  }

  /**
   * Get non-working days in range using default calendar.
   */
  getNonWorkingDays(startDate: Date, endDate: Date): Date[] {
    return this.getDefault().getNonWorkingDays(startDate, endDate);
  }

  /**
   * Add holiday to default calendar.
   */
  addHoliday(date: Date, name: string): void {
    this.getDefault().addException(date, name, false);
  }

  /**
   * Remove holiday from default calendar.
   */
  removeHoliday(date: Date): void {
    this.getDefault().removeException(date);
  }
}
