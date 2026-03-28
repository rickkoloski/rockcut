import React from 'react';
import type { AssignmentStore } from '../../stores/AssignmentStore';
import type { ResourceStore } from '../../stores/ResourceStore';
import { Tooltip } from '../common';

export interface ResourceCellProps {
  taskId: string;
  assignmentStore: AssignmentStore;
  resourceStore: ResourceStore;
  showUnits?: boolean;
  maxVisible?: number;
}

export function ResourceCell({
  taskId,
  assignmentStore,
  resourceStore,
  showUnits = true,
  maxVisible = 2,
}: ResourceCellProps) {
  const assignments = assignmentStore.getByTaskId(taskId);

  if (assignments.length === 0) {
    return (
      <div
        className="resource-cell text-[var(--color-text-muted)]"
        data-testid="resource-cell-empty"
      >
        -
      </div>
    );
  }

  // Get resource names for tooltip
  const resourceNames = assignments
    .map((a) => resourceStore.getById(a.resourceId)?.name)
    .filter(Boolean);

  const visibleAssignments = assignments.slice(0, maxVisible);
  const hiddenCount = assignments.length - maxVisible;
  const needsTooltip = assignments.length > maxVisible;

  const tooltipContent = resourceNames.join(', ');

  return (
    <Tooltip content={tooltipContent} disabled={!needsTooltip}>
      <div className="resource-cell flex flex-wrap gap-1 overflow-hidden" data-testid="resource-cell">
        {visibleAssignments.map((assignment) => {
          const resource = resourceStore.getById(assignment.resourceId);
          if (!resource) return null;

          const showPct = showUnits && assignment.units !== 100;

          return (
            <span
              key={assignment.id}
              className="resource-tag inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
              style={resource.color ? { backgroundColor: resource.color + '20', color: resource.color } : undefined}
              data-testid="resource-tag"
            >
              {resource.name}
              {showPct && <span className="ml-0.5 opacity-70">({assignment.units}%)</span>}
            </span>
          );
        })}
        {hiddenCount > 0 && (
          <span className="text-xs text-[var(--color-text-muted)]" data-testid="resource-overflow">
            +{hiddenCount}
          </span>
        )}
      </div>
    </Tooltip>
  );
}
