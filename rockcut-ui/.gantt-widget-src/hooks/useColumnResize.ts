import { useState, useCallback } from 'react';

interface ResizeState {
  columnId: string;
  startX: number;
  startWidth: number;
}

export interface UseColumnResizeOptions {
  onResize: (columnId: string, width: number) => void;
}

export function useColumnResize({ onResize }: UseColumnResizeOptions) {
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);

  const handleResizeStart = useCallback((columnId: string, startX: number, startWidth: number) => {
    setResizeState({ columnId, startX, startWidth });
  }, []);

  const handleResizeMove = useCallback((currentX: number) => {
    if (!resizeState) return;

    const deltaX = currentX - resizeState.startX;
    const newWidth = resizeState.startWidth + deltaX;
    onResize(resizeState.columnId, newWidth);
  }, [resizeState, onResize]);

  const handleResizeEnd = useCallback(() => {
    setResizeState(null);
  }, []);

  return {
    isResizing: !!resizeState,
    resizingColumnId: resizeState?.columnId || null,
    handleResizeStart,
    handleResizeMove,
    handleResizeEnd,
  };
}
