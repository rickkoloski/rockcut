import { DependencyType } from '../models';

export interface TaskPosition {
  taskId: string;
  row: number;
  startX: number;
  endX: number;
  centerY: number;
  topY: number;
  bottomY: number;
}

export interface DependencyRoutingConfig {
  stubLength: number;
  arrowSize: number;
  minGap: number;
}

export const DEFAULT_ROUTING_CONFIG: DependencyRoutingConfig = {
  stubLength: 12,
  arrowSize: 6,
  minGap: 20,
};

export interface PathResult {
  path: string;
  arrowPoint: { x: number; y: number };
  arrowDirection: 'left' | 'right';
  diagnostics: PathDiagnostics;
}

export interface PathDiagnostics {
  algorithm: 'simple' | 'complex-between' | 'complex-around';
  horizontalGap: number;
  sourceRow: number;
  targetRow: number;
}

/**
 * Calculate dependency path based on type using three-tier routing algorithm
 */
export function calculateDependencyPath(
  from: TaskPosition,
  to: TaskPosition,
  type: DependencyType,
  config: DependencyRoutingConfig = DEFAULT_ROUTING_CONFIG
): PathResult {
  switch (type) {
    case DependencyType.FinishToStart:
      return calculateFSPath(from, to, config);
    case DependencyType.StartToStart:
      return calculateSSPath(from, to, config);
    case DependencyType.FinishToFinish:
      return calculateFFPath(from, to, config);
    case DependencyType.StartToEnd:
      return calculateSFPath(from, to, config);
    default:
      return calculateFSPath(from, to, config);
  }
}

/**
 * Finish-to-Start: Source right edge → Target left edge
 * Uses three-tier routing: simple → between → around
 */
function calculateFSPath(
  from: TaskPosition,
  to: TaskPosition,
  config: DependencyRoutingConfig
): PathResult {
  const { stubLength, minGap } = config;

  const sourceX = from.endX;
  const sourceY = from.centerY;
  const targetX = to.startX;
  const targetY = to.centerY;

  const horizontalGap = targetX - sourceX;
  const exitX = sourceX + stubLength;
  const entryX = targetX - stubLength;

  let path: string;
  let algorithm: PathDiagnostics['algorithm'];

  if (horizontalGap >= minGap) {
    // Strategy 1: Simple routing - enough horizontal space
    algorithm = 'simple';
    const midX = sourceX + horizontalGap / 2;

    path = [
      `M ${sourceX} ${sourceY}`,
      `L ${exitX} ${sourceY}`,
      `L ${midX} ${sourceY}`,
      `L ${midX} ${targetY}`,
      `L ${entryX} ${targetY}`,
      `L ${targetX} ${targetY}`,
    ].join(' ');
  } else if (from.row !== to.row) {
    // Strategy 2: Complex - between bars (different rows)
    algorithm = 'complex-between';
    const bypassY = (sourceY + targetY) / 2;

    path = [
      `M ${sourceX} ${sourceY}`,
      `L ${exitX} ${sourceY}`,
      `L ${exitX} ${bypassY}`,
      `L ${entryX} ${bypassY}`,
      `L ${entryX} ${targetY}`,
      `L ${targetX} ${targetY}`,
    ].join(' ');
  } else {
    // Strategy 3: Complex - around bar (same row)
    algorithm = 'complex-around';
    const rowHeight = 40; // Standard row height
    const barPadding = 8;
    const bypassY = sourceY + rowHeight / 2 + barPadding;

    path = [
      `M ${sourceX} ${sourceY}`,
      `L ${exitX} ${sourceY}`,
      `L ${exitX} ${bypassY}`,
      `L ${entryX} ${bypassY}`,
      `L ${entryX} ${targetY}`,
      `L ${targetX} ${targetY}`,
    ].join(' ');
  }

  return {
    path,
    arrowPoint: { x: targetX, y: targetY },
    arrowDirection: 'right',
    diagnostics: {
      algorithm,
      horizontalGap,
      sourceRow: from.row,
      targetRow: to.row,
    },
  };
}

/**
 * Start-to-Start: Source left edge → Target left edge
 * Routes via the left side
 */
function calculateSSPath(
  from: TaskPosition,
  to: TaskPosition,
  config: DependencyRoutingConfig
): PathResult {
  const { stubLength } = config;

  const sourceX = from.startX;
  const sourceY = from.centerY;
  const targetX = to.startX;
  const targetY = to.centerY;

  // Go left to the minimum X, then vertical, then right
  const minX = Math.min(sourceX, targetX) - stubLength;

  const path = [
    `M ${sourceX} ${sourceY}`,
    `L ${minX} ${sourceY}`,
    `L ${minX} ${targetY}`,
    `L ${targetX} ${targetY}`,
  ].join(' ');

  return {
    path,
    arrowPoint: { x: targetX, y: targetY },
    arrowDirection: 'right',
    diagnostics: {
      algorithm: 'simple',
      horizontalGap: Math.abs(targetX - sourceX),
      sourceRow: from.row,
      targetRow: to.row,
    },
  };
}

/**
 * Finish-to-Finish: Source right edge → Target right edge
 * Routes via the right side
 */
function calculateFFPath(
  from: TaskPosition,
  to: TaskPosition,
  config: DependencyRoutingConfig
): PathResult {
  const { stubLength } = config;

  const sourceX = from.endX;
  const sourceY = from.centerY;
  const targetX = to.endX;
  const targetY = to.centerY;

  // Go right to the maximum X, then vertical, then left
  const maxX = Math.max(sourceX, targetX) + stubLength;

  const path = [
    `M ${sourceX} ${sourceY}`,
    `L ${maxX} ${sourceY}`,
    `L ${maxX} ${targetY}`,
    `L ${targetX} ${targetY}`,
  ].join(' ');

  return {
    path,
    arrowPoint: { x: targetX, y: targetY },
    arrowDirection: 'left',
    diagnostics: {
      algorithm: 'simple',
      horizontalGap: Math.abs(targetX - sourceX),
      sourceRow: from.row,
      targetRow: to.row,
    },
  };
}

/**
 * Start-to-Finish (SF): Source left edge → Target right edge
 * Routes left from source, right to target
 */
function calculateSFPath(
  from: TaskPosition,
  to: TaskPosition,
  config: DependencyRoutingConfig
): PathResult {
  const { stubLength } = config;

  const sourceX = from.startX;
  const sourceY = from.centerY;
  const targetX = to.endX;
  const targetY = to.centerY;

  const leftX = sourceX - stubLength;
  const rightX = targetX + stubLength;
  const midY = (sourceY + targetY) / 2;

  const path = [
    `M ${sourceX} ${sourceY}`,
    `L ${leftX} ${sourceY}`,
    `L ${leftX} ${midY}`,
    `L ${rightX} ${midY}`,
    `L ${rightX} ${targetY}`,
    `L ${targetX} ${targetY}`,
  ].join(' ');

  return {
    path,
    arrowPoint: { x: targetX, y: targetY },
    arrowDirection: 'left',
    diagnostics: {
      algorithm: 'simple',
      horizontalGap: Math.abs(targetX - sourceX),
      sourceRow: from.row,
      targetRow: to.row,
    },
  };
}

/**
 * Get arrowhead polygon points
 */
export function getArrowheadPoints(
  x: number,
  y: number,
  direction: 'left' | 'right',
  size: number = 6
): string {
  if (direction === 'right') {
    // Arrow pointing right →
    return `${x},${y} ${x - size},${y - size / 2} ${x - size},${y + size / 2}`;
  } else {
    // Arrow pointing left ←
    return `${x},${y} ${x + size},${y - size / 2} ${x + size},${y + size / 2}`;
  }
}

/**
 * Determine dependency type from connection points
 */
export function getDependencyTypeFromPoints(
  fromPosition: 'start' | 'end',
  toPosition: 'start' | 'end'
): DependencyType {
  if (fromPosition === 'end' && toPosition === 'start') return DependencyType.FinishToStart;
  if (fromPosition === 'start' && toPosition === 'start') return DependencyType.StartToStart;
  if (fromPosition === 'end' && toPosition === 'end') return DependencyType.FinishToFinish;
  if (fromPosition === 'start' && toPosition === 'end') return DependencyType.StartToEnd;
  return DependencyType.FinishToStart; // Default
}

/**
 * Convert TaskBarPosition to TaskPosition for routing
 */
export function toTaskPosition(
  pos: { taskId: string; x: number; y: number; width: number; height: number; rowIndex: number }
): TaskPosition {
  return {
    taskId: pos.taskId,
    row: pos.rowIndex,
    startX: pos.x,
    endX: pos.x + pos.width,
    centerY: pos.y + pos.height / 2,
    topY: pos.y,
    bottomY: pos.y + pos.height,
  };
}
