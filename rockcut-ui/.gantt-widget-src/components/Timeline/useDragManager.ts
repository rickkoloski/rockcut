import { useState, useCallback, useRef, useEffect } from 'react';
import type { TaskModel } from '../../models';
import { type DragType, calculateDraggedDates, snapToDay, type DraggedDates } from './dragUtils';

export interface DragState {
  isDragging: boolean;
  taskId: string | null;
  dragType: DragType | null;
  startX: number;
  currentX: number;
  deltaX: number;
  originalTask: TaskModel | null;
}

interface UseDragManagerOptions {
  pixelsPerDay: number;
  snapEnabled?: boolean;
  onDragEnd?: (taskId: string, newDates: DraggedDates) => void;
}

const initialState: DragState = {
  isDragging: false,
  taskId: null,
  dragType: null,
  startX: 0,
  currentX: 0,
  deltaX: 0,
  originalTask: null,
};

export function useDragManager(options: UseDragManagerOptions) {
  const { pixelsPerDay, snapEnabled = true, onDragEnd } = options;
  const [dragState, setDragState] = useState<DragState>(initialState);
  const stateRef = useRef(dragState);

  // Keep ref in sync for use in callbacks
  useEffect(() => {
    stateRef.current = dragState;
  }, [dragState]);

  const startDrag = useCallback(
    (clientX: number, taskId: string, dragType: DragType, task: TaskModel) => {
      setDragState({
        isDragging: true,
        taskId,
        dragType,
        startX: clientX,
        currentX: clientX,
        deltaX: 0,
        originalTask: task,
      });
    },
    []
  );

  const updateDrag = useCallback(
    (clientX: number) => {
      setDragState((prev) => {
        if (!prev.isDragging) return prev;

        let deltaX = clientX - prev.startX;

        // Snap to day boundaries
        if (snapEnabled) {
          deltaX = snapToDay(deltaX, pixelsPerDay);
        }

        return {
          ...prev,
          currentX: clientX,
          deltaX,
        };
      });
    },
    [pixelsPerDay, snapEnabled]
  );

  const endDrag = useCallback(() => {
    const state = stateRef.current;

    if (state.isDragging && state.taskId && state.originalTask && state.dragType) {
      const newDates = calculateDraggedDates(
        state.originalTask,
        state.deltaX,
        state.dragType,
        pixelsPerDay
      );

      if (newDates && state.deltaX !== 0) {
        onDragEnd?.(state.taskId, newDates);
      }
    }

    setDragState(initialState);
  }, [pixelsPerDay, onDragEnd]);

  const cancelDrag = useCallback(() => {
    setDragState(initialState);
  }, []);

  // Calculate preview position for a task during drag
  const getPreviewPosition = useCallback(
    (taskId: string, originalX: number, originalWidth: number) => {
      if (!dragState.isDragging || dragState.taskId !== taskId) {
        return null;
      }

      const { deltaX, dragType } = dragState;

      switch (dragType) {
        case 'move':
          return {
            x: originalX + deltaX,
            width: originalWidth,
          };
        case 'resize-start':
          return {
            x: originalX + deltaX,
            width: Math.max(pixelsPerDay, originalWidth - deltaX),
          };
        case 'resize-end':
          return {
            x: originalX,
            width: Math.max(pixelsPerDay, originalWidth + deltaX),
          };
        default:
          return null;
      }
    },
    [dragState, pixelsPerDay]
  );

  return {
    dragState,
    startDrag,
    updateDrag,
    endDrag,
    cancelDrag,
    getPreviewPosition,
  };
}
