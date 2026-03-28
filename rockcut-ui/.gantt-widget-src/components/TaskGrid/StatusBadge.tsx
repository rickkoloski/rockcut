import React from 'react';
import { TaskStatus } from '../../models/types';
import { STATUS_CONFIG } from '../../utils/progressUtils';

export interface StatusBadgeProps {
  status: TaskStatus;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function StatusBadge({
  status,
  showLabel = false,
  size = 'sm',
}: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';

  return (
    <div className="status-badge flex items-center gap-1.5" data-testid={`status-badge-${status}`}>
      <div className={`rounded-full ${dotSize} ${config.bgColorClass}`} />
      {showLabel && (
        <span className={`text-xs ${config.colorClass}`}>
          {config.label}
        </span>
      )}
    </div>
  );
}
