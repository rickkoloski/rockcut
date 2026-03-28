import React from 'react';
import type { TaskBaseline } from '../../models';
import { dateToX, type TimelineConfig } from './types';
import { formatDateFull } from '../../utils/dateUtils';

interface BaselineBarProps {
  baseline: TaskBaseline;
  config: TimelineConfig;
  rowY: number;
  rowHeight: number;
}

/**
 * Renders a baseline bar below the task bar.
 * The baseline bar is thinner and positioned at the bottom of the row.
 */
export const BaselineBar: React.FC<BaselineBarProps> = ({
  baseline,
  config,
  rowY,
  rowHeight,
}) => {
  const x = dateToX(baseline.startDate, config);
  const width = (baseline.duration || 1) * config.pixelsPerDay;

  // Position at bottom of row, thin bar
  const barHeight = 6;
  const y = rowY + rowHeight - barHeight - 2;

  return (
    <div
      data-testid={`baseline-bar-${baseline.taskId}`}
      className="absolute pointer-events-none"
      style={{
        left: x,
        top: y,
        width: Math.max(width, 4),
        height: barHeight,
        backgroundColor: 'var(--gantt-baseline-color)',
        borderRadius: 2,
        opacity: 0.6,
      }}
      title={`Baseline: ${formatDateFull(baseline.startDate)} - ${formatDateFull(baseline.endDate)}`}
    />
  );
};
