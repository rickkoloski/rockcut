export interface CreatingDependencyState {
  fromTaskId: string;
  fromPosition: 'start' | 'end';
  fromPoint: { x: number; y: number };
  currentPoint: { x: number; y: number };
  targetTaskId?: string;
  targetPosition?: 'start' | 'end';
}

export interface CreatingDependencyLineProps {
  state: CreatingDependencyState;
}

export function CreatingDependencyLine({ state }: CreatingDependencyLineProps) {
  const { fromPoint, currentPoint, targetTaskId } = state;

  // Simple straight line while creating
  const path = `M ${fromPoint.x} ${fromPoint.y} L ${currentPoint.x} ${currentPoint.y}`;

  const color = targetTaskId
    ? 'var(--gantt-dependency-creating-color, #10b981)'
    : 'var(--gantt-dependency-fs-color, #6b7280)';

  return (
    <g className="creating-dependency-line" data-testid="creating-dependency-line">
      <path
        d={path}
        stroke={color}
        strokeWidth={2}
        strokeDasharray="5,5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Endpoint indicator */}
      <circle
        cx={currentPoint.x}
        cy={currentPoint.y}
        r={4}
        fill={color}
      />
    </g>
  );
}
