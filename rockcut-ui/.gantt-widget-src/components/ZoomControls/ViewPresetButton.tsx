import React from 'react';
import type { ViewPreset } from './types';

interface ViewPresetButtonProps {
  preset: ViewPreset;
  isActive: boolean;
  onClick: () => void;
}

export const ViewPresetButton: React.FC<ViewPresetButtonProps> = ({
  preset,
  isActive,
  onClick,
}) => {
  const baseClasses = 'px-2 py-1 text-xs font-medium rounded transition-colors';
  const activeClasses = isActive
    ? 'bg-[var(--color-primary)] text-[var(--color-text-inverted)]'
    : 'bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]';

  return (
    <button
      onClick={onClick}
      className={`${baseClasses} ${activeClasses}`}
      aria-pressed={isActive}
      data-testid={`preset-${preset.id}`}
    >
      {preset.name}
    </button>
  );
};
