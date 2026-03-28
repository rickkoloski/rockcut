import React, { useMemo } from 'react';
import type { DependencyModel } from '../../models';
import type { TaskBarPosition } from './types';
import { DependencyLine } from './DependencyLine';
import { DependencyArrow } from './DependencyArrow';
import { CreatingDependencyLine, type CreatingDependencyState } from './CreatingDependencyLine';

interface DependencyLayerProps {
  dependencies: DependencyModel[];
  taskPositions: Map<string, TaskBarPosition>;
  selectedDependencyId?: string | null;
  onDependencySelect?: (depId: string | null) => void;
  onDependencyContextMenu?: (dependencyId: string, x: number, y: number) => void;
  onDependencyHover?: (dependencyId: string | null) => void;
  creatingDependency?: CreatingDependencyState | null;
  useNewArrows?: boolean;
  width: number;
  height: number;
}

export const DependencyLayer: React.FC<DependencyLayerProps> = ({
  dependencies,
  taskPositions,
  selectedDependencyId = null,
  onDependencySelect,
  onDependencyContextMenu,
  onDependencyHover,
  creatingDependency,
  useNewArrows = false,
  width,
  height,
}) => {
  // Filter dependencies where both tasks have positions
  const validDependencies = useMemo(() => {
    return dependencies.filter((dep) => {
      const fromPos = taskPositions.get(dep.fromTask);
      const toPos = taskPositions.get(dep.toTask);
      return fromPos && toPos;
    });
  }, [dependencies, taskPositions]);

  const handleDependencyClick = (depId: string) => {
    if (onDependencySelect) {
      onDependencySelect(depId);
    }
  };

  const handleBackgroundClick = () => {
    if (onDependencySelect && selectedDependencyId) {
      onDependencySelect(null);
    }
  };

  // Always render if there's a creating dependency, even with no valid deps
  if (validDependencies.length === 0 && !creatingDependency) {
    return null;
  }

  return (
    <svg
      className="absolute inset-0 pointer-events-none overflow-visible"
      style={{ width, height, zIndex: 5 }}
      data-testid="dependency-layer"
      onClick={handleBackgroundClick}
    >
      <defs>
        {/* Arrow marker for normal state */}
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill="var(--gantt-dependency-line)"
          />
        </marker>

        {/* Arrow marker for selected state */}
        <marker
          id="arrowhead-selected"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill="var(--gantt-dependency-line-selected)"
          />
        </marker>

        {/* Arrow marker for hover state */}
        <marker
          id="arrowhead-hover"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill="var(--gantt-dependency-line-hover)"
          />
        </marker>
      </defs>

      {validDependencies.map((dep) => {
        const fromPos = taskPositions.get(dep.fromTask)!;
        const toPos = taskPositions.get(dep.toTask)!;

        if (useNewArrows) {
          return (
            <DependencyArrow
              key={dep.id}
              dependency={dep}
              fromPosition={fromPos}
              toPosition={toPos}
              isSelected={dep.id === selectedDependencyId}
              onClick={() => handleDependencyClick(dep.id)}
              onContextMenu={(x, y) => onDependencyContextMenu?.(dep.id, x, y)}
              onHover={(isHovered) => onDependencyHover?.(isHovered ? dep.id : null)}
            />
          );
        }

        return (
          <DependencyLine
            key={dep.id}
            dependency={dep}
            fromPosition={fromPos}
            toPosition={toPos}
            isSelected={dep.id === selectedDependencyId}
            onClick={handleDependencyClick}
          />
        );
      })}

      {creatingDependency && (
        <CreatingDependencyLine state={creatingDependency} />
      )}
    </svg>
  );
};
