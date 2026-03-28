export interface CriticalPathToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  criticalCount?: number;
  className?: string;
}

export function CriticalPathToggle({
  enabled,
  onChange,
  criticalCount,
  className = '',
}: CriticalPathToggleProps) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`
        px-3 py-1 text-sm rounded border transition-colors
        ${enabled
          ? 'bg-[var(--color-danger)] text-white border-[var(--color-danger)]'
          : 'bg-transparent text-[var(--color-text)] border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]'
        }
        ${className}
      `}
      title={enabled ? 'Hide critical path' : 'Show critical path'}
      data-testid="critical-path-toggle"
    >
      Critical Path
      {criticalCount !== undefined && enabled && (
        <span className="ml-1 opacity-80">({criticalCount})</span>
      )}
    </button>
  );
}
