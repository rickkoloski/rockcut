export interface TimeAxisLabelConfig {
  showDayNumbers: boolean;
  showWeekNumbers: boolean;
  dayLabelInterval: number; // 0 = hide, 1 = every day, 7 = every week
  showMonthRow: boolean;
}

/**
 * Get time axis label configuration based on zoom level (pixels per day).
 * Adapts the displayed labels to prevent crowding at different zoom levels.
 */
export function getTimeAxisConfig(pixelsPerDay: number): TimeAxisLabelConfig {
  // At very zoomed out levels, hide day numbers
  if (pixelsPerDay < 5) {
    // Year/Quarter view - hide days, show months only
    return {
      showDayNumbers: false,
      showWeekNumbers: false,
      dayLabelInterval: 0,
      showMonthRow: true,
    };
  }

  if (pixelsPerDay < 15) {
    // Month view - show week numbers, hide individual days
    return {
      showDayNumbers: false,
      showWeekNumbers: true,
      dayLabelInterval: 0,
      showMonthRow: true,
    };
  }

  if (pixelsPerDay < 25) {
    // Week view - show every 7th day
    return {
      showDayNumbers: true,
      showWeekNumbers: false,
      dayLabelInterval: 7,
      showMonthRow: true,
    };
  }

  // Day view - show all days
  return {
    showDayNumbers: true,
    showWeekNumbers: false,
    dayLabelInterval: 1,
    showMonthRow: true,
  };
}

/**
 * Get week number for a given date (ISO week number).
 */
export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export interface WeekInfo {
  weekNumber: number;
  startDate: Date;
  daysInView: number;
}

/**
 * Get weeks in a date range for week number display.
 */
export function getWeeksInRange(startDate: Date, endDate: Date): WeekInfo[] {
  const weeks: WeekInfo[] = [];
  const current = new Date(startDate);

  // Move to start of week (Monday)
  const dayOfWeek = current.getDay() || 7;
  current.setDate(current.getDate() - dayOfWeek + 1);

  while (current <= endDate) {
    const weekStart = new Date(current);
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Calculate days visible in this week
    const visibleStart = weekStart < startDate ? startDate : weekStart;
    const visibleEnd = weekEnd > endDate ? endDate : weekEnd;
    const daysInView = Math.round((visibleEnd.getTime() - visibleStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    if (daysInView > 0) {
      weeks.push({
        weekNumber: getWeekNumber(current),
        startDate: weekStart,
        daysInView,
      });
    }

    current.setDate(current.getDate() + 7);
  }

  return weeks;
}
