import React from 'react';
import type { DurationUnit } from '../../models';

interface DurationCellProps {
  duration: number;
  unit: DurationUnit;
}

function formatDuration(duration: number, unit: DurationUnit): string {
  if (duration === 0) {
    return '—';
  }
  const unitLabel = duration === 1 ? unit : `${unit}s`;
  return `${duration} ${unitLabel}`;
}

export const DurationCell: React.FC<DurationCellProps> = ({ duration, unit }) => {
  const text = formatDuration(duration, unit);
  const isMilestone = duration === 0;

  return (
    <span className={isMilestone ? 'text-[var(--color-text-muted)]' : ''}>
      {text}
    </span>
  );
};
