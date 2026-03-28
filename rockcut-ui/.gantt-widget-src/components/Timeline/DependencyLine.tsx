import React, { useMemo } from 'react';
import type { DependencyModel } from '../../models';
import { DependencyType } from '../../models';
import type { TaskBarPosition, Point } from './types';
import { DEPENDENCY_LINE_GAP } from './types';

interface DependencyLineProps {
  dependency: DependencyModel;
  fromPosition: TaskBarPosition;
  toPosition: TaskBarPosition;
  isSelected: boolean;
  onClick: (depId: string) => void;
}

/**
 * Get connection points based on dependency type
 */
export function getConnectionPoints(
  fromPos: TaskBarPosition,
  toPos: TaskBarPosition,
  depType: DependencyType
): { from: Point; to: Point } {
  const fromCenterY = fromPos.y + fromPos.height / 2;
  const toCenterY = toPos.y + toPos.height / 2;

  switch (depType) {
    case DependencyType.FinishToStart:
      return {
        from: { x: fromPos.x + fromPos.width, y: fromCenterY },
        to: { x: toPos.x, y: toCenterY },
      };
    case DependencyType.StartToStart:
      return {
        from: { x: fromPos.x, y: fromCenterY },
        to: { x: toPos.x, y: toCenterY },
      };
    case DependencyType.FinishToFinish:
      return {
        from: { x: fromPos.x + fromPos.width, y: fromCenterY },
        to: { x: toPos.x + toPos.width, y: toCenterY },
      };
    case DependencyType.StartToEnd:
      return {
        from: { x: fromPos.x, y: fromCenterY },
        to: { x: toPos.x + toPos.width, y: toCenterY },
      };
    default:
      // Default to FS
      return {
        from: { x: fromPos.x + fromPos.width, y: fromCenterY },
        to: { x: toPos.x, y: toCenterY },
      };
  }
}

/**
 * Calculate orthogonal path points for dependency line
 */
export function calculatePath(
  from: Point,
  to: Point,
  depType: DependencyType
): Point[] {
  const points: Point[] = [from];
  const gap = DEPENDENCY_LINE_GAP;

  switch (depType) {
    case DependencyType.FinishToStart: {
      // FS: Exit right, go down/up, enter left
      if (to.x > from.x + gap * 2) {
        // Simple case: target is to the right
        const midX = from.x + gap;
        points.push({ x: midX, y: from.y });
        points.push({ x: midX, y: to.y });
      } else {
        // Target is close or to the left - need to route around
        const midX = from.x + gap;
        const midY = Math.max(from.y, to.y) + 20; // Go below both
        points.push({ x: midX, y: from.y });
        points.push({ x: midX, y: midY });
        points.push({ x: to.x - gap, y: midY });
        points.push({ x: to.x - gap, y: to.y });
      }
      break;
    }

    case DependencyType.StartToStart: {
      // SS: Exit left, go down/up, enter left
      const leftX = Math.min(from.x, to.x) - gap;
      points.push({ x: leftX, y: from.y });
      points.push({ x: leftX, y: to.y });
      break;
    }

    case DependencyType.FinishToFinish: {
      // FF: Exit right, go down/up, enter right
      const rightX = Math.max(from.x, to.x) + gap;
      points.push({ x: rightX, y: from.y });
      points.push({ x: rightX, y: to.y });
      break;
    }

    case DependencyType.StartToEnd: {
      // SF: Exit left, go down/up, enter right
      const leftX = from.x - gap;
      const rightX = to.x + gap;
      points.push({ x: leftX, y: from.y });
      if (leftX < rightX) {
        const midY = (from.y + to.y) / 2;
        points.push({ x: leftX, y: midY });
        points.push({ x: rightX, y: midY });
      }
      points.push({ x: rightX, y: to.y });
      break;
    }
  }

  points.push(to);
  return points;
}

/**
 * Convert points array to SVG path string
 */
export function pointsToPath(points: Point[]): string {
  if (points.length === 0) return '';

  const pathParts = points.map((p, i) => {
    const command = i === 0 ? 'M' : 'L';
    return `${command} ${p.x} ${p.y}`;
  });

  return pathParts.join(' ');
}

export const DependencyLine: React.FC<DependencyLineProps> = ({
  dependency,
  fromPosition,
  toPosition,
  isSelected,
  onClick,
}) => {
  const { from, to } = useMemo(
    () => getConnectionPoints(fromPosition, toPosition, dependency.type),
    [fromPosition, toPosition, dependency.type]
  );

  const pathPoints = useMemo(
    () => calculatePath(from, to, dependency.type),
    [from, to, dependency.type]
  );

  const pathD = useMemo(() => pointsToPath(pathPoints), [pathPoints]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(dependency.id);
  };

  const strokeColor = isSelected
    ? 'var(--gantt-dependency-line-selected)'
    : 'var(--gantt-dependency-line)';

  const strokeWidth = isSelected ? 3 : 2;
  const markerId = isSelected ? 'arrowhead-selected' : 'arrowhead';

  return (
    <g
      className="dependency-line cursor-pointer"
      onClick={handleClick}
      data-testid={`dependency-line-${dependency.id}`}
      data-dependency-type={dependency.type}
    >
      {/* Invisible wider path for easier clicking */}
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        className="pointer-events-auto"
      />

      {/* Visible path */}
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        markerEnd={`url(#${markerId})`}
        className="transition-colors pointer-events-none"
      />
    </g>
  );
};
