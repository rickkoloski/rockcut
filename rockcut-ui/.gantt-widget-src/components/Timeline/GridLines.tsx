import React from 'react';
import { eachDayOfInterval, isWeekend } from '../../utils/dateUtils';
import { type TimelineConfig, dateToX } from './types';

interface GridLinesProps {
  config: TimelineConfig;
  height: number;
  showWeekends?: boolean;
}

export const GridLines: React.FC<GridLinesProps> = ({
  config,
  height,
  showWeekends = true,
}) => {
  const days = eachDayOfInterval(config.startDate, config.endDate);

  return (
    <div data-testid="grid-lines" className="absolute inset-0 pointer-events-none">
      {days.map((day, index) => {
        const x = dateToX(day, config);
        const weekend = isWeekend(day);

        return (
          <React.Fragment key={index}>
            {/* Weekend background */}
            {showWeekends && weekend && (
              <div
                data-testid="weekend-bg"
                className="absolute top-0 bg-[var(--gantt-weekend-bg)]"
                style={{
                  left: x,
                  width: config.pixelsPerDay,
                  height,
                }}
              />
            )}
            {/* Grid line */}
            <div
              className="absolute top-0 w-px bg-[var(--gantt-grid-line)]"
              style={{
                left: x,
                height,
              }}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
};
