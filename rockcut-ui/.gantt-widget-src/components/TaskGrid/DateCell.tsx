import React from 'react';
import { formatDateCompact, formatDateFull } from '../../utils/dateUtils';
import { Tooltip } from '../common';

interface DateCellProps {
  date: Date | null;
}

export const DateCell: React.FC<DateCellProps> = ({ date }) => {
  if (!date) {
    return <span className="text-[var(--color-text-muted)]">—</span>;
  }

  const compactDate = formatDateCompact(date);
  const fullDate = formatDateFull(date);

  // Only show tooltip if compact and full are different
  const needsTooltip = compactDate !== fullDate;

  return (
    <Tooltip content={fullDate} disabled={!needsTooltip}>
      <span className="text-sm whitespace-nowrap">{compactDate}</span>
    </Tooltip>
  );
};
