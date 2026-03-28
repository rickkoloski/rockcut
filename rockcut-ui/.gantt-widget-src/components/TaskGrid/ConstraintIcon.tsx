import { ConstraintType } from '../../models/types';

export interface ConstraintIconProps {
  constraintType: ConstraintType;
  hasViolation?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const CONSTRAINT_ICONS: Record<ConstraintType, string> = {
  [ConstraintType.ASAP]: '→',
  [ConstraintType.ALAP]: '←',
  [ConstraintType.SNET]: '≥',
  [ConstraintType.SNLT]: '≤',
  [ConstraintType.FNET]: '≥',
  [ConstraintType.FNLT]: '≤',
  [ConstraintType.MSO]: '●',
  [ConstraintType.MFO]: '●',
};

const CONSTRAINT_COLORS: Record<ConstraintType, string> = {
  [ConstraintType.ASAP]: 'text-[var(--color-text-muted)]',
  [ConstraintType.ALAP]: 'text-[var(--color-text-muted)]',
  [ConstraintType.SNET]: 'text-[var(--color-primary)]',
  [ConstraintType.SNLT]: 'text-[var(--color-primary)]',
  [ConstraintType.FNET]: 'text-[var(--color-primary)]',
  [ConstraintType.FNLT]: 'text-[var(--color-primary)]',
  [ConstraintType.MSO]: 'text-[var(--color-warning)]',
  [ConstraintType.MFO]: 'text-[var(--color-warning)]',
};

export function ConstraintIcon({
  constraintType,
  hasViolation = false,
  size = 'sm',
  className = '',
}: ConstraintIconProps) {
  const icon = CONSTRAINT_ICONS[constraintType];
  const baseColor = CONSTRAINT_COLORS[constraintType];
  const color = hasViolation ? 'text-[var(--color-danger)]' : baseColor;
  const sizeClass = size === 'sm' ? 'text-xs' : 'text-sm';

  // For ASAP, don't show anything (it's the default)
  if (constraintType === ConstraintType.ASAP && !hasViolation) {
    return null;
  }

  return (
    <span
      className={`font-mono ${sizeClass} ${color} ${className}`}
      title={constraintType}
      data-testid="constraint-icon"
      data-constraint-type={constraintType}
      data-has-violation={hasViolation}
    >
      {icon}
    </span>
  );
}
