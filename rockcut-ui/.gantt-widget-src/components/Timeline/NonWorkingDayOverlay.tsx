import { CalendarModel } from '../../models/CalendarModel';
import { differenceInDays } from '../../utils/dateUtils';

export interface NonWorkingDayOverlayProps {
  timelineStartDate: Date;
  timelineEndDate: Date;
  pixelsPerDay: number;
  height: number;
  calendar: CalendarModel;
  className?: string;
}

export function NonWorkingDayOverlay({
  timelineStartDate,
  timelineEndDate,
  pixelsPerDay,
  height,
  calendar,
  className = '',
}: NonWorkingDayOverlayProps) {
  const nonWorkingDays = calendar.getNonWorkingDays(
    timelineStartDate,
    timelineEndDate
  );

  if (nonWorkingDays.length === 0) {
    return null;
  }

  return (
    <div
      className={`absolute inset-0 pointer-events-none ${className}`}
      data-testid="non-working-day-overlay"
    >
      {nonWorkingDays.map((date) => {
        const dayOffset = differenceInDays(date, timelineStartDate);
        const x = dayOffset * pixelsPerDay;

        // Check if it's a holiday (exception) or regular weekend
        const exception = calendar.getException(date);
        const isHoliday = exception && !exception.isWorking;

        return (
          <div
            key={date.toISOString()}
            className="absolute top-0"
            style={{
              left: x,
              width: pixelsPerDay,
              height,
              backgroundColor: isHoliday
                ? 'var(--gantt-holiday-color)'
                : 'var(--gantt-non-working-day-color)',
              opacity: 0.2,
            }}
            data-testid="non-working-day"
            data-date={date.toISOString().split('T')[0]}
            data-is-holiday={isHoliday ?? false}
          />
        );
      })}
    </div>
  );
}
