import { useState, useCallback, useEffect, useRef } from 'react';
import type { DependencyStore } from '../stores';
import { DependencyModel, DependencyType } from '../models';
import { getDependencyTypeFromPoints } from '../utils';
import type { TaskBarPosition } from '../components/Timeline/types';

export interface CreatingDependencyState {
  fromTaskId: string;
  fromPosition: 'start' | 'end';
  fromPoint: { x: number; y: number };
  currentPoint: { x: number; y: number };
  targetTaskId?: string;
  targetPosition?: 'start' | 'end';
}

export interface UseDependencyCreationOptions {
  dependencyStore: DependencyStore;
  taskPositions: Map<string, TaskBarPosition>;
  containerRef: React.RefObject<HTMLElement | null>;
  scrollLeft?: number;
  scrollTop?: number;
  onDependencyCreated?: (fromId: string, toId: string, type: DependencyType) => void;
}

export function useDependencyCreation({
  dependencyStore,
  taskPositions,
  containerRef,
  scrollLeft = 0,
  scrollTop = 0,
  onDependencyCreated,
}: UseDependencyCreationOptions) {
  const [creating, setCreating] = useState<CreatingDependencyState | null>(null);

  // Use a ref to track the latest creating state synchronously
  // This is needed because mouseup can fire before React re-renders with the new state
  const creatingRef = useRef<CreatingDependencyState | null>(null);

  const startCreating = useCallback(
    (taskId: string, position: 'start' | 'end', x: number, y: number) => {
      const newState: CreatingDependencyState = {
        fromTaskId: taskId,
        fromPosition: position,
        fromPoint: { x, y },
        currentPoint: { x, y },
      };
      creatingRef.current = newState;
      setCreating(newState);
    },
    []
  );

  const findTaskAtPosition = useCallback(
    (x: number, y: number): { taskId: string; position: 'start' | 'end' } | null => {
      for (const [taskId, pos] of taskPositions.entries()) {
        // Check if y is within the task's vertical bounds
        const topY = pos.y;
        const bottomY = pos.y + pos.height;

        if (y >= topY && y <= bottomY) {
          // Check if x is near the start or end
          const startX = pos.x;
          const endX = pos.x + pos.width;
          const startDist = Math.abs(x - startX);
          const endDist = Math.abs(x - endX);

          if (startDist <= 20 || endDist <= 20) {
            return {
              taskId,
              position: startDist < endDist ? 'start' : 'end',
            };
          }

          // Check if within the bar
          if (x >= startX && x <= endX) {
            const midX = (startX + endX) / 2;
            return { taskId, position: (x < midX ? 'start' : 'end') as 'start' | 'end' };
          }
        }
      }
      return null;
    },
    [taskPositions]
  );

  const cancelCreating = useCallback(() => {
    creatingRef.current = null;
    setCreating(null);
  }, []);

  const finishCreating = useCallback(() => {
    // Use ref to get the latest state (avoids stale closure issue with async state updates)
    const current = creatingRef.current;
    if (!current?.targetTaskId || current.fromTaskId === current.targetTaskId) {
      creatingRef.current = null;
      setCreating(null);
      return;
    }

    const type = getDependencyTypeFromPoints(
      current.fromPosition,
      current.targetPosition || 'start'
    );

    // Check for existing dependency
    const existing = dependencyStore.getDependenciesBetween(
      current.fromTaskId,
      current.targetTaskId
    );

    if (!existing) {
      // Also check reverse direction
      const existingReverse = dependencyStore.getDependenciesBetween(
        current.targetTaskId,
        current.fromTaskId
      );

      if (!existingReverse) {
        const newDep = DependencyModel.create({
          fromTask: current.fromTaskId,
          toTask: current.targetTaskId,
          type,
        });

        dependencyStore.add(newDep);
        onDependencyCreated?.(current.fromTaskId, current.targetTaskId, type);
      }
    }

    creatingRef.current = null;
    setCreating(null);
  }, [dependencyStore, onDependencyCreated]);

  // Handle mouse events
  useEffect(() => {
    if (!creating) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left + scrollLeft;
      const y = e.clientY - rect.top + scrollTop;

      const target = findTaskAtPosition(x, y);

      // Update ref BEFORE setCreating to ensure finishCreating sees latest state
      // (React's state updater callback may not run before mouseup fires)
      if (creatingRef.current) {
        creatingRef.current = {
          ...creatingRef.current,
          currentPoint: { x, y },
          targetTaskId: target?.taskId,
          targetPosition: target?.position,
        };
      }

      setCreating((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          currentPoint: { x, y },
          targetTaskId: target?.taskId,
          targetPosition: target?.position,
        };
      });
    };

    const handleMouseUp = () => {
      finishCreating();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelCreating();
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [creating, containerRef, scrollLeft, scrollTop, findTaskAtPosition, finishCreating, cancelCreating]);

  return {
    creating,
    startCreating,
    cancelCreating,
    isCreating: creating !== null,
  };
}
