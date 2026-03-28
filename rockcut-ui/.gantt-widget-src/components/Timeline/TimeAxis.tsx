import React from 'react';
import {
  eachDayOfInterval,
  eachMonthOfInterval,
  formatDate,
  endOfMonth,
  differenceInDays,
} from '../../utils/dateUtils';
import {
  type TimelineConfig,
  dateToX,
  TIME_AXIS_HEIGHT,
  TIME_AXIS_TOP_ROW_HEIGHT,
  TIME_AXIS_BOTTOM_ROW_HEIGHT,
} from './types';
import { getTimeAxisConfig, getWeeksInRange } from './timeAxisConfig';

interface TimeAxisProps {
  config: TimelineConfig;
}

export const TimeAxis: React.FC<TimeAxisProps> = ({ config }) => {
  const months = eachMonthOfInterval(config.startDate, config.endDate);
  const days = eachDayOfInterval(config.startDate, config.endDate);
  const labelConfig = getTimeAxisConfig(config.pixelsPerDay);
  const weeks = getWeeksInRange(config.startDate, config.endDate);

  return (
    <div
      data-testid="time-axis"
      className="sticky top-0 z-20 bg-[var(--color-surface)] border-b border-[var(--gantt-grid-line)]"
      style={{ height: TIME_AXIS_HEIGHT }}
    >
      {/* Top row: Months */}
      {labelConfig.showMonthRow && (
        <div
          data-testid="month-row"
          className="relative border-b border-[var(--gantt-grid-line)]"
          style={{ height: TIME_AXIS_TOP_ROW_HEIGHT }}
        >
          {months.map((month, index) => {
            const monthStart = month < config.startDate ? config.startDate : month;
            const monthEnd = endOfMonth(month);
            const actualEnd = monthEnd > config.endDate ? config.endDate : monthEnd;

            const x = dateToX(monthStart, config);
            const width = (differenceInDays(actualEnd, monthStart) + 1) * config.pixelsPerDay;

            return (
              <div
                key={index}
                data-testid="month-label"
                className="absolute top-0 flex items-center justify-center text-xs font-medium border-r border-[var(--gantt-grid-line)]"
                style={{
                  left: x,
                  width,
                  height: TIME_AXIS_TOP_ROW_HEIGHT,
                }}
              >
                {formatDate(month, 'month-year')}
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom row: Days or Weeks */}
      <div
        data-testid="day-row"
        className="relative"
        style={{ height: TIME_AXIS_BOTTOM_ROW_HEIGHT }}
      >
        {/* Week numbers when zoomed out */}
        {labelConfig.showWeekNumbers && weeks.map((week, index) => {
          const x = dateToX(
            week.startDate < config.startDate ? config.startDate : week.startDate,
            config
          );
          const width = week.daysInView * config.pixelsPerDay;

          return (
            <div
              key={`week-${index}`}
              data-testid="week-label"
              className="absolute top-0 flex items-center justify-center text-xs text-[var(--color-text-muted)] border-r border-[var(--gantt-grid-line)]"
              style={{
                left: x,
                width,
                height: TIME_AXIS_BOTTOM_ROW_HEIGHT,
              }}
            >
              W{week.weekNumber}
            </div>
          );
        })}

        {/* Day numbers when zoomed in */}
        {labelConfig.showDayNumbers && days.map((day, index) => {
          // Skip if not matching interval
          if (labelConfig.dayLabelInterval > 1 && index % labelConfig.dayLabelInterval !== 0) {
            return null;
          }

          const x = dateToX(day, config);
          const cellWidth = labelConfig.dayLabelInterval > 1
            ? config.pixelsPerDay * labelConfig.dayLabelInterval
            : config.pixelsPerDay;

          return (
            <div
              key={index}
              data-testid="day-label"
              className="absolute top-0 flex items-center justify-center text-xs text-[var(--color-text-muted)] border-r border-[var(--gantt-grid-line)]"
              style={{
                left: x,
                width: cellWidth,
                height: TIME_AXIS_BOTTOM_ROW_HEIGHT,
              }}
            >
              {formatDate(day, 'day')}
            </div>
          );
        })}
      </div>
    </div>
  );
};
