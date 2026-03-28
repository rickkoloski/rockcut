/**
 * Calculate the difference in days between two dates
 */
export function differenceInDays(date1: Date, date2: Date): number {
  const d1 = startOfDay(date1);
  const d2 = startOfDay(date2);
  const diffTime = d1.getTime() - d2.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Get start of day (midnight local time)
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Check if date is a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Get all days in a date range (inclusive)
 */
export function eachDayOfInterval(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  let current = startOfDay(start);
  const endDay = startOfDay(end);

  while (current <= endDay) {
    days.push(new Date(current));
    current = addDays(current, 1);
  }

  return days;
}

/**
 * Format date for display
 */
export function formatDate(date: Date, format: 'month-year' | 'day' | 'short'): string {
  switch (format) {
    case 'month-year':
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    case 'day':
      return date.getDate().toString();
    case 'short':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    default:
      return date.toLocaleDateString();
  }
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Format date for full display (e.g., "Jan 15, 2026")
 */
export function formatDateFull(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Format short date without year (e.g., "Jan 15")
 */
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Get the start of a month
 */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Get the end of a month
 */
export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/**
 * Get all months in a date range
 */
export function eachMonthOfInterval(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  let current = startOfMonth(start);
  const endMonth = startOfMonth(end);

  while (current <= endMonth) {
    months.push(new Date(current));
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }

  return months;
}

/**
 * Format date for HTML input[type="date"] (YYYY-MM-DD format)
 */
export function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format date in compact form for grid display.
 * Same year as reference: "Jan 15"
 * Different year: "Jan 15, 2026"
 */
export function formatDateCompact(date: Date, referenceYear?: number): string {
  const year = date.getFullYear();
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();

  const currentYear = referenceYear ?? new Date().getFullYear();

  if (year === currentYear) {
    return `${month} ${day}`;
  }
  return `${month} ${day}, ${year}`;
}
