import { ConstraintType } from '../../models/types';
import { isFixedConstraint } from '../../scheduling';

export interface ConstraintMarkerProps {
  x: number;
  height: number;
  constraintType: ConstraintType;
  isViolated?: boolean;
  className?: string;
}

export function ConstraintMarker({
  x,
  height,
  constraintType,
  isViolated = false,
  className = '',
}: ConstraintMarkerProps) {
  const isFixed = isFixedConstraint(constraintType);

  // Color based on state
  const color = isViolated
    ? 'var(--color-danger)'
    : isFixed
    ? 'var(--color-warning)'
    : 'var(--color-primary)';

  // Dashed for flexible constraints, solid for fixed
  const strokeDasharray = isFixed ? 'none' : '4,4';

  return (
    <line
      x1={x}
      y1={0}
      x2={x}
      y2={height}
      stroke={color}
      strokeWidth={2}
      strokeDasharray={strokeDasharray}
      className={`pointer-events-none ${className}`}
      data-testid="constraint-marker"
      data-constraint-type={constraintType}
      data-is-violated={isViolated}
    />
  );
}
