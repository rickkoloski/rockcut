import React, { forwardRef } from 'react';

export interface DividerProps {
  onMouseDown: (e: React.MouseEvent) => void;
  isDragging: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  className?: string;
}

export const Divider = forwardRef<HTMLDivElement, DividerProps>(
  function Divider({ onMouseDown, isDragging, onKeyDown, className = '' }, ref) {
    return (
      <div
        ref={ref}
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        onMouseDown={onMouseDown}
        onKeyDown={onKeyDown}
        className={`
          w-1 cursor-col-resize flex-shrink-0
          bg-[var(--color-border)]
          hover:bg-[var(--color-primary)]
          focus:outline-none focus:bg-[var(--color-primary)]
          transition-colors duration-150
          ${isDragging ? 'bg-[var(--color-primary)]' : ''}
          ${className}
        `}
        data-testid="split-pane-divider"
      />
    );
  }
);
