import { useState, useMemo } from 'react';
import type { DependencyModel } from '../../models';
import { DependencyType } from '../../models';
import {
  calculateDependencyPath,
  getArrowheadPoints,
  toTaskPosition,
  DEFAULT_ROUTING_CONFIG,
} from '../../utils';
import type { TaskBarPosition } from './types';

export interface DependencyArrowProps {
  dependency: DependencyModel;
  fromPosition: TaskBarPosition | undefined;
  toPosition: TaskBarPosition | undefined;
  isSelected?: boolean;
  onClick?: () => void;
  onContextMenu?: (x: number, y: number) => void;
  onHover?: (isHovered: boolean) => void;
}

const DEPENDENCY_COLORS: Record<string, string> = {
  [DependencyType.FinishToStart]: 'var(--gantt-dependency-fs-color, #6b7280)',
  [DependencyType.StartToStart]: 'var(--gantt-dependency-ss-color, #3b82f6)',
  [DependencyType.FinishToFinish]: 'var(--gantt-dependency-ff-color, #8b5cf6)',
  [DependencyType.StartToEnd]: 'var(--gantt-dependency-sf-color, #f59e0b)',
  hover: 'var(--gantt-dependency-hover-color, #1d4ed8)',
  selected: 'var(--gantt-dependency-line-selected, #3b82f6)',
};

export function DependencyArrow({
  dependency,
  fromPosition,
  toPosition,
  isSelected = false,
  onClick,
  onContextMenu,
  onHover,
}: DependencyArrowProps) {
  const [isHovered, setIsHovered] = useState(false);

  const pathResult = useMemo(() => {
    if (!fromPosition || !toPosition) return null;

    const from = toTaskPosition(fromPosition);
    const to = toTaskPosition(toPosition);

    return calculateDependencyPath(from, to, dependency.type, DEFAULT_ROUTING_CONFIG);
  }, [fromPosition, toPosition, dependency.type]);

  if (!pathResult || !fromPosition || !toPosition) return null;

  const { path, arrowPoint, arrowDirection } = pathResult;

  // Determine color: selected > hover > type color
  let color: string;
  if (isSelected) {
    color = DEPENDENCY_COLORS.selected;
  } else if (isHovered) {
    color = DEPENDENCY_COLORS.hover;
  } else {
    color = DEPENDENCY_COLORS[dependency.type];
  }

  const strokeWidth = isSelected ? 2.5 : isHovered ? 2.5 : 1.5;

  const handleMouseEnter = () => {
    setIsHovered(true);
    onHover?.(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onHover?.(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu?.(e.clientX, e.clientY);
  };

  return (
    <g
      className="dependency-arrow"
      data-dependency-id={dependency.id}
      data-testid={`dependency-arrow-${dependency.id}`}
    >
      {/* Wide invisible hit area for easier clicking */}
      <path
        d={path}
        stroke="transparent"
        strokeWidth={12}
        fill="none"
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        data-testid={`dependency-hitarea-${dependency.id}`}
      />
      {/* Visible line */}
      <path
        d={path}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        style={{ pointerEvents: 'none', transition: 'stroke-width 0.15s ease' }}
      />
      {/* Arrowhead */}
      <polygon
        points={getArrowheadPoints(arrowPoint.x, arrowPoint.y, arrowDirection)}
        fill={color}
        style={{ pointerEvents: 'none' }}
      />
    </g>
  );
}
