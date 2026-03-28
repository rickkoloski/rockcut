import React from 'react';
import { formatVariance, getVarianceColorClass, getVarianceIcon } from '../../utils/baselineUtils';

interface VarianceCellProps {
  variance: number; // days
  showIcon?: boolean;
}

/**
 * Displays variance (days early/late) with color and icon.
 * - Negative variance (early) shows in green with ↑
 * - Positive variance (late) shows in red with ↓
 * - Zero variance (on-track) shows in gray with —
 */
export const VarianceCell: React.FC<VarianceCellProps> = ({
  variance,
  showIcon = true,
}) => {
  const colorClass = getVarianceColorClass(variance);
  const icon = getVarianceIcon(variance);
  const formattedValue = formatVariance(variance);

  return (
    <span className={`variance-cell ${colorClass}`} data-testid="variance-cell">
      {showIcon && <span className="mr-1">{icon}</span>}
      {formattedValue}
    </span>
  );
};
